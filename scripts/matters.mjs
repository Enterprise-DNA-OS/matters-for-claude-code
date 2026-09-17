#!/usr/bin/env node
// matters-for-claude-code: the one CLI. Claude Code slash commands call this;
// so can you.
//
//   node scripts/matters.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system records the matters, parties, conflicts, time, WIP, invoices,
// key dates and undertakings a law firm runs on every week. It has NO trust
// accounting, deliberately: trust money lives in an audited trust account
// system under the Lawyers and Conveyancers Act 2006. Invoices here are the
// firm's own fee records, and nothing here files anything at a court or
// registry.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, hours, isoDate, short, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set([
  'json', 'help', 'all', 'dry-run', 'force', 'na', 'open', 'closed', 'no-charge', 'write-off',
]);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));

// ---------------------------------------------------------------------------
// Dates, money, minutes

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand and Australian exports write DD/MM/YYYY, so the first number
  // is the day unless the second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

function parseMoney(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not an amount.`);
  return Math.round(n * 100);
}

// "1.5", "1.5h", "90m" or "1:30" all mean ninety minutes. Time is recorded the
// way people say it and stored the way arithmetic wants it.
function parseMinutes(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const s = String(v).trim().toLowerCase();
  const clock = s.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const m = s.match(/^([\d.]+)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?$/);
  if (!m) throw new CliError(`"${v}" is not a duration. Use 1.5h, 90m or 1:30.`);
  const n = Number(m[1]);
  if (Number.isNaN(n) || n <= 0) throw new CliError(`"${v}" is not a duration. Use 1.5h, 90m or 1:30.`);
  if (m[2] && m[2].startsWith('m')) return Math.round(n);
  // A bare number of 20 or more is minutes: nobody records a twenty hour entry
  // without saying so.
  if (!m[2] && n >= 20) return Math.round(n);
  return Math.round(n * 60);
}

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact ref, name or number,
// then contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  client: {
    from: 'clients c left join lawyers a on a.id = c.lawyer_id',
    cols: 'c.*, a.full_name as lawyer_name',
    exact: "lower(c.name) = lower($1) or lower(coalesce(c.email, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.name ilike $1 or c.email ilike $1',
    label: (r) => `${r.name}${r.client_type === 'individual' ? '' : ` (${r.client_type})`}`,
    order: 'c.name',
    listing: 'clients --all',
  },
  lawyer: {
    from: 'lawyers c',
    cols: 'c.*',
    exact: "lower(c.full_name) = lower($1) or lower(coalesce(c.code, '')) = lower($1) or lower(coalesce(c.email, '')) = lower($1)",
    fuzzy: 'c.full_name ilike $1 or c.code ilike $1',
    label: (r) => `${r.full_name} (${r.role})`,
    order: 'c.full_name',
    listing: 'lawyers',
  },
  matter: {
    from: 'matters c join clients cl on cl.id = c.client_id left join lawyers a on a.id = c.lawyer_id',
    cols: 'c.*, cl.name as client_name, cl.cdd_completed_on, a.full_name as lawyer_name',
    exact: "lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.ref ilike $1 or cl.name ilike $1 or c.description ilike $1',
    label: (r) => `${r.ref}  ${r.client_name}: ${truncate(r.description, 44)} (${r.status})`,
    order: 'c.opened_on desc',
    listing: 'matters --all',
  },
  invoice: {
    from: 'invoices c join matters m on m.id = c.matter_id join clients cl on cl.id = c.client_id',
    cols: 'c.*, m.ref as matter_ref, cl.name as client_name',
    exact: "lower(coalesce(c.number, '')) = lower($1)",
    fuzzy: 'c.number ilike $1 or cl.name ilike $1 or m.ref ilike $1',
    label: (r) => `${r.number}  ${r.client_name} ${money(r.total_cents)} (${r.status})`,
    order: 'c.issued_on desc',
    listing: 'debtors',
  },
  undertaking: {
    from: 'undertakings c join matters m on m.id = c.matter_id',
    cols: 'c.*, m.ref as matter_ref',
    exact: 'false',
    fuzzy: 'c.undertaking ilike $1 or c.given_to ilike $1 or m.ref ilike $1',
    label: (r) => `${short(r.id)}  ${r.matter_ref} to ${r.given_to}: ${truncate(r.undertaking, 44)}${r.discharged_on ? ' (discharged)' : ''}`,
    order: 'c.given_on desc',
    listing: 'undertakings --all',
  },
  'key-date': {
    from: 'key_dates c join matters m on m.id = c.matter_id',
    cols: 'c.*, m.ref as matter_ref',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or m.ref ilike $1',
    label: (r) => `${short(r.id)}  ${r.matter_ref} ${r.kind} ${isoDate(r.due_on)}: ${truncate(r.title, 40)}${r.completed_on ? ' (done)' : ''}`,
    order: 'c.due_on',
    listing: 'key-dates --all',
  },
  task: {
    from: 'tasks c left join clients cl on cl.id = c.client_id',
    cols: 'c.*, cl.name as client_name',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or cl.name ilike $1',
    label: (r) => `${short(r.id)}  ${truncate(r.title, 50)} (${r.status})`,
    order: 'c.due_on',
    listing: 'tasks --all',
  },
};

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, reference or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length && spec.exact !== 'false') rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind} records. Use a reference, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

// The person doing the work: --lawyer, MATTERS_LAWYER, or the only active lawyer.
async function whoIs(db, flags, { optional = true } = {}) {
  const named = flags.lawyer || process.env.MATTERS_LAWYER;
  if (named && named !== true) return resolve(db, 'lawyer', named);
  const rows = await db.query('select * from lawyers where active order by full_name');
  if (rows.length === 1) return rows[0];
  if (optional) return null;
  if (!rows.length) throw new CliError('No lawyers on file. Add one: add lawyer "<name>" --rate=');
  throw new CliError(
    'Several people work here. Pass --lawyer= (or set MATTERS_LAWYER):\n' +
      rows.map((r) => `  ${r.code || short(r.id)}  ${r.full_name}`).join('\n'),
  );
}

// The six records the client care file carries on every matter, created as
// "missing" because this system will not call a file complete on no evidence.
const RECORD_KINDS = [
  ['letter of engagement', 'Conduct and Client Care Rules 2008, rr 3.4 and 3.5: client care and service information in writing, in advance'],
  ['scope of the retainer', 'Conduct and Client Care Rules 2008, r 3.5: the principal aspects of the service, recorded'],
  ['fee information', 'Conduct and Client Care Rules 2008, r 3.5: the basis on which fees will be charged, given in advance'],
  ['conflict check', 'Conduct and Client Care Rules 2008, rr 5.4 and 6.1: no acting where interests conflict, checked before the retainer'],
  ['AML/CFT customer due diligence', 'AML/CFT Act 2009, ss 11 to 16: CDD before the business relationship (law firms captured since 1 July 2018)'],
  ['record of instructions', 'Conduct and Client Care Rules 2008, r 3: an attendance note of what the client actually asked for'],
];

async function createMatterRecords(db, matterId) {
  for (const [kind, standard] of RECORD_KINDS) {
    await db.query(
      "insert into matter_records (matter_id, kind, standard, status) values ($1, $2, $3, 'missing') on conflict do nothing",
      [matterId, kind, standard],
    );
  }
}

async function nextRef(db, table, column, prefix, start) {
  const [row] = await db.query(
    `select max(cast(substring(${column} from ${prefix.length + 1}) as integer)) as n
     from ${table} where ${column} ~ ('^' || $1 || '[0-9]+$')`,
    [prefix],
  );
  return `${prefix}${Math.max(num(row?.n), start - 1) + 1}`;
}

// The conflict search itself: one name, checked against clients, parties and
// matter descriptions, case-insensitively, forever. Every hit is a line.
async function conflictSearch(db, name) {
  const q = `%${String(name).trim()}%`;
  const clients = await db.query(
    `select c.name, c.client_type, c.status,
            (select count(*) from matters m where m.client_id = c.id) as matters
     from clients c where c.name ilike $1 order by c.name`,
    [q],
  );
  const parties = await db.query(
    `select p.name, p.role, m.ref, m.status as matter_status, cl.name as client, m.description
     from parties p join matters m on m.id = p.matter_id join clients cl on cl.id = m.client_id
     where p.name ilike $1 order by m.opened_on desc`,
    [q],
  );
  const mentions = await db.query(
    `select m.ref, m.status, cl.name as client, m.description
     from matters m join clients cl on cl.id = m.client_id
     where m.description ilike $1 order by m.opened_on desc`,
    [q],
  );
  return { clients, parties, mentions, hits: clients.length + parties.length + mentions.length };
}

// ---------------------------------------------------------------------------
// Reads: the practice

async function cmdClients(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("p.status = 'active'");
  if (flags.lawyer && flags.lawyer !== true) {
    const a = await resolve(db, 'lawyer', flags.lawyer);
    params.push(a.full_name);
    where.push(`p.lawyer = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`p.client ilike $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_client_position p ${where.length ? 'where ' + where.join(' and ') : ''} order by (p.wip_cents + p.owing_cents) desc, p.client`,
    params.length ? params : [],
  );
  for (const r of rows) r.lockup_cents = num(r.wip_cents) + num(r.owing_cents);
  const text =
    heading(`Clients (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'client', label: 'Client', width: 28 },
      { key: 'client_type', label: 'Type' },
      { key: 'lawyer', label: 'Lawyer', width: 16 },
      { key: 'open_matters', label: 'Open', align: 'right', format: (v) => (num(v) ? v : '') },
      { key: 'wip_cents', label: 'WIP', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'owing_cents', label: 'Owing', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'lifetime_paid_cents', label: 'Paid ever', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'last_contact_on', label: 'Last contact', format: (v) => isoDate(v) || 'never' },
      { key: 'cdd_completed_on', label: 'CDD', format: (v) => (v ? isoDate(v) : 'MISSING') },
    ]);
  return { text, json: rows };
}

async function cmdClient(db, args) {
  const c = await resolve(db, 'client', args.join(' '));
  const [position] = await db.query('select * from v_client_position where client_id = $1', [c.id]);
  const matters = await db.query(
    `select v.* from v_matters v where v.client_id = $1 order by (v.status = 'open') desc, v.opened_on desc`,
    [c.id],
  );
  const invoices = await db.query(
    `select i.number, m.ref, i.issued_on, i.due_on, i.total_cents, i.status, i.paid_on
     from invoices i join matters m on m.id = i.matter_id where i.client_id = $1 order by i.issued_on desc limit 8`,
    [c.id],
  );
  const notes = await db.query(
    `select fn.noted_on, fn.channel, fn.note, coalesce(a.full_name, '') as lawyer, coalesce(m.ref, '') as ref
     from file_notes fn left join lawyers a on a.id = fn.lawyer_id left join matters m on m.id = fn.matter_id
     where fn.client_id = $1 order by fn.noted_on desc limit 8`,
    [c.id],
  );
  let text = heading(`${c.name} (${c.client_type}, ${c.status})`);
  text += `\n  Lawyer: ${c.lawyer_name || 'unassigned'}    Referred by: ${c.referred_by || 'not recorded'}    ${c.email || ''} ${c.phone || ''}`;
  text += `\n  CDD: ${c.cdd_completed_on ? `${isoDate(c.cdd_completed_on)} (${c.cdd_type || 'standard'})` : 'MISSING (AML/CFT Act 2009: complete it before the retainer proceeds)'}`;
  if (position) {
    text += `\n  ${position.open_matters} open matter(s) of ${position.all_matters}. WIP ${money(position.wip_cents)}, owing ${money(position.owing_cents)}, paid ever ${money(position.lifetime_paid_cents)}.`;
    text += ` Last contact: ${isoDate(position.last_contact_on) || 'never'}.`;
  }
  if (matters.length) {
    text += '\n' + heading('Matters') + '\n' + table(matters, [
      { key: 'ref', label: 'Ref' },
      { key: 'matter_type', label: 'Type' },
      { key: 'description', label: 'Matter', width: 44 },
      { key: 'status', label: 'Status' },
      { key: 'opened_on', label: 'Opened', format: isoDate },
      { key: 'wip_cents', label: 'WIP', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'next_key_date_on', label: 'Next date', format: isoDate },
      { key: 'record_gaps', label: 'File', align: 'right', format: (v) => (num(v) ? `gaps: ${v}` : 'ok') },
    ]);
  }
  if (invoices.length) {
    text += '\n' + heading('Invoices') + '\n' + table(invoices, [
      { key: 'number', label: 'Invoice' },
      { key: 'ref', label: 'Matter' },
      { key: 'issued_on', label: 'Issued', format: isoDate },
      { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status', format: (v, r) => (v === 'paid' ? `paid ${isoDate(r.paid_on)}` : v) },
      { key: 'due_on', label: 'Due', format: isoDate },
    ]);
  }
  if (notes.length) {
    text += '\n' + heading('File notes') + '\n' + table(notes, [
      { key: 'noted_on', label: 'Date', format: isoDate },
      { key: 'ref', label: 'Matter' },
      { key: 'channel', label: 'How' },
      { key: 'lawyer', label: 'Who', width: 15 },
      { key: 'note', label: 'Note', width: 64 },
    ]);
  }
  return { text, json: { client: c, position, matters, invoices, notes } };
}

async function cmdLawyers(db) {
  const rows = await db.query(`
    select a.full_name, a.code, a.role, a.rate_cents, a.practising_cert, a.pc_expires_on, a.active,
      (select count(*) from matters m where m.lawyer_id = a.id and m.status = 'open') as open_matters,
      (select coalesce(sum(w.wip_cents), 0) from v_wip w join matters m on m.id = w.matter_id where m.lawyer_id = a.id and m.status = 'open') as wip_cents,
      (select count(*) from undertakings u where u.lawyer_id = a.id and u.discharged_on is null) as open_undertakings,
      (select min(k.due_on) from key_dates k join matters m on m.id = k.matter_id where m.lawyer_id = a.id and k.completed_on is null and m.status = 'open') as next_key_date
    from lawyers a order by a.active desc, a.full_name`);
  const text =
    heading('The fee earners') +
    '\n' +
    table(rows, [
      { key: 'full_name', label: 'Lawyer' },
      { key: 'code', label: 'Code' },
      { key: 'role', label: 'Role', width: 18 },
      { key: 'rate_cents', label: 'Rate/h', align: 'right', format: (v) => money(v) },
      { key: 'practising_cert', label: 'Cert', format: (v, r) => (r.role === 'legal executive' ? 'n/a' : v || 'MISSING') },
      { key: 'pc_expires_on', label: 'Expires', format: (v, r) => (r.role === 'legal executive' ? '' : isoDate(v)) },
      { key: 'open_matters', label: 'Matters', align: 'right' },
      { key: 'wip_cents', label: 'WIP', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'open_undertakings', label: 'Undert.', align: 'right', format: (v) => (num(v) ? v : '') },
      { key: 'next_key_date', label: 'Next date', format: isoDate },
    ]);
  return { text, json: rows };
}

async function cmdMatters(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("v.status = 'open'");
  if (flags.type && flags.type !== true) {
    params.push(String(flags.type).toLowerCase());
    where.push(`v.matter_type = $${params.length}`);
  }
  if (flags.lawyer && flags.lawyer !== true) {
    const a = await resolve(db, 'lawyer', flags.lawyer);
    params.push(a.full_name);
    where.push(`v.lawyer = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(v.client ilike $${params.length} or v.description ilike $${params.length} or v.ref ilike $${params.length})`);
  }
  const rows = await db.query(
    `select * from v_matters v ${where.length ? 'where ' + where.join(' and ') : ''}
     order by v.next_key_date_on nulls last, v.days_since_activity desc nulls last`,
    params,
  );
  const wip = rows.reduce((a, r) => a + num(r.wip_cents), 0);
  let text = heading(`Matters (${rows.length}${flags.all ? '' : ' open'}, ${money(wip)} WIP)`);
  text += '\n' + table(rows, [
    { key: 'ref', label: 'Ref' },
    { key: 'client', label: 'Client', width: 24 },
    { key: 'matter_type', label: 'Type' },
    { key: 'description', label: 'Matter', width: 40 },
    { key: 'lawyer', label: 'Lawyer', width: 14 },
    { key: 'wip_cents', label: 'WIP', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'over_estimate', label: 'Estimate', format: (v, r) => (v ? 'OVER' : (r.estimate_cents ? 'ok' : '')) },
    { key: 'next_key_date_on', label: 'Next date', format: (v, r) => (v ? `${isoDate(v)} ${truncate(r.next_key_date || '', 20)}` : ''), width: 32 },
    { key: 'days_since_activity', label: 'Quiet', align: 'right', format: (v) => (v === null ? 'ALL' : (num(v) > 30 ? `${v}d` : '')) },
    { key: 'record_gaps', label: 'File', align: 'right', format: (v) => (num(v) ? `gaps: ${v}` : 'ok') },
  ]);
  return { text, json: rows };
}

async function cmdMatter(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'open') return matterOpen(db, args.slice(1), flags);
  if (sub === 'close') return matterClose(db, args.slice(1), flags);

  const m = await resolve(db, 'matter', args.join(' '));
  const [v] = await db.query('select * from v_matters where matter_id = $1', [m.id]);
  const parties = await db.query('select * from parties where matter_id = $1 order by role, name', [m.id]);
  const file = await db.query('select * from matter_records where matter_id = $1 order by kind', [m.id]);
  const dates = await db.query('select * from key_dates where matter_id = $1 order by due_on', [m.id]);
  const uts = await db.query('select * from undertakings where matter_id = $1 order by discharged_on nulls first, due_on', [m.id]);
  const time = await db.query(
    `select t.worked_on, t.minutes, t.description, t.billable, t.rate_cents, t.status, coalesce(a.full_name, '') as lawyer
     from time_entries t left join lawyers a on a.id = t.lawyer_id where t.matter_id = $1 order by t.worked_on desc limit 12`,
    [m.id],
  );
  const disb = await db.query('select * from disbursements where matter_id = $1 order by incurred_on desc', [m.id]);
  const invoices = await db.query('select * from invoices where matter_id = $1 order by issued_on desc', [m.id]);
  const notes = await db.query(
    `select fn.noted_on, fn.channel, fn.note, coalesce(a.full_name, '') as lawyer
     from file_notes fn left join lawyers a on a.id = fn.lawyer_id where fn.matter_id = $1 order by fn.noted_on desc limit 6`,
    [m.id],
  );

  let text = heading(`${m.ref}  ${m.client_name}: ${m.description} (${m.status})`);
  text += `\n  ${m.matter_type}, ${m.billing_type === 'fixed' ? `fixed fee ${money(m.fixed_fee_cents)}` : 'hourly'}. Lawyer: ${m.lawyer_name || 'unassigned'}. Opened ${isoDate(m.opened_on)}${m.closed_on ? `, closed ${isoDate(m.closed_on)}` : ''}.`;
  if (v) {
    text += `\n  WIP ${money(v.wip_cents)}${m.estimate_cents ? ` against an estimate of ${money(m.estimate_cents)}${v.over_estimate ? ' (OVER: tell the client before the bill does)' : ''}` : ''}.`;
    text += ` Last activity: ${isoDate(v.last_activity_on) || 'none recorded'}.`;
  }
  if (!m.cdd_completed_on) text += '\n  CDD: MISSING on this client (AML/CFT Act 2009). Record it: cdd "' + m.client_name + '" --on=';
  if (parties.length) {
    text += '\n' + heading('Parties') + '\n' + table(parties, [
      { key: 'name', label: 'Name', width: 30 },
      { key: 'role', label: 'Role' },
      { key: 'note', label: 'Note', width: 52 },
    ]);
  }
  text += '\n' + heading('The client care file') + '\n' + table(file, [
    { key: 'kind', label: 'Record', width: 34 },
    { key: 'status', label: 'Status', format: (v) => (v === 'missing' ? 'MISSING' : v) },
    { key: 'done_on', label: 'Done', format: isoDate },
    { key: 'note', label: 'Note', width: 48 },
  ]);
  if (dates.length) {
    text += '\n' + heading('Key dates') + '\n' + table(dates, [
      { key: 'kind', label: 'Kind' },
      { key: 'title', label: 'What', width: 48 },
      { key: 'due_on', label: 'Due', format: isoDate },
      { key: 'completed_on', label: 'Status', format: (v, r) => (v ? `done ${isoDate(v)}` : (isoDate(r.due_on) < today() ? 'MISSED' : `${Math.ceil((new Date(isoDate(r.due_on)) - new Date(today())) / 86400000)}d away`)) },
    ]);
  }
  if (uts.length) {
    text += '\n' + heading('Undertakings') + '\n' + table(uts, [
      { key: 'given_on', label: 'Given', format: isoDate },
      { key: 'given_to', label: 'To', width: 22 },
      { key: 'undertaking', label: 'Undertaking', width: 50 },
      { key: 'due_on', label: 'Due', format: isoDate },
      { key: 'discharged_on', label: 'Status', format: (v, r) => (v ? `discharged ${isoDate(v)}` : (r.due_on && isoDate(r.due_on) < today() ? 'OVERDUE' : 'open')) },
    ]);
  }
  if (time.length) {
    text += '\n' + heading('Time (latest)') + '\n' + table(time, [
      { key: 'worked_on', label: 'Date', format: isoDate },
      { key: 'lawyer', label: 'Who', width: 15 },
      { key: 'minutes', label: 'Time', align: 'right', format: (v) => hours(v) },
      { key: 'description', label: 'What', width: 48 },
      { key: 'status', label: 'Status', format: (v, r) => (r.billable ? v : 'no charge') },
    ]);
  }
  if (disb.length) {
    text += '\n' + heading('Disbursements') + '\n' + table(disb, [
      { key: 'incurred_on', label: 'Date', format: isoDate },
      { key: 'description', label: 'What', width: 44 },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status' },
    ]);
  }
  if (invoices.length) {
    text += '\n' + heading('Invoices') + '\n' + table(invoices, [
      { key: 'number', label: 'Invoice' },
      { key: 'issued_on', label: 'Issued', format: isoDate },
      { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
      { key: 'status', label: 'Status', format: (v, r) => (v === 'paid' ? `paid ${isoDate(r.paid_on)}` : v) },
    ]);
  }
  if (notes.length) {
    text += '\n' + heading('File notes') + '\n' + table(notes, [
      { key: 'noted_on', label: 'Date', format: isoDate },
      { key: 'channel', label: 'How' },
      { key: 'lawyer', label: 'Who', width: 15 },
      { key: 'note', label: 'Note', width: 64 },
    ]);
  }
  return { text, json: { matter: m, position: v, parties, file, key_dates: dates, undertakings: uts, time, disbursements: disb, invoices, notes } };
}

// ---------------------------------------------------------------------------
// Writes: matters

async function matterOpen(db, args, flags) {
  const c = await resolve(db, 'client', args.join(' '));
  const about = str(flags.about) || str(flags.description);
  if (!about) throw new CliError('What is the matter? --about="Sale of 8 Marine Parade"');
  const type = str(flags.type) || 'general';
  const lawyer = await whoIs(db, flags);

  // The conflict gate. Every name on the other side is searched against the
  // whole database before the retainer exists. Hits stop the opening.
  const against = str(flags.against);
  const names = against ? against.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [];
  const conflictReport = [];
  for (const name of names) {
    const found = await conflictSearch(db, name);
    if (found.hits) conflictReport.push({ name, ...found });
  }
  if (conflictReport.length && !flags.force) {
    let msg = 'The conflict check found prior involvement (Conduct and Client Care Rules 2008, rr 5.4 and 6.1):\n';
    for (const r of conflictReport) {
      msg += `  "${r.name}":\n`;
      for (const cl of r.clients) msg += `    - existing ${cl.status} client: ${cl.name} (${cl.matters} matter(s))\n`;
      for (const p of r.parties) msg += `    - party on ${p.ref} (${p.matter_status}) for ${p.client}: ${p.role}\n`;
      for (const mm of r.mentions) msg += `    - named in ${mm.ref} (${mm.status}) for ${mm.client}\n`;
    }
    msg += 'Assess it properly. If the firm can act, re-run with --force and the check is recorded with what was found.';
    throw new CliError(msg);
  }

  const ref = await nextRef(db, 'matters', 'ref', 'MT-', 1001);
  const [m] = await db.query(
    `insert into matters (ref, client_id, lawyer_id, matter_type, description, billing_type, estimate_cents, fixed_fee_cents, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [ref, c.id, lawyer?.id ?? null, type, about,
     flags['fixed-fee'] ? 'fixed' : 'hourly',
     parseMoney(flags.estimate) || null, parseMoney(flags['fixed-fee']) || null, str(flags.note) || null],
  );
  await createMatterRecords(db, m.id);
  for (const name of names) {
    await db.query('insert into parties (matter_id, name, role) values ($1, $2, $3)', [m.id, name, 'other party']);
  }
  if (names.length) {
    const note = conflictReport.length
      ? `Checked ${names.join('; ')}. Prior involvement found and cleared with --force; record the reasoning here.`
      : `Checked ${names.join('; ')}. No prior involvement found.`;
    await db.query(
      "update matter_records set status = 'on file', done_on = $2, note = $3 where matter_id = $1 and kind = 'conflict check'",
      [m.id, today(), note],
    );
  }
  let text = `Opened ${ref}: ${c.name}, ${type}, ${about}${m.estimate_cents ? `, estimate ${money(m.estimate_cents)}` : ''}${m.fixed_fee_cents ? `, fixed fee ${money(m.fixed_fee_cents)}` : ''}.`;
  text += '\nThe client care file has been created; what is not yet on file is the to-do list.';
  if (names.length) text += `\nConflict check recorded against: ${names.join('; ')}.`;
  else text += '\nNo --against= names were given, so the conflict check is still MISSING. Run: conflicts "<other side>"';
  if (!c.cdd_completed_on) text += `\nCDD is not on file for ${c.name}. Do it early: cdd "${c.name}" --on=today`;
  if (!m.estimate_cents && !m.fixed_fee_cents) text += '\nNo estimate recorded. Rule 3.5 wants the fee basis given in advance; add --estimate= or --fixed-fee=.';
  return { text, json: m };
}

