#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'matters-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded
delete env.MATTERS_LAWYER;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (v) => String(v ?? '').slice(0, 10);

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Local date, the same way the CLI computes "today". Never UTC: New Zealand is a day ahead of it.
const todayIso = (() => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the practice ---------------------------------------------------------

  const clients = run('clients', ['matters.mjs', 'clients']);
  assert(clients.length === 16, `sixteen active clients (${clients.length})`);
  assert(clients.some((c) => !c.cdd_completed_on), 'and a CDD gap that shows');

  const client = run('client card', ['matters.mjs', 'client', 'Fletcher']);
  assert(client.client.name === 'Fletcher Sheetmetal Ltd', 'resolved by partial name');
  assert(client.matters.length === 1, 'with the debt recovery matter');

  const noSuch = run('an unknown client exits 1', ['matters.mjs', 'client', 'nobody at all'], { json: false, expectFail: true });
  assert(/No client matches/.test(noSuch.stderr), 'and says so plainly');

  const ambiguous = run('an ambiguous name exits 1 and lists candidates', ['matters.mjs', 'client', 'a'], { json: false, expectFail: true });
  assert(/matches \d+ client records/.test(ambiguous.stderr), 'with the candidates listed');

  const lawyers = run('lawyers', ['matters.mjs', 'lawyers']);
  assert(lawyers.length === 4, 'four fee earners');
  assert(lawyers.some((l) => l.role === 'legal executive' && !l.practising_cert), 'the legal executive holds no certificate, correctly');

  // ---- the matters ----------------------------------------------------------

  const matters = run('matters', ['matters.mjs', 'matters']);
  assert(matters.length === 11, `eleven open matters (${matters.length})`);
  assert(matters.some((m) => m.over_estimate), 'the blown estimate is in it');
  assert(matters.some((m) => n(m.record_gaps) > 0), 'and the client care file gaps show');

  const matter = run('matter card', ['matters.mjs', 'matter', 'MT-1002']);
  assert(matter.matter.client_name === 'Fletcher Sheetmetal Ltd', 'resolved by ref');
  assert(matter.file.length === 6, 'six records in the client care file');
  assert(matter.key_dates.some((k) => k.kind === 'limitation'), 'the limitation date is on the card');
  assert(matter.parties.some((p) => p.name === 'Quays Hospitality Group Ltd'), 'and the other side is a party');

  const conflicts = run('conflict search', ['matters.mjs', 'conflicts', 'Quays']);
  assert(n(conflicts.hits) >= 2, `the Quays name hits more than once (${conflicts.hits})`);
  assert(conflicts.parties.some((p) => p.ref === 'MT-1001'), 'including the closed purchase where Quays was the vendor');

  const clean = run('a clean conflict search says so', ['matters.mjs', 'conflicts', 'Zebra Holdings']);
  assert(n(clean.hits) === 0, 'nothing invented');

  // ---- dates, undertakings, money ------------------------------------------

  const dates = run('key dates', ['matters.mjs', 'key-dates']);
  assert(dates.some((k) => k.kind === 'limitation' && n(k.days_left) === 21), 'the limitation date is 21 days out');
  assert(dates.some((k) => n(k.days_left) < 0), 'and the missed filing date shows');

  const uts = run('undertakings', ['matters.mjs', 'undertakings']);
  assert(uts.filter((u) => !u.discharged_on).length === 2, 'two open undertakings');
  assert(uts.some((u) => !u.discharged_on && n(u.days_overdue) > 0), 'one of them overdue');

  const wip = run('wip', ['matters.mjs', 'wip']);
  assert(wip.length >= 9, `WIP on most open matters (${wip.length})`);
  assert(wip.some((w) => n(w.oldest_unbilled_days) >= 120), 'the stale estate WIP shows');

  const debtors = run('debtors', ['matters.mjs', 'debtors']);
  assert(debtors.some((d) => d.status === 'sent' && n(d.days_overdue) >= 50), 'the 52 day overdue invoice shows');
  assert(debtors.some((d) => d.status === 'draft'), 'so does the draft that never went out');

  const lockup = run('lockup', ['matters.mjs', 'lockup']);
  const totalLockup = lockup.reduce((a, r) => a + n(r.lockup_cents), 0);
  assert(totalLockup > 1500000, `the lock-up is real money (${totalLockup})`);

  const recovery = run('recovery', ['matters.mjs', 'recovery']);
  assert(recovery.some((r) => n(r.written_off_cents) > 0), 'the write-off shows in recovery');

  const time = run('time, last 30 days', ['matters.mjs', 'time', '--days=30']);
  assert(time.length >= 5, `recent time entries (${time.length})`);

  // ---- compliance and attention ----------------------------------------------

  const compliance = run('compliance', ['matters.mjs', 'compliance']);
  assert(compliance.length === 8, 'eight rules in the book');
  const failed = compliance.filter((r) => r.breaches.length);
  assert(failed.map((r) => r.key).sort().join(',') === 'cdd,conflicts,deadlines,engagement,estimates,fees,practising-certs,undertakings',
    `the seeded breaches are exactly the story (${failed.map((r) => r.key).join(',')})`);

  const oneRule = run('one compliance rule', ['matters.mjs', 'compliance', 'undertakings']);
  assert(oneRule.length === 1 && oneRule[0].breaches.length === 1, 'run one rule on its own');

  const attention = run('attention', ['matters.mjs', 'attention']);
  assert(attention.length >= 20, `the attention list is loud (${attention.length})`);
  for (const reason of ['limitation_soon', 'key_date_missed', 'key_date_week', 'undertaking_overdue', 'cdd_missing', 'record_gap', 'over_estimate', 'invoice_overdue', 'wip_stale', 'invoice_draft', 'matter_quiet', 'practising_cert', 'task_overdue']) {
    assert(attention.some((a) => a.reason === reason), `attention carries ${reason}`);
  }

  run('stats', ['matters.mjs', 'stats']);

  // ---- a matter, end to end ----------------------------------------------------

  run('add a client', ['matters.mjs', 'add', 'client', 'Marama & Josh Field', '--type=couple', '--lawyer=Priya']);

  const blockedOpen = run('opening against a known name is refused', ['matters.mjs', 'matter', 'open', 'Field',
    '--about=Fencing dispute with the neighbour', '--type=litigation', '--against=Quays Hospitality', '--lawyer=Priya'], { json: false, expectFail: true });
  assert(/conflict check found prior involvement/.test(blockedOpen.stderr), 'and the refusal cites the rules');

  const opened = run('open a matter, conflict-checked', ['matters.mjs', 'matter', 'open', 'Field',
    '--about=Fencing dispute with the neighbour at 12 Awa Rd', '--type=litigation', '--estimate=4000',
    '--against=Gerald Prowse; Prowse Contracting Ltd', '--lawyer=Priya']);
  const ref = opened.ref;
  assert(/^MT-\d+$/.test(ref), `the matter ref is minted (${ref})`);

  const openedCard = run('the conflict check is on file', ['matters.mjs', 'matter', ref]);
  assert(openedCard.file.some((r) => r.kind === 'conflict check' && r.status === 'on file'), 'recorded with what was searched');
  assert(openedCard.parties.length === 2, 'and the other side became parties');

  run('record the CDD', ['matters.mjs', 'cdd', 'Field', '--on=today']);
  run('time on the clock', ['matters.mjs', 'time', 'add', ref, 'Initial instructions and review of the fence survey', '--hours=1.5', '--lawyer=Priya']);
  run('a 90 minute entry, said as minutes', ['matters.mjs', 'time', 'add', ref, 'Letter to Prowse Contracting', '--minutes=90', '--lawyer=Priya']);
  run('a disbursement', ['matters.mjs', 'disbursement', ref, 'Survey plan copy from LINZ', '--amount=30']);
  run('a key date', ['matters.mjs', 'key-date', 'add', ref, 'Reply due to Prowse counter-proposal', '--due=' + addDays(todayIso, 9), '--kind=deadline']);
  run('an undertaking', ['matters.mjs', 'undertaking', 'give', ref, 'Hold the boundary survey originals pending resolution', '--to=Prowse Contracting Ltd', '--due=' + addDays(todayIso, 30), '--lawyer=Priya']);
  run('a file note', ['matters.mjs', 'log', ref, 'Talked the Fields through the process and the estimate', '--lawyer=Priya']);

  const blockedBill = run('billing without an engagement letter is refused', ['matters.mjs', 'bill', ref], { json: false, expectFail: true });
  assert(/letter of engagement/.test(blockedBill.stderr), 'and the refusal cites rr 3.4 and 3.5');

  run('the engagement letter goes on file', ['matters.mjs', 'record', ref, 'engagement', '--on=today']);
  run('so do the scope, fees and instructions', ['matters.mjs', 'record', ref, 'scope', '--on=today']);
  run('fee information', ['matters.mjs', 'record', ref, 'fee', '--on=today']);
  run('record of instructions', ['matters.mjs', 'record', ref, 'instructions', '--on=today']);

  const billed = run('bill the matter', ['matters.mjs', 'bill', ref]);
  assert(/^INV-\d+$/.test(billed.number), `an invoice is minted (${billed.number})`);
  // 1.5h + 90m at Priya's $260/h = 3h = $780 fees, $30 disbursement.
  assert(n(billed.time_cents) === 78000, `the fees compute off the captured rate (${billed.time_cents})`);
  assert(n(billed.total_cents) === 81000, 'plus the disbursement');
  assert(billed.status === 'draft', 'and it is a DRAFT');

  const emptyBill = run('billing again finds nothing', ['matters.mjs', 'bill', ref], { json: false, expectFail: true });
  assert(/nothing unbilled/.test(emptyBill.stderr), 'the WIP moved onto the invoice');

  run('invoice sent', ['matters.mjs', 'invoice', 'sent', billed.number]);
  run('invoice paid', ['matters.mjs', 'invoice', 'paid', billed.number]);

  const blockedClose = run('closing with an open undertaking is refused', ['matters.mjs', 'matter', 'close', ref], { json: false, expectFail: true });
  assert(/undischarged undertaking/.test(blockedClose.stderr), 'r 10.3 does not close with the file');

  run('discharge the undertaking', ['matters.mjs', 'undertaking', 'discharge', 'boundary survey originals']);
  run('finish the key date', ['matters.mjs', 'key-date', 'done', 'Prowse counter-proposal']);
  run('now the matter closes', ['matters.mjs', 'matter', 'close', ref]);

  const closedCard = run('the closed matter reads back', ['matters.mjs', 'matter', ref]);
  assert(closedCard.matter.status === 'closed', 'status says so');
  assert(closedCard.invoices.length === 1 && closedCard.invoices[0].status === 'paid', 'with its paid invoice');

  // ---- the standing book keeps working ------------------------------------------

  run('discharge the overdue undertaking', ['matters.mjs', 'undertaking', 'discharge', 'easement instrument', '--on=today']);
  const utsAfter = run('the register updates', ['matters.mjs', 'undertakings']);
  assert(utsAfter.filter((u) => !u.discharged_on && n(u.days_overdue) > 0).length === 0, 'nothing overdue now');

  run('mark the missed filing done', ['matters.mjs', 'key-date', 'done', 's 21A agreement affidavit', '--on=today']);
  run('cdd for Waimarie', ['matters.mjs', 'cdd', 'Waimarie', '--on=today']);
  const complianceAfter = run('compliance improves', ['matters.mjs', 'compliance']);
  const failedAfter = complianceAfter.filter((r) => r.breaches.length).map((r) => r.key);
  assert(!failedAfter.includes('cdd') && !failedAfter.includes('undertakings') && !failedAfter.includes('deadlines'),
    `the fixed rules now pass (${failedAfter.join(',')})`);

  run('task add', ['matters.mjs', 'task', 'add', 'Send the Field closing letter', '--matter=' + ref, '--due=' + addDays(todayIso, 3), '--lawyer=Priya']);
  run('task done', ['matters.mjs', 'task', 'done', 'closing letter']);
  run('party add', ['matters.mjs', 'party', 'add', 'MT-1010', 'Apex Scaffolding insurers', '--role=related entity']);

  // ---- import ------------------------------------------------------------------

  const clientsCsv = path.join(dataDir, 'clients.csv');
  const mattersCsv = path.join(dataDir, 'matters.csv');
  const timeCsv = path.join(dataDir, 'time.csv');
  writeFileSync(clientsCsv, [
    'Participant Name,Email,Phone,Contact Type,City',
    '"Bevan & Kara Hoyle",hoyles@example.nz,021 700 001,Individual,Nelson',
    '"Tasman Joinery Ltd",office@tasmanjoinery.example.nz,03 555 0100,Company,Nelson',
    '"Fletcher Sheetmetal Ltd",accounts@fletchersheet.example.nz,04 555 0201,Company,Wellington',
  ].join('\n'));
  writeFileSync(mattersCsv, [
    'Client,Action Name,Action Type,Status,Matter ID,Date Opened',
    '"Bevan & Kara Hoyle",Purchase of 5 Brook St,Conveyancing,Active,AC-7001,' + addDays(todayIso, -30),
    '"Tasman Joinery Ltd",Shareholder exit and buyout,Commercial,Active,AC-7002,' + addDays(todayIso, -60),
    '"Tasman Joinery Ltd",Old lease dispute,Litigation,Closed,AC-7003,' + addDays(todayIso, -400),
  ].join('\n'));
  writeFileSync(timeCsv, [
    'Matter ID,Date,Hours,Description,Rate,Billable',
    'AC-7001,' + addDays(todayIso, -10) + ',1.5,Contract review,320,Yes',
    'AC-7002,' + addDays(todayIso, -5) + ',2,Buyout deed first draft,320,Yes',
  ].join('\n'));

  const dry = run('import dry run writes nothing', ['matters.mjs', 'import', 'actionstep', `--clients=${clientsCsv}`, `--matters=${mattersCsv}`, `--time=${timeCsv}`, '--dry-run', '--lawyer=Tane']);
  assert(n(dry.clients) === 2 && n(dry.clients_updated) === 1 && n(dry.matters) === 3, 'the dry run counts what it would do');

  const imported = run('import for real', ['matters.mjs', 'import', 'actionstep', `--clients=${clientsCsv}`, `--matters=${mattersCsv}`, `--time=${timeCsv}`, '--lawyer=Tane']);
  assert(n(imported.clients) === 2 && n(imported.matters) === 3 && n(imported.time_entries) === 2, 'and the real run does it');

  const hoyle = run('the imported practice reads back', ['matters.mjs', 'client', 'Hoyle']);
  assert(hoyle.matters.length === 1 && hoyle.client.cdd_completed_on === null, 'matter landed; CDD deliberately unknown');

  const reimport = run('re-importing updates rather than duplicating', ['matters.mjs', 'import', 'actionstep', `--clients=${clientsCsv}`, `--matters=${mattersCsv}`, '--lawyer=Tane']);
  assert(n(reimport.clients) === 0 && n(reimport.clients_updated) === 3 && n(reimport.matters) === 0 && n(reimport.matters_updated) === 3, 'the second run creates nothing new');

  const missingFile = run('a missing import file fails loudly', ['matters.mjs', 'import', 'csv', `--clients=${path.join(dataDir, 'not-there.csv')}`], { json: false, expectFail: true });
  assert(/No clients file/.test(missingFile.stderr), 'it exits non zero rather than importing nothing quietly');

  // ---- export --------------------------------------------------------------------

  const outFile = path.join(dataDir, 'dump.json');
  const dump = run('export', ['matters.mjs', 'export', `--out=${outFile}`]);
  assert(existsSync(outFile), 'the export file is on disk');
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  assert(parsed.matters.length === n(dump.counts.matters), 'the counts match the file');
  assert(!Object.keys(parsed).some((t) => /trust|receipt|payment_run|ledger_account/.test(t)), 'there is no trust accounting in the export');

  // ---- the branded HTML -----------------------------------------------------------

  const views = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]week\.html/.test(views.stdout) && /views[\\/]money\.html/.test(views.stdout), 'both views rendered');
  const weekHtml = readFileSync(path.join(root, 'views', 'week.html'), 'utf8');
  assert(weekHtml.includes('Needs a decision') && weekHtml.includes('Key dates'), 'the week view has its sections');
  assert(weekHtml.includes('undertakings register') && weekHtml.includes('Open matters'), 'and the rest of the week');
  const moneyHtml = readFileSync(path.join(root, 'views', 'money.html'), 'utf8');
  assert(moneyHtml.includes('Lock-up') && moneyHtml.includes('Recovery'), 'the money view has its sections');

  const docs = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/invoice/.test(docs.stdout), 'the invoices rendered');
  assert(/engagement-letter-draft/.test(docs.stdout), 'the engagement letter drafts rendered');
  assert(/matter-status-report/.test(docs.stdout), 'the matter status reports rendered');
  assert(/lawyer-week-report/.test(docs.stdout), 'the fee earner reports rendered');
  const letter = readFileSync(path.join(root, 'docs-out', 'engagement-letter-draft', 'mt-1004-sione-mele-tuipulotu.html'), 'utf8');
  assert(letter.includes('draft') && letter.includes('The retainer'), 'the engagement letter is plainly a draft with the matter facts attached');

  // ---- the human readable side ------------------------------------------------------

  run('clients (text)', ['matters.mjs', 'clients'], { json: false });
  run('client (text)', ['matters.mjs', 'client', 'Danielle Weiss'], { json: false });
  run('matters (text)', ['matters.mjs', 'matters'], { json: false });
  run('matter (text)', ['matters.mjs', 'matter', 'MT-1005'], { json: false });
  run('conflicts (text)', ['matters.mjs', 'conflicts', 'Ormiston'], { json: false });
  run('lawyers (text)', ['matters.mjs', 'lawyers'], { json: false });
  run('key-dates (text)', ['matters.mjs', 'key-dates'], { json: false });
  run('undertakings (text)', ['matters.mjs', 'undertakings', '--all'], { json: false });
  run('wip (text)', ['matters.mjs', 'wip'], { json: false });
  run('debtors (text)', ['matters.mjs', 'debtors'], { json: false });
  run('lockup (text)', ['matters.mjs', 'lockup'], { json: false });
  run('recovery (text)', ['matters.mjs', 'recovery'], { json: false });
  run('time (text)', ['matters.mjs', 'time', '--days=30'], { json: false });
  run('invoice (text)', ['matters.mjs', 'invoice', 'INV-5003'], { json: false });
  run('compliance (text)', ['matters.mjs', 'compliance'], { json: false });
  run('attention (text)', ['matters.mjs', 'attention'], { json: false });
  run('stats (text)', ['matters.mjs', 'stats'], { json: false });
  run('tasks (text)', ['matters.mjs', 'tasks', '--all'], { json: false });
  run('help', ['matters.mjs', 'help'], { json: false });
  run('an unknown command exits 1', ['matters.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\n${step} checks, PASS`);
} finally {
  if (existsSync(dataDir)) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows can hold the handle briefly; a leftover temp dir is harmless.
    }
  }
}