async function matterClose(db, args, flags) {
  const m = await resolve(db, 'matter', args.join(' '));
  if (m.status === 'closed') throw new CliError(`${m.ref} is already closed (${isoDate(m.closed_on)}).`);
  const open = await db.query('select * from undertakings where matter_id = $1 and discharged_on is null', [m.id]);
  if (open.length) {
    throw new CliError(
      `${m.ref} has ${open.length} undischarged undertaking(s), and r 10.3 does not close with the file:\n` +
        open.map((u) => `  - to ${u.given_to}: ${truncate(u.undertaking, 60)}`).join('\n') +
        '\nDischarge them first: undertaking discharge <match> --on=',
    );
  }
  const [w] = await db.query('select wip_cents from v_wip where matter_id = $1', [m.id]);
  if (num(w?.wip_cents) > 0 && !flags['write-off'] && !flags.force) {
    throw new CliError(
      `${m.ref} still carries ${money(w.wip_cents)} of unbilled work. Bill it (bill ${m.ref}), write it off ` +
        `(matter close ${m.ref} --write-off), or close anyway with --force and it stays unbilled on a closed file.`,
    );
  }
  const on = parseDate(flags.on) || today();
  if (flags['write-off']) {
    await db.query("update time_entries set status = 'written off' where matter_id = $1 and status = 'unbilled'", [m.id]);
  }
  await db.query("update matters set status = 'closed', closed_on = $2 where id = $1", [m.id, on]);
  let text = `${m.ref} closed ${on}.`;
  if (flags['write-off'] && num(w?.wip_cents) > 0) text += ` ${money(w.wip_cents)} of unbilled work written off; recovery will show it.`;
  text += '\nSend the closing letter, and keep the file: NZLS guidance is a minimum of 6 years for records tied to the trust account, and most firms keep the file 10.';
  return { text, json: { ref: m.ref, closed_on: on } };
}

// ---------------------------------------------------------------------------
// Conflicts

async function cmdConflicts(db, args) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('Whose name? conflicts "Quays Hospitality"');
  const found = await conflictSearch(db, name);
  let text = heading(`Conflict search: "${name}" (${found.hits} hit${found.hits === 1 ? '' : 's'})`);
  if (!found.hits) {
    text += '\n  Nothing. No client, party or matter mentions the name. Record the check on the matter:\n  record <ref> "conflict" --on=today --note="Searched <name>, clear."';
  } else {
    if (found.clients.length) {
      text += '\n' + heading('As a client') + '\n' + table(found.clients, [
        { key: 'name', label: 'Client', width: 30 },
        { key: 'client_type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'matters', label: 'Matters', align: 'right' },
      ]);
    }
    if (found.parties.length) {
      text += '\n' + heading('As a party on a matter') + '\n' + table(found.parties, [
        { key: 'name', label: 'Name', width: 28 },
        { key: 'role', label: 'Role' },
        { key: 'ref', label: 'Matter' },
        { key: 'matter_status', label: 'Status' },
        { key: 'client', label: 'We acted for', width: 26 },
      ]);
    }
    if (found.mentions.length) {
      text += '\n' + heading('Named in a matter description') + '\n' + table(found.mentions, [
        { key: 'ref', label: 'Matter' },
        { key: 'status', label: 'Status' },
        { key: 'client', label: 'Client', width: 26 },
        { key: 'description', label: 'Matter', width: 50 },
      ]);
    }
    text += '\n\n  A hit is not automatically a conflict; it is a fact to assess against rr 5.4 and 6.1.';
    text += '\n  Whatever the call, record it: record <ref> "conflict" --on= --note="what was found and why we can act"';
  }
  return { text, json: found };
}

// ---------------------------------------------------------------------------
// Time, disbursements, WIP, billing

async function cmdTime(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'add') {
    const description = args[args.length - 1];
    const m = await resolve(db, 'matter', args.slice(1, -1).join(' '));
    if (!description || description === m.ref) throw new CliError('What was done? time add <matter> "Drafted the affidavit" --hours=1.5');
    if (m.status === 'closed') throw new CliError(`${m.ref} is closed. Reopen it deliberately or open a new matter.`);
    const minutes = parseMinutes(flags.hours || flags.minutes || flags.time);
    if (!minutes) throw new CliError('How long? --hours=1.5 (or --minutes=90)');
    const lawyer = await whoIs(db, flags, { optional: false });
    const on = parseDate(flags.on) || today();
    const rate = flags.rate ? parseMoney(flags.rate) : lawyer.rate_cents;
    const [t] = await db.query(
      `insert into time_entries (matter_id, lawyer_id, worked_on, minutes, description, billable, rate_cents)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [m.id, lawyer.id, on, minutes, description, !flags['no-charge'], rate],
    );
    const value = Math.round((minutes * rate) / 60);
    let text = `${m.ref}: ${hours(minutes)} recorded for ${lawyer.full_name} (${flags['no-charge'] ? 'no charge' : money(value)}).`;
    const [w] = await db.query('select wip_cents, estimate_cents from v_wip where matter_id = $1', [m.id]);
    const [vm] = await db.query('select over_estimate from v_matters where matter_id = $1', [m.id]);
    if (vm?.over_estimate) text += `\nWIP is now ${money(w.wip_cents)} and the work has passed the ${money(w.estimate_cents)} estimate. Tell the client before the bill does (r 3.5).`;
    return { text, json: t };
  }

  // The read: recorded time, most recent window.
  const days = flags.days && flags.days !== true ? Number(flags.days) : 7;
  const params = [days];
  let extra = '';
  if (flags.lawyer && flags.lawyer !== true) {
    const a = await resolve(db, 'lawyer', flags.lawyer);
    params.push(a.id);
    extra = ` and t.lawyer_id = $${params.length}`;
  }
  const rows = await db.query(
    `select t.worked_on, coalesce(a.full_name, '') as lawyer, m.ref, c.name as client, t.minutes, t.description,
            t.billable, t.rate_cents, t.status, round(t.minutes * t.rate_cents / 60.0) as value_cents
     from time_entries t
     join matters m on m.id = t.matter_id
     join clients c on c.id = m.client_id
     left join lawyers a on a.id = t.lawyer_id
     where t.worked_on >= current_date - ($1::int)${extra}
     order by t.worked_on desc, a.full_name`,
    params,
  );
  const total = rows.reduce((a, r) => a + num(r.minutes), 0);
  const value = rows.filter((r) => r.billable).reduce((a, r) => a + num(r.value_cents), 0);
  let text = heading(`Time, last ${days} days (${hours(total)}, ${money(value)} billable)`);
  text += '\n' + table(rows, [
    { key: 'worked_on', label: 'Date', format: isoDate },
    { key: 'lawyer', label: 'Who', width: 15 },
    { key: 'ref', label: 'Matter' },
    { key: 'client', label: 'Client', width: 22 },
    { key: 'minutes', label: 'Time', align: 'right', format: (v) => hours(v) },
    { key: 'value_cents', label: 'Value', align: 'right', format: (v, r) => (r.billable ? money(v) : 'n/c') },
    { key: 'description', label: 'What', width: 44 },
  ]);
  return { text, json: rows };
}

async function cmdDisbursement(db, args, flags) {
  const description = args[args.length - 1];
  const m = await resolve(db, 'matter', args.slice(0, -1).join(' '));
  if (!description || description === m.ref) throw new CliError('What was it? disbursement <matter> "High Court filing fee" --amount=200');
  const amount = parseMoney(flags.amount);
  if (!amount) throw new CliError('How much? --amount= (in dollars).');
  const on = parseDate(flags.on) || today();
  const [d] = await db.query(
    'insert into disbursements (matter_id, incurred_on, description, amount_cents) values ($1, $2, $3, $4) returning *',
    [m.id, on, description, amount],
  );
  return { text: `${m.ref}: disbursement ${money(amount)}, ${description}.`, json: d };
}

async function cmdWip(db, args, flags) {
  const rows = await db.query(
    `select * from v_wip where matter_status = 'open' and wip_cents > 0 order by wip_cents desc`,
  );
  const total = rows.reduce((a, r) => a + num(r.wip_cents), 0);
  const stale = rows.filter((r) => num(r.oldest_unbilled_days) > 90);
  let text = heading(`Work in progress (${rows.length} matters, ${money(total)})`);
  if (stale.length) text += `\n  ${stale.length} matter(s) carry unbilled work more than 90 days old. That is the firm's own money, aging.`;
  text += '\n' + table(rows, [
    { key: 'ref', label: 'Matter' },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'lawyer', label: 'Lawyer', width: 15 },
    { key: 'wip_minutes', label: 'Time', align: 'right', format: (v) => hours(v) },
    { key: 'wip_time_cents', label: 'Fees', align: 'right', format: (v) => money(v) },
    { key: 'wip_disb_cents', label: 'Disb.', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'wip_cents', label: 'Total', align: 'right', format: (v) => money(v) },
    { key: 'oldest_unbilled_on', label: 'Oldest entry', format: (v, r) => (v ? `${isoDate(v)} (${r.oldest_unbilled_days}d)` : '') },
    { key: 'estimate_cents', label: 'Estimate', align: 'right', format: (v, r) => (v ? money(v) : (r.billing_type === 'fixed' ? `fixed ${money(r.fixed_fee_cents)}` : '')) },
  ]);
  text += '\n\n  Bill a matter with: bill <ref>. The invoice is a draft; a person sends it.';
  return { text, json: rows };
}

async function cmdBill(db, args, flags) {
  const m = await resolve(db, 'matter', args.join(' '));
  const [gate] = await db.query(
    "select status from matter_records where matter_id = $1 and kind = 'letter of engagement'",
    [m.id],
  );
  if (gate?.status === 'missing' && !flags.force) {
    throw new CliError(
      `${m.ref} has no letter of engagement on file, and rr 3.4 and 3.5 want the client care information and fee basis given ` +
        'in advance, which is hard to argue when the first document the client gets is a bill.\n' +
        `Record it first: record ${m.ref} "engagement" --on=<date it was sent>\n` +
        'If it genuinely exists outside this system, re-run with --force and then record it.',
    );
  }
  const through = parseDate(flags.through) || today();
  const time = await db.query(
    `select t.*, round(t.minutes * t.rate_cents / 60.0) as value_cents from time_entries t
     where t.matter_id = $1 and t.status = 'unbilled' and t.billable and t.worked_on <= $2 order by t.worked_on`,
    [m.id, through],
  );
  const disb = await db.query(
    'select * from disbursements where matter_id = $1 and status = $3 and incurred_on <= $2 order by incurred_on',
    [m.id, through, 'unbilled'],
  );
  if (!time.length && !disb.length) throw new CliError(`${m.ref} has nothing unbilled${flags.through ? ` up to ${through}` : ''}.`);

  const timeCents = m.billing_type === 'fixed' && m.fixed_fee_cents
    ? num(m.fixed_fee_cents)
    : time.reduce((a, r) => a + num(r.value_cents), 0);
  const disbCents = disb.reduce((a, r) => a + num(r.amount_cents), 0);
  const number = await nextRef(db, 'invoices', 'number', 'INV-', 5001);
  const dueDays = flags['due-days'] ? Number(flags['due-days']) : 14;
  const [inv] = await db.query(
    `insert into invoices (number, matter_id, client_id, issued_on, due_on, time_cents, disbursements_cents, total_cents, status, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9) returning *`,
    [number, m.id, m.client_id, today(), addDays(today(), dueDays), timeCents, disbCents, timeCents + disbCents,
     m.billing_type === 'fixed' ? `Fixed fee matter: fee ${money(m.fixed_fee_cents)}, time recorded ${hours(time.reduce((a, r) => a + r.minutes, 0))}.` : (str(flags.note) || null)],
  );
  for (const t of time) await db.query("update time_entries set status = 'billed', invoice_id = $2 where id = $1", [t.id, inv.id]);
  for (const d of disb) await db.query("update disbursements set status = 'billed', invoice_id = $2 where id = $1", [d.id, inv.id]);
  let text = `${number} drafted for ${m.ref} ${m.client_name}: fees ${money(timeCents)}, disbursements ${money(disbCents)}, total ${money(timeCents + disbCents)}. Due ${inv.due_on}.`;
  text += `\n${time.length} time entries and ${disb.length} disbursements marked billed.`;
  text += `\nIt is a DRAFT. Render it (npm run docs -- invoice), read it, send it yourself, then: invoice sent ${number}`;
  return { text, json: inv };
}

async function cmdInvoice(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'sent') {
    const inv = await resolve(db, 'invoice', args.slice(1).join(' '));
    if (inv.status === 'paid') throw new CliError(`${inv.number} is already paid.`);
    const on = parseDate(flags.on) || today();
    await db.query("update invoices set status = 'sent', sent_on = $2 where id = $1", [inv.id, on]);
    return { text: `${inv.number} marked sent ${on}. Due ${isoDate(inv.due_on)}.`, json: { number: inv.number, sent_on: on } };
  }
  if (sub === 'paid') {
    const inv = await resolve(db, 'invoice', args.slice(1).join(' '));
    const on = parseDate(flags.on) || today();
    const amount = parseMoney(flags.amount) || num(inv.total_cents);
    await db.query("update invoices set status = 'paid', paid_on = $2, paid_cents = $3 where id = $1", [inv.id, on, amount]);
    let text = `${inv.number} paid ${on}: ${money(amount)}.`;
    if (amount < num(inv.total_cents)) text += ` That is ${money(num(inv.total_cents) - amount)} short of the ${money(inv.total_cents)} billed. Chase the balance or credit it deliberately.`;
    return { text, json: { number: inv.number, paid_on: on, paid_cents: amount } };
  }
  const inv = await resolve(db, 'invoice', args.join(' '));
  const time = await db.query(
    `select t.worked_on, t.minutes, t.description, t.rate_cents, coalesce(a.full_name, '') as lawyer,
            round(t.minutes * t.rate_cents / 60.0) as value_cents
     from time_entries t left join lawyers a on a.id = t.lawyer_id where t.invoice_id = $1 order by t.worked_on`,
    [inv.id],
  );
  const disb = await db.query('select * from disbursements where invoice_id = $1 order by incurred_on', [inv.id]);
  let text = heading(`${inv.number}  ${inv.client_name} (${inv.matter_ref}, ${inv.status})`);
  text += `\n  Issued ${isoDate(inv.issued_on)}, due ${isoDate(inv.due_on)}. Fees ${money(inv.time_cents)}, disbursements ${money(inv.disbursements_cents)}, total ${money(inv.total_cents)}.`;
  if (inv.paid_on) text += ` Paid ${isoDate(inv.paid_on)} (${money(inv.paid_cents)}).`;
  if (time.length) {
    text += '\n' + heading('Fees') + '\n' + table(time, [
      { key: 'worked_on', label: 'Date', format: isoDate },
      { key: 'lawyer', label: 'Who', width: 15 },
      { key: 'minutes', label: 'Time', align: 'right', format: (v) => hours(v) },
      { key: 'value_cents', label: 'Value', align: 'right', format: (v) => money(v) },
      { key: 'description', label: 'What', width: 50 },
    ]);
  }
  if (disb.length) {
    text += '\n' + heading('Disbursements') + '\n' + table(disb, [
      { key: 'incurred_on', label: 'Date', format: isoDate },
      { key: 'description', label: 'What', width: 44 },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
    ]);
  }
  return { text, json: { invoice: inv, time, disbursements: disb } };
}

async function cmdDebtors(db) {
  const rows = await db.query('select * from v_debtors order by days_overdue desc');
  const owing = rows.filter((r) => r.status === 'sent');
  const total = owing.reduce((a, r) => a + num(r.total_cents), 0);
  const overdue = owing.filter((r) => num(r.days_overdue) > 0);
  let text = heading(`Debtors (${owing.length} invoices out, ${money(total)}; ${overdue.length} overdue)`);
  text += '\n' + table(rows, [
    { key: 'number', label: 'Invoice' },
    { key: 'ref', label: 'Matter' },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'lawyer', label: 'Lawyer', width: 15 },
    { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
    { key: 'status', label: 'Status' },
    { key: 'due_on', label: 'Due', format: isoDate },
    { key: 'bucket', label: 'Aged', format: (v, r) => (r.status === 'draft' ? 'NOT SENT' : v) },
  ]);
  text += '\n\n  A draft on this list was never sent. Send it or delete the pretence. Chasing words go in drafts/, not from here.';
  return { text, json: rows };
}

async function cmdLockup(db) {
  const rows = await db.query('select * from v_lockup where wip_cents > 0 or debtors_cents > 0 order by lockup_cents desc');
  const wip = rows.reduce((a, r) => a + num(r.wip_cents), 0);
  const debt = rows.reduce((a, r) => a + num(r.debtors_cents), 0);
  let text = heading(`Lock-up (${money(wip + debt)}: ${money(wip)} unbilled + ${money(debt)} billed and unpaid)`);
  text += '\n' + table(rows, [
    { key: 'client', label: 'Client', width: 28 },
    { key: 'lawyer', label: 'Lawyer', width: 15 },
    { key: 'wip_cents', label: 'WIP', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'debtors_cents', label: 'Debtors', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'lockup_cents', label: 'Lock-up', align: 'right', format: (v) => money(v) },
  ]);
  text += '\n\n  Lock-up is fees the firm has earned and does not have. Work it top down: bill the WIP, chase the debtors.';
  return { text, json: rows };
}

async function cmdRecovery(db) {
  const rows = await db.query('select * from v_recovery where billable_minutes > 0 or no_charge_minutes > 0 order by worked_cents desc');
  let text = heading('Recovery, all time');
  text += '\n' + table(rows, [
    { key: 'lawyer', label: 'Lawyer', width: 18 },
    { key: 'billable_minutes', label: 'Billable', align: 'right', format: (v) => hours(v) },
    { key: 'no_charge_minutes', label: 'No charge', align: 'right', format: (v) => (num(v) ? hours(v) : '') },
    { key: 'worked_cents', label: 'Worked', align: 'right', format: (v) => money(v) },
    { key: 'billed_cents', label: 'Billed', align: 'right', format: (v) => money(v) },
    { key: 'written_off_cents', label: 'Written off', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'unbilled_cents', label: 'Unbilled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'billed_cents2', label: 'Recovery', align: 'right', format: (v, r) => {
      const done = num(r.billed_cents) + num(r.written_off_cents);
      return done ? `${Math.round((num(r.billed_cents) / done) * 100)}%` : '';
    } },
  ]);
  text += '\n\n  Recovery is billed against billed-plus-written-off. Unbilled work is not lost yet; it is on the WIP list.';
  return { text, json: rows };
}

// ---------------------------------------------------------------------------
// Key dates and undertakings

async function cmdKeyDates(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'add') {
    const title = args[args.length - 1];
    const m = await resolve(db, 'matter', args.slice(1, -1).join(' '));
    if (!title || title === m.ref) throw new CliError('What is the date? key-date add <matter> "File the defence" --due= [--kind=limitation|settlement|hearing|filing|renewal|deadline]');
    const due = parseDate(flags.due, 'due date');
    if (!due) throw new CliError('When? --due=YYYY-MM-DD');
    const [k] = await db.query(
      'insert into key_dates (matter_id, kind, title, due_on, note) values ($1, $2, $3, $4, $5) returning *',
      [m.id, str(flags.kind) || 'deadline', title, due, str(flags.note) || null],
    );
    return { text: `${m.ref}: ${k.kind} recorded for ${due}: ${title}`, json: k };
  }
  if (sub === 'done') {
    const k = await resolve(db, 'key-date', args.slice(1).join(' '));
    const on = parseDate(flags.on) || today();
    await db.query('update key_dates set completed_on = $2 where id = $1', [k.id, on]);
    return { text: `${k.matter_ref}: "${k.title}" done ${on}.`, json: { id: k.id, completed_on: on } };
  }

  const days = flags.days && flags.days !== true ? Number(flags.days) : 60;
  const rows = await db.query(
    `select * from v_key_dates where completed_on is null and matter_status = 'open'
       ${flags.all ? '' : 'and due_on <= current_date + ($1::int)'} order by due_on`,
    flags.all ? [] : [days],
  );
  const missed = rows.filter((r) => num(r.days_left) < 0);
  let text = heading(`Key dates, next ${days} days (${rows.length} pending, ${missed.length} MISSED)`);
  if (missed.some((r) => r.kind === 'limitation')) text += '\n  A LIMITATION DATE HAS PASSED. Stop and deal with that first.';
  text += '\n' + table(rows, [
    { key: 'kind', label: 'Kind' },
    { key: 'ref', label: 'Matter' },
    { key: 'client', label: 'Client', width: 24 },
    { key: 'title', label: 'What', width: 46 },
    { key: 'due_on', label: 'Due', format: isoDate },
    { key: 'days_left', label: 'Days', align: 'right', format: (v) => (num(v) < 0 ? `${-num(v)} AGO` : v) },
    { key: 'lawyer', label: 'Lawyer', width: 15 },
  ]);
  text += '\n\n  A limitation row is the one that ends careers. Done one? key-date done <match> --on=';
  return { text, json: rows };
}

async function cmdUndertakings(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'give') {
    const what = args[args.length - 1];
    const m = await resolve(db, 'matter', args.slice(1, -1).join(' '));
    if (!what || what === m.ref) throw new CliError('The wording matters: undertaking give <matter> "Register the discharge within 5 working days" --to="Rutherford & Co" --due=');
    const to = str(flags.to);
    if (!to) throw new CliError('Given to whom? --to="the firm or person"');
    const lawyer = await whoIs(db, flags);
    const [u] = await db.query(
      'insert into undertakings (matter_id, lawyer_id, given_on, given_to, undertaking, due_on, note) values ($1, $2, $3, $4, $5, $6, $7) returning *',
      [m.id, lawyer?.id ?? null, parseDate(flags.on) || today(), to, what, parseDate(flags.due, 'due date'), str(flags.note) || null],
    );
    return {
      text: `${m.ref}: undertaking to ${to} recorded${u.due_on ? `, due ${isoDate(u.due_on)}` : ''}. Rule 10.3: it is personal, and it is strict. It stays on the register until discharged.`,
      json: u,
    };
  }
  if (sub === 'discharge') {
    const u = await resolve(db, 'undertaking', args.slice(1).join(' '));
    if (u.discharged_on) throw new CliError(`That undertaking was discharged ${isoDate(u.discharged_on)}.`);
    const on = parseDate(flags.on) || today();
    await db.query('update undertakings set discharged_on = $2, note = coalesce($3, note) where id = $1', [u.id, on, str(flags.note) || null]);
    return { text: `${u.matter_ref}: undertaking to ${u.given_to} discharged ${on}.`, json: { id: u.id, discharged_on: on } };
  }

  const rows = await db.query(
    `select * from v_undertakings ${flags.all ? '' : 'where discharged_on is null'} order by discharged_on nulls first, due_on nulls last`,
  );
  const open = rows.filter((r) => !r.discharged_on);
  const overdue = open.filter((r) => r.due_on && num(r.days_overdue) > 0);
  let text = heading(`The undertakings register (${open.length} open, ${overdue.length} OVERDUE)`);
  text += '\n' + table(rows, [
    { key: 'ref', label: 'Matter' },
    { key: 'lawyer', label: 'Given by', width: 15 },
    { key: 'given_on', label: 'On', format: isoDate },
    { key: 'given_to', label: 'To', width: 22 },
    { key: 'undertaking', label: 'Undertaking', width: 52 },
    { key: 'due_on', label: 'Due', format: isoDate },
    { key: 'discharged_on', label: 'Status', format: (v, r) => (v ? `discharged ${isoDate(v)}` : (r.due_on && num(r.days_overdue) > 0 ? `OVERDUE ${r.days_overdue}d` : 'open')) },
  ]);
  text += '\n\n  An undertaking is a personal professional promise (r 10.3). The register is the only honest memory it has.';
  return { text, json: rows };
}

// ---------------------------------------------------------------------------
// Records, CDD, notes, tasks

async function cmdRecord(db, args, flags) {
  const kindQuery = args[args.length - 1];
  const m = await resolve(db, 'matter', args.slice(0, -1).join(' '));
  const matches = RECORD_KINDS.map(([k]) => k).filter((k) => k.toLowerCase().includes(String(kindQuery).toLowerCase()));
  if (!matches.length) throw new CliError(`No client care record matches "${kindQuery}". The six: ${RECORD_KINDS.map(([k]) => k).join('; ')}.`);
  if (matches.length > 1) throw new CliError(`"${kindQuery}" matches ${matches.length} records: ${matches.join('; ')}. Be more specific.`);
  const status = flags.na ? 'n/a' : 'on file';
  const on = flags.na ? null : parseDate(flags.on) || today();
  await db.query(
    'update matter_records set status = $3, done_on = $4, note = coalesce($5, note) where matter_id = $1 and kind = $2',
    [m.id, matches[0], status, on, str(flags.note) || null],
  );
  const gaps = await db.query("select kind from matter_records where matter_id = $1 and status = 'missing'", [m.id]);
  let text = `${m.ref}: "${matches[0]}" marked ${status}${on ? ` (${on})` : ''}.`;
  text += gaps.length ? `\nStill missing: ${gaps.map((g) => g.kind).join('; ')}.` : '\nThe client care file is complete.';
  return { text, json: { ref: m.ref, kind: matches[0], status, remaining_gaps: gaps.length } };
}

async function cmdCdd(db, args, flags) {
  const c = await resolve(db, 'client', args.join(' '));
  const on = parseDate(flags.on) || today();
  const type = str(flags.type) || (['company', 'trust'].includes(c.client_type) ? 'enhanced' : 'standard');
  await db.query('update clients set cdd_completed_on = $2, cdd_type = $3 where id = $1', [c.id, on, type]);
  await db.query(
    `update matter_records mr set status = 'on file', done_on = $2
     from matters m where m.id = mr.matter_id and m.client_id = $1 and mr.kind = 'AML/CFT customer due diligence' and mr.status = 'missing'`,
    [c.id, on],
  );
  return {
    text: `${c.name}: ${type} customer due diligence recorded ${on}. Open matters updated. Keep the identity documents where your AML programme says they live; this records that it happened.`,
    json: { client: c.name, cdd_completed_on: on, cdd_type: type },
  };
}

async function cmdLog(db, args, flags) {
  const note = args[args.length - 1];
  const target = args.slice(0, -1).join(' ');
  if (!note || !target) throw new CliError('Usage: log <matter or client> "what happened" [--channel=phone|email|meeting|letter|court]');
  let m = null;
  try {
    m = await resolve(db, 'matter', target, { optional: true });
  } catch {
    m = null; // several matters match; treat the target as a client instead
  }
  const c = m ? { id: m.client_id, name: m.client_name } : await resolve(db, 'client', target);
  const lawyer = await whoIs(db, flags);
  const on = parseDate(flags.on) || today();
  await db.query(
    'insert into file_notes (matter_id, client_id, lawyer_id, noted_on, channel, note) values ($1, $2, $3, $4, $5, $6)',
    [m?.id ?? null, c.id, lawyer?.id ?? null, on, str(flags.channel) || 'phone', note],
  );
  return { text: `Filed against ${m ? m.ref + ' ' : ''}${c.name} (${on}): ${note}`, json: { matter: m?.ref ?? null, client: c.name, on, note } };
}

async function cmdTask(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'add') {
    const title = args.slice(1).join(' ');
    if (!title) throw new CliError('Give me a title: task add "chase the surveyor" [--matter=] [--client=] [--due=]');
    const m = flags.matter && flags.matter !== true ? await resolve(db, 'matter', flags.matter) : null;
    const client = m ? { id: m.client_id } : (flags.client && flags.client !== true ? await resolve(db, 'client', flags.client) : null);
    const lawyer = await whoIs(db, flags);
    const [t] = await db.query(
      'insert into tasks (title, matter_id, client_id, lawyer_id, due_on, note) values ($1, $2, $3, $4, $5, $6) returning *',
      [title, m?.id ?? null, client?.id ?? null, lawyer?.id ?? null, parseDate(flags.due, 'due date'), str(flags.note) || null],
    );
    return { text: `Task: ${title}${t.due_on ? ` (due ${isoDate(t.due_on)})` : ''}`, json: t };
  }
  if (sub === 'done') {
    const t = await resolve(db, 'task', args.slice(1).join(' '));
    await db.query("update tasks set status = 'done', done_on = $2 where id = $1", [t.id, parseDate(flags.on) || today()]);
    return { text: `Done: ${t.title}`, json: { id: t.id, title: t.title } };
  }
  throw new CliError('Usage: task add "<title>" [--matter=] [--client=] [--due=]  |  task done <match>  |  tasks [--all]');
}

async function cmdTasks(db, args, flags) {
  const rows = await db.query(
    `select t.title, t.due_on, t.status, t.done_on, coalesce(c.name, '') as client, coalesce(a.full_name, '') as lawyer, coalesce(m.ref, '') as matter
     from tasks t left join clients c on c.id = t.client_id left join lawyers a on a.id = t.lawyer_id left join matters m on m.id = t.matter_id
     ${flags.all ? '' : "where t.status = 'open'"} order by t.status, t.due_on nulls last`,
  );
  const text =
    heading(`Tasks (${rows.filter((r) => r.status === 'open').length} open)`) +
    '\n' +
    table(rows, [
      { key: 'title', label: 'Task', width: 52 },
      { key: 'matter', label: 'Matter' },
      { key: 'client', label: 'Client', width: 24 },
      { key: 'lawyer', label: 'Who', width: 15 },
      { key: 'due_on', label: 'Due', format: (v, r) => (r.status === 'done' ? `done ${isoDate(r.done_on)}` : isoDate(v) || '') },
    ]);
  return { text, json: rows };
}

// ---------------------------------------------------------------------------
// Compliance: the rules, run against the records.

const COMPLIANCE_RULES = [
  {
    key: 'engagement',
    name: 'Letter of engagement and client care information on every open matter',
    source: 'Conduct and Client Care Rules 2008, rr 3.4 and 3.5',
    sql: `select m.ref, c.name as client, m.matter_type from matter_records mr
          join matters m on m.id = mr.matter_id join clients c on c.id = m.client_id
          where mr.kind = 'letter of engagement' and mr.status = 'missing' and m.status = 'open'`,
    fix: 'record <matter> "engagement" --on=<date it was sent>',
  },
  {
    key: 'fees',
    name: 'The fee basis given in advance, in writing',
    source: 'Conduct and Client Care Rules 2008, r 3.5',
    sql: `select m.ref, c.name as client, m.matter_type from matter_records mr
          join matters m on m.id = mr.matter_id join clients c on c.id = m.client_id
          where mr.kind = 'fee information' and mr.status = 'missing' and m.status = 'open'`,
    fix: 'record <matter> "fee" --on=',
  },
  {
    key: 'conflicts',
    name: 'A conflict check on file for every open matter',
    source: 'Conduct and Client Care Rules 2008, rr 5.4 and 6.1',
    sql: `select m.ref, c.name as client, m.matter_type from matter_records mr
          join matters m on m.id = mr.matter_id join clients c on c.id = m.client_id
          where mr.kind = 'conflict check' and mr.status = 'missing' and m.status = 'open'`,
    fix: 'conflicts "<other side>", then record <matter> "conflict" --on= --note="what was found"',
  },
  {
    key: 'cdd',
    name: 'Customer due diligence before the retainer proceeds',
    source: 'AML/CFT Act 2009, ss 11 to 16 (law firms captured since 1 July 2018)',
    sql: `select m.ref, c.name as client, m.matter_type from matters m join clients c on c.id = m.client_id
          where m.status = 'open' and c.cdd_completed_on is null`,
    fix: 'cdd <client> --on= --type=standard|enhanced',
  },
  {
    key: 'deadlines',
    name: 'No key date missed on an open matter',
    source: 'Conduct and Client Care Rules 2008, r 3 (competent and timely), and the Limitation Act 2010 behind it',
    sql: `select k.ref, k.client, k.kind, to_char(k.due_on, 'YYYY-MM-DD') as due, k.title
          from v_key_dates k where k.completed_on is null and k.matter_status = 'open' and k.due_on < current_date`,
    fix: 'deal with the date, then key-date done <match> --on=',
  },
  {
    key: 'undertakings',
    name: 'Every undertaking honoured on time',
    source: 'Conduct and Client Care Rules 2008, r 10.3',
    sql: `select u.ref, u.given_to, to_char(u.due_on, 'YYYY-MM-DD') as due, u.undertaking
          from v_undertakings u where u.discharged_on is null and u.due_on is not null and u.due_on < current_date`,
    fix: 'do the thing, then undertaking discharge <match> --on=',
  },
  {
    key: 'estimates',
    name: 'The client told before the work passes the estimate',
    source: 'Conduct and Client Care Rules 2008, r 3.5 (and r 3.4A on fee changes)',
    sql: `select v.ref, v.client, to_char(v.estimate_cents / 100.0, 'FM$999,999,990') as estimate
          from v_matters v where v.status = 'open' and v.over_estimate`,
    fix: 'ring the client, log it, and revise the estimate on the matter',
  },
  {
    key: 'practising-certs',
    name: 'Every fee earner who needs a practising certificate holds a current one',
    source: 'Lawyers and Conveyancers Act 2006, ss 6 and 39',
    sql: `select l.full_name as lawyer, l.role, coalesce(to_char(l.pc_expires_on, 'YYYY-MM-DD'), 'none on file') as expires
          from lawyers l where l.active and l.role <> 'legal executive'
            and (l.practising_cert is null or l.practising_cert = '' or l.pc_expires_on is null or l.pc_expires_on <= current_date + 60)`,
    fix: 'renew with the Law Society, then update the lawyer record',
  },
];

async function cmdCompliance(db, args) {
  const only = (args[0] || '').toLowerCase();
  const rules = only ? COMPLIANCE_RULES.filter((r) => r.key === only) : COMPLIANCE_RULES;
  if (!rules.length) throw new CliError(`No rule "${only}". Rules: ${COMPLIANCE_RULES.map((r) => r.key).join(', ')}.`);
  const results = [];
  let text = heading('Compliance, checked against the records');
  text += '\n  The rule book is docs/compliance.md. Each rule cites its source. None of this is legal advice;\n  it is your own rule book pointed at your own data.\n';
  for (const rule of rules) {
    const rows = await db.query(rule.sql);
    results.push({ key: rule.key, name: rule.name, source: rule.source, breaches: rows });
    if (!rows.length) {
      text += `\n  PASS  ${rule.key.padEnd(18)} ${rule.name}`;
    } else {
      text += `\n  FAIL  ${rule.key.padEnd(18)} ${rule.name} (${rows.length})`;
      text += `\n        ${rule.source}`;
      for (const r of rows.slice(0, 8)) text += `\n        - ${Object.values(r).join('  ')}`;
      if (rows.length > 8) text += `\n        ... and ${rows.length - 8} more`;
      text += `\n        Fix: ${rule.fix}`;
    }
  }
  const failed = results.filter((r) => r.breaches.length);
  text += `\n\n  ${results.length - failed.length} of ${results.length} rules pass.` + (failed.length ? ` Start with ${failed[0].key}.` : ' Keep it that way.');
  return { text, json: results };
}

// ---------------------------------------------------------------------------
// Attention: everything that wants a decision, worst first.

const ATTENTION_ORDER = [
  'limitation_missed', 'limitation_soon', 'key_date_missed', 'undertaking_overdue', 'key_date_week',
  'cdd_missing', 'record_gap', 'over_estimate', 'invoice_overdue', 'wip_stale', 'invoice_draft',
  'matter_quiet', 'practising_cert', 'task_overdue',
];
const ATTENTION_LABELS = {
  limitation_missed: 'LIMITATION DATE PASSED',
  limitation_soon: 'Limitation date closing in',
  key_date_missed: 'Key date MISSED',
  key_date_week: 'Key date this week',
  undertaking_overdue: 'Undertaking overdue',
  cdd_missing: 'No CDD on an open matter',
  record_gap: 'Client care file incomplete',
  over_estimate: 'Work has passed the estimate',
  invoice_overdue: 'Invoice overdue',
  wip_stale: 'Unbilled work going stale',
  invoice_draft: 'Draft bill never sent',
  matter_quiet: 'Matter gone quiet',
  practising_cert: 'Practising certificate',
  task_overdue: 'Task overdue',
};

async function cmdAttention(db) {
  const rows = await db.query('select * from v_attention');
  const order = Object.fromEntries(ATTENTION_ORDER.map((k, i) => [k, i]));
  rows.sort((a, b) => (order[a.reason] ?? 99) - (order[b.reason] ?? 99) || num(b.days) - num(a.days));
  const counts = {};
  for (const r of rows) counts[r.reason] = (counts[r.reason] || 0) + 1;
  let text = heading(`Needs attention (${rows.length})`);
  text += '\n  ' + Object.entries(counts).map(([k, n]) => `${ATTENTION_LABELS[k] || k}: ${n}`).join('  |  ') + '\n';
  text += '\n' + table(rows, [
    { key: 'reason', label: 'What', width: 28, format: (v) => ATTENTION_LABELS[v] || v },
    { key: 'label', label: 'Record', width: 22 },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'lawyer', label: 'Lawyer', width: 15 },
    { key: 'days', label: 'Days', align: 'right' },
    { key: 'amount_cents', label: 'Value', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'detail', label: 'Detail', width: 64 },
  ]);
  return { text, json: rows };
}

async function cmdStats(db) {
  const [row] = await db.query(`
    select (select count(*) from clients where status = 'active') as clients,
           (select count(*) from lawyers where active) as lawyers,
           (select count(*) from matters where status = 'open') as open_matters,
           (select coalesce(sum(w.wip_cents), 0) from v_wip w where w.matter_status = 'open') as wip_cents,
           (select coalesce(sum(d.total_cents), 0) from v_debtors d where d.status = 'sent') as debtors_cents,
           (select count(*) from v_key_dates k where k.completed_on is null and k.matter_status = 'open' and k.due_on <= current_date + 30) as key_dates_30d,
           (select count(*) from undertakings where discharged_on is null) as open_undertakings,
           (select count(*) from v_matters v where v.status = 'open' and v.over_estimate) as over_estimate,
           (select count(*) from v_record_gaps) as record_gaps,
           (select count(*) from v_attention) as attention
  `);
  const j = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  const text =
    heading('The practice in numbers') +
    `\n  ${j.clients} active clients, ${j.lawyers} fee earners, ${j.open_matters} open matters` +
    `\n  Lock-up: ${money(j.wip_cents + j.debtors_cents)} (${money(j.wip_cents)} unbilled + ${money(j.debtors_cents)} billed, unpaid)` +
    `\n  Key dates inside 30 days: ${j.key_dates_30d}    Open undertakings: ${j.open_undertakings}` +
    `\n  Matters over their estimate: ${j.over_estimate}    Client care file gaps: ${j.record_gaps}` +
    `\n  Attention items: ${j.attention}`;
  return { text, json: j };
}

// ---------------------------------------------------------------------------
// add: clients and lawyers

async function cmdAdd(db, args, flags) {
  const kind = (args[0] || '').toLowerCase();
  const name = args.slice(1).join(' ').trim();
  if (!name) throw new CliError(`Usage: add ${kind || 'client|lawyer'} "<name>" [--flags]`);
  if (kind === 'client') {
    const lawyer = await whoIs(db, flags);
    const [c] = await db.query(
      `insert into clients (name, client_type, email, phone, city, referred_by, lawyer_id, cdd_completed_on, cdd_type)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [name, str(flags.type) || 'individual', str(flags.email) || null, str(flags.phone) || null, str(flags.city) || null,
       str(flags['referred-by']) || null, lawyer?.id ?? null, parseDate(flags.cdd), flags.cdd ? str(flags['cdd-type']) || 'standard' : null],
    );
    let text = `Client: ${c.name} (${c.client_type}).`;
    if (!c.cdd_completed_on) text += ` No CDD yet; do it before the retainer proceeds: cdd "${c.name}" --on=`;
    return { text, json: c };
  }
  if (kind === 'lawyer') {
    const [a] = await db.query(
      'insert into lawyers (full_name, code, email, phone, role, practising_cert, pc_expires_on, rate_cents) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *',
      [name, str(flags.code) || null, str(flags.email) || null, str(flags.phone) || null, str(flags.role) || 'solicitor',
       str(flags.cert) || null, parseDate(flags['cert-expires']), parseMoney(flags.rate) || 30000],
    );
    let text = `Lawyer: ${a.full_name} (${a.role}, ${money(a.rate_cents)}/h).`;
    if (a.role !== 'legal executive' && !a.practising_cert) text += ' No practising certificate on file; /compliance will keep saying so until there is.';
    return { text, json: a };
  }
  throw new CliError('add what? client or lawyer.');
}

async function cmdParty(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub !== 'add') throw new CliError('Usage: party add <matter> "<name>" [--role=other party|counterparty|other side solicitor|beneficiary|related entity|witness]');
  const name = args[args.length - 1];
  const m = await resolve(db, 'matter', args.slice(1, -1).join(' '));
  if (!name || name === m.ref) throw new CliError('Whose name? party add <matter> "Apex Scaffolding Ltd" --role="other party"');
  const [p] = await db.query(
    'insert into parties (matter_id, name, role, note) values ($1, $2, $3, $4) returning *',
    [m.id, name, str(flags.role) || 'other party', str(flags.note) || null],
  );
  return { text: `${m.ref}: party recorded, ${name} (${p.role}). The conflict check reads this forever.`, json: p };
}

// ---------------------------------------------------------------------------
// Import: bring the practice across from Actionstep, LEAP, Clio or plain CSV.

async function cmdImport(db, args, flags) {
  const source = (args[0] || 'csv').toLowerCase();
  if (!['actionstep', 'leap', 'clio', 'csv'].includes(source)) {
    throw new CliError('Import sources: actionstep, leap, clio, csv. They all read the same columns; the name is for your records.');
  }
  const read = (flagName, required = false) => {
    const p = flags[flagName];
    if (!p || p === true) {
      if (required) throw new CliError(`No ${flagName} file. Pass --${flagName}=path/to/file.csv`);
      return null;
    }
    const file = path.resolve(REPO_ROOT, String(p));
    if (!existsSync(file)) throw new CliError(`No ${flagName} file at ${file}.`);
    return parseCsv(readFileSync(file, 'utf8'));
  };
  const clientRows = read('clients', !flags.matters && !flags.time);
  const matterRows = read('matters');
  const timeRows = read('time');
  const dry = Boolean(flags['dry-run']);
  const out = { clients: 0, clients_updated: 0, matters: 0, matters_updated: 0, time_entries: 0, skipped: [] };
  const lawyer = await whoIs(db, flags);

  const findClient = async (name) => {
    const [c] = await db.query('select * from clients where lower(name) = lower($1)', [name]);
    return c || null;
  };
  const findMatter = async (extRef, clientId, description) => {
    if (extRef) {
      const rows = await db.query('select * from matters where lower(coalesce(external_ref, \'\')) = lower($1)', [extRef]);
      if (rows.length) return rows[0];
    }
    if (clientId && description) {
      const rows = await db.query('select * from matters where client_id = $1 and lower(description) = lower($2)', [clientId, description]);
      if (rows.length) return rows[0];
    }
    return null;
  };

  for (const row of clientRows || []) {
    const name = pick(row, 'Name', 'Client', 'Client Name', 'Full Name', 'Contact Name', 'Display Name', 'Participant Name', 'Company Name');
    if (!name) {
      out.skipped.push('client row with no name column');
      continue;
    }
    const existing = await findClient(name);
    if (existing) {
      out.clients_updated++;
      if (!dry) {
        await db.query('update clients set email = coalesce(nullif($2, \'\'), email), phone = coalesce(nullif($3, \'\'), phone) where id = $1', [
          existing.id, pick(row, 'Email', 'Email Address', 'E-mail'), pick(row, 'Phone', 'Mobile', 'Phone Number'),
        ]);
      }
      continue;
    }
    out.clients++;
    if (!dry) {
      const rawType = (pick(row, 'Type', 'Client Type', 'Entity Type', 'Contact Type') || '').toLowerCase();
      const type = ['individual', 'couple', 'company', 'trust', 'estate'].includes(rawType)
        ? rawType
        : (/compan|ltd|limited|inc/.test(rawType + ' ' + name.toLowerCase()) ? 'company' : (/trust/.test(rawType + ' ' + name.toLowerCase()) ? 'trust' : 'individual'));
      await db.query(
        'insert into clients (name, client_type, email, phone, city, referred_by, lawyer_id, external_ref) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing',
        [name, type,
         pick(row, 'Email', 'Email Address', 'E-mail') || null, pick(row, 'Phone', 'Mobile', 'Phone Number') || null,
         pick(row, 'City', 'Suburb', 'Region') || null, pick(row, 'Referrer', 'Referred By', 'Lead Source', 'Source') || null,
         lawyer?.id ?? null, pick(row, 'Client ID', 'Contact ID', 'Participant ID', 'Id', 'ID') || null],
      );
    }
  }

  for (const row of matterRows || []) {
    const clientName = pick(row, 'Client', 'Client Name', 'Contact', 'Participant', 'Name');
    const client = clientName ? await findClient(clientName) : null;
    if (!client && !dry) {
      out.skipped.push(`matter for "${clientName || '(no client column)'}": client not found (import clients first, names must match)`);
      continue;
    }
    const description = pick(row, 'Matter', 'Matter Name', 'Action Name', 'Description', 'Title') || 'Imported matter';
    const extRef = pick(row, 'Matter ID', 'Action ID', 'Matter Number', 'File Number', 'Id', 'ID') || null;
    if (!dry) {
      const existing = await findMatter(extRef, client.id, description);
      if (existing) {
        out.matters_updated++;
        continue;
      }
    }
    out.matters++;
    if (dry) continue;
    const rawStatus = (pick(row, 'Status', 'Matter Status', 'Step') || 'open').toLowerCase();
    const closed = /clos|complet|archiv|inactive/.test(rawStatus);
    const opened = (() => { try { return parseDate(pick(row, 'Opened', 'Date Opened', 'Created', 'Start Date')) || today(); } catch { return today(); } })();
    const ref = await nextRef(db, 'matters', 'ref', 'MT-', 1001);
    const [m] = await db.query(
      `insert into matters (ref, client_id, lawyer_id, matter_type, description, status, opened_on, closed_on, external_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [ref, client.id, lawyer?.id ?? null,
       (pick(row, 'Matter Type', 'Action Type', 'Practice Area', 'Type') || 'general').toLowerCase(),
       description, closed ? 'closed' : 'open', opened,
       closed ? (() => { try { return parseDate(pick(row, 'Closed', 'Date Closed', 'End Date')) || opened; } catch { return opened; } })() : null,
       extRef],
    );
    await createMatterRecords(db, m.id);
  }

  for (const row of timeRows || []) {
    const extRef = pick(row, 'Matter ID', 'Action ID', 'Matter Number', 'File Number');
    const clientName = pick(row, 'Client', 'Client Name');
    const client = clientName ? await findClient(clientName) : null;
    const matter = await findMatter(extRef, client?.id, pick(row, 'Matter', 'Matter Name', 'Action Name'));
    if (!matter) {
      if (!dry) {
        out.skipped.push(`time entry "${truncate(pick(row, 'Description', 'Narrative', 'Note') || '(no description)', 40)}": matter not found (import matters first)`);
        continue;
      }
      out.time_entries++;
      continue;
    }
    out.time_entries++;
    if (dry) continue;
    const minutes = (() => {
      const m1 = pick(row, 'Minutes', 'Duration Minutes', 'Units');
      if (m1) return Math.round(Number(m1)) || 0;
      const h = pick(row, 'Hours', 'Duration', 'Time');
      try { return parseMinutes(h); } catch { return 0; }
    })();
    if (!minutes) {
      out.time_entries--;
      out.skipped.push('time entry with no usable minutes or hours column');
      continue;
    }
    const rate = parseMoney(pick(row, 'Rate', 'Hourly Rate', 'Charge Rate')) || lawyer?.rate_cents || 30000;
    const billed = /bill|invoic/.test((pick(row, 'Status', 'Billing Status', 'Billed') || '').toLowerCase());
    await db.query(
      `insert into time_entries (matter_id, lawyer_id, worked_on, minutes, description, billable, rate_cents, status, external_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
      [matter.id, lawyer?.id ?? null,
       (() => { try { return parseDate(pick(row, 'Date', 'Worked On', 'Entry Date')) || today(); } catch { return today(); } })(),
       minutes, pick(row, 'Description', 'Narrative', 'Note') || 'Imported time entry',
       !/non.?bill|no.?charge/.test((pick(row, 'Billable', 'Type') || 'yes').toLowerCase()),
       rate, billed ? 'billed' : 'unbilled', pick(row, 'Entry ID', 'Time ID', 'Id', 'ID') || null],
    );
  }

  let text = dry ? heading('Import dry run: nothing was written') : heading('Imported');
  text += `\n  Clients: ${out.clients} new, ${out.clients_updated} already here`;
  text += `\n  Matters: ${out.matters} new, ${out.matters_updated} already here`;
  if (out.time_entries) text += `\n  Time entries: ${out.time_entries}`;
  if (out.skipped.length) {
    text += `\n  Skipped ${out.skipped.length}:`;
    for (const s of out.skipped.slice(0, 12)) text += `\n    - ${s}`;
    if (out.skipped.length > 12) text += `\n    ... and ${out.skipped.length - 12} more`;
  }
  text += '\n\n  Imported clients arrive with no CDD date and imported matters with an empty client care file, deliberately:';
  text += '\n  this system will not call a file complete because the old one never said otherwise.';
  text += '\n  The attention list and /compliance now show exactly what to backfill.';
  return { text, json: out };
}

async function cmdExport(db, args, flags) {
  const tables = ['lawyers', 'clients', 'matters', 'parties', 'matter_records', 'time_entries', 'disbursements', 'invoices', 'key_dates', 'undertakings', 'file_notes', 'tasks'];
  const dump = {};
  for (const t of tables) dump[t] = await db.query(`select * from ${t}`);
  const outFile = path.resolve(REPO_ROOT, str(flags.out) || `exports/matters-${today()}.json`);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(dump, null, 2));
  const counts = Object.fromEntries(tables.map((t) => [t, dump[t].length]));
  return {
    text: `Exported the whole database to ${path.relative(REPO_ROOT, outFile)}:\n  ` + tables.map((t) => `${t}: ${counts[t]}`).join(', '),
    json: { file: outFile, counts },
  };
}

// ---------------------------------------------------------------------------

const HELP = `
matters-for-claude-code: the record a law firm runs on.

  node scripts/matters.mjs <command> [args] [--flags]     (or: npm run matters -- <command>)

The week
  matters [--type=] [--lawyer=] [--all]     every open matter, next date and WIP on it
  attention                                 everything that wants a decision, worst first
  key-dates [--days=60]                     the calendar that must not slip, limitation first
  undertakings                              the register: open, overdue, discharged
  wip                                       unbilled work per matter, oldest first
  debtors                                   invoices out, aged
  lockup                                    WIP plus debtors per client: the money asleep
  time [--days=7] [--lawyer=]               who recorded what
  recovery                                  billed against worked, per lawyer
  compliance [rule]                         the rules in docs/compliance.md, run on the records
  stats                                     the practice in numbers

The records
  clients [q] [--all]   client <name>       the relationships
  matter <ref>                              one matter: parties, file, dates, time, money
  conflicts "<name>"                        the conflict search: clients, parties, matters, forever
  lawyers                                   the fee earners, rates and certificates
  invoice <number>                          one invoice and its ledger lines
  tasks [--all]

The work
  matter open <client> --about="..." [--type=] [--estimate=] [--fixed-fee=] [--against="Other Side; Their Company"]
  matter close <ref> [--write-off]
  time add <matter> "what was done" --hours=1.5 [--on=] [--no-charge] [--rate=]
  disbursement <matter> "what it was" --amount=
  bill <matter> [--through=] [--due-days=14]           drafts the invoice from WIP
  invoice sent <number>    invoice paid <number> [--amount=]
  key-date add <matter> "what" --due= [--kind=limitation|settlement|hearing|filing|renewal|deadline]
  key-date done <match> [--on=]
  undertaking give <matter> "the promise" --to= [--due=]
  undertaking discharge <match> [--on=]
  record <matter> "<record>" [--on=] [--na]            mark a client care file record
  cdd <client> [--on=] [--type=standard|enhanced]
  log <matter or client> "note" [--channel=]
  party add <matter> "<name>" [--role=]
  task add "title" [--matter= --client= --due=]   task done <match>
  add client|lawyer "<name>" [--flags]
  import actionstep|leap|clio|csv --clients= [--matters=] [--time=] [--dry-run]
  export [--out=file.json]

Money in dollars: --amount=450 means $450. Time as people say it: --hours=1.5, 90m, or 1:30.
Any command takes --json. Names, refs and numbers match case-insensitively; an ambiguous one
lists the candidates rather than guessing.
No trust accounting lives here, and nothing here files at a court or sends to a client.
`;

const COMMANDS = {
  clients: cmdClients,
  client: cmdClient,
  lawyers: cmdLawyers,
  matters: cmdMatters,
  matter: cmdMatter,
  conflicts: cmdConflicts,
  conflict: cmdConflicts,
  time: cmdTime,
  disbursement: cmdDisbursement,
  wip: cmdWip,
  bill: cmdBill,
  invoice: cmdInvoice,
  invoices: cmdDebtors,
  debtors: cmdDebtors,
  lockup: cmdLockup,
  recovery: cmdRecovery,
  'key-dates': cmdKeyDates,
  'key-date': cmdKeyDates,
  undertakings: cmdUndertakings,
  undertaking: cmdUndertakings,
  record: cmdRecord,
  cdd: cmdCdd,
  log: cmdLog,
  party: cmdParty,
  task: cmdTask,
  tasks: cmdTasks,
  compliance: cmdCompliance,
  attention: cmdAttention,
  stats: cmdStats,
  add: cmdAdd,
  import: cmdImport,
  export: cmdExport,
};

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = args;
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  const db = await getDb();
  try {
    const result = await fn(db, rest, flags);
    if (flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
    else process.stdout.write(result.text.replace(/^\n/, '') + '\n');
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`${e.message}\n`);
      return e.code;
    }
    if (/relation "?\w+"? does not exist/.test(e.message)) {
      process.stderr.write('The database has no tables yet. Run: npm run migrate\n');
      return 1;
    }
    throw e;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
