-- matters-for-claude-code: core schema.
-- A law firm practice system: the lawyers and their practising certificates,
-- the clients and the AML/CFT due diligence behind each one, the matters with
-- the client care file every retainer must carry, the parties on the other
-- side (the conflict check reads them forever), the time and disbursement
-- ledger that becomes the bill, the invoices and the aged debtors, the key
-- dates a firm must never miss (a limitation date above all), and the
-- undertakings register.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
--
-- Money is stored in cents and it is a RECORD, not a bank balance. This system
-- has NO trust accounting, deliberately: trust money lives in a trust account
-- under the Lawyers and Conveyancers Act 2006 and its Trust Account
-- Regulations, with its own audited software. Invoices here are the firm's own
-- fee records. Time is stored in minutes; rates in cents per hour.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Lawyers ---------------------------------------------------------------------
-- The fee earners. practising_cert is the New Zealand practising certificate
-- (renewed every year); legal executives do not hold one, so the compliance
-- check reads the role. rate_cents is the default charge-out rate per hour,
-- captured onto each time entry when it is recorded.

create table if not exists lawyers (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  code            text,
  email           text,
  phone           text,
  role            text not null default 'solicitor',   -- principal | solicitor | legal executive
  practising_cert text,                                 -- certificate reference, if the role needs one
  pc_expires_on   date,
  rate_cents      integer not null default 30000,       -- per hour
  active          boolean not null default true,
  started_on      date,
  external_ref    text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists lawyers_name_lower_idx on lawyers (lower(full_name));

-- Clients ---------------------------------------------------------------------
-- One client is one person or entity the firm acts for. cdd_completed_on is
-- the AML/CFT customer due diligence date; law firms have been captured by the
-- AML/CFT Act 2009 since 1 July 2018, and the CLI refuses to open a captured
-- matter without it recorded or flagged.

create table if not exists clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  client_type       text not null default 'individual',  -- individual | couple | company | trust | estate
  email             text,
  phone             text,
  city              text,
  referred_by       text,
  lawyer_id         uuid references lawyers(id) on delete set null,
  status            text not null default 'active',      -- active | former
  cdd_completed_on  date,
  cdd_type          text,                                 -- standard | enhanced
  external_ref      text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists clients_name_lower_idx on clients (lower(name));

-- Matters ---------------------------------------------------------------------
-- One matter is one retainer: a sale, a dispute, an estate, an agreement. The
-- estimate is the fee information given to the client in advance (Rules of
-- Conduct and Client Care 2008, r 3.5); when unbilled work passes it, the
-- attention list says so, because telling the client late is a complaint.

create table if not exists matters (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique,
  client_id        uuid not null references clients(id) on delete cascade,
  lawyer_id        uuid references lawyers(id) on delete set null,
  matter_type      text not null default 'general',  -- conveyancing | litigation | family | estates | commercial | employment | property | general
  description      text not null,
  status           text not null default 'open',     -- open | closed
  opened_on        date not null default current_date,
  closed_on        date,
  billing_type     text not null default 'hourly',   -- hourly | fixed
  estimate_cents   bigint,                            -- the fee information given in advance
  fixed_fee_cents  bigint,
  note             text,
  external_ref     text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists matters_client_idx on matters (client_id);
create index if not exists matters_status_idx on matters (status);

-- Parties ---------------------------------------------------------------------
-- Everyone on or around a matter who is not the client: the other side, their
-- solicitor, a counterparty company, a beneficiary. The conflict check reads
-- this table and the client list together, forever. A name recorded here today
-- is a conflict caught five years from now.

create table if not exists parties (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  name        text not null,
  role        text not null default 'other party',  -- other party | counterparty | other side solicitor | beneficiary | related entity | witness
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists parties_matter_idx on parties (matter_id);
create index if not exists parties_name_idx on parties (lower(name));

-- The client care file ----------------------------------------------------------
-- The records every retainer must carry, created as "missing" the day the
-- matter opens, because this system will not call a file complete on no
-- evidence. Each kind cites its source. /compliance reads this table; so does
-- a Law Society standards committee when a complaint lands.

create table if not exists matter_records (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid not null references matters(id) on delete cascade,
  kind        text not null,
  status      text not null default 'missing',   -- missing | on file | n/a
  done_on     date,
  standard    text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (matter_id, kind)
);

-- Time and disbursements ---------------------------------------------------------
-- The ledger that becomes the bill. Minutes, not decimals of an hour, so the
-- arithmetic is integer arithmetic; the CLI accepts "1.5h" and "90m" and
-- stores 90. rate_cents is captured from the lawyer at entry so a rate change
-- never rewrites history. status moves unbilled -> billed at `bill`, or to
-- written off, which is how recovery gets measured instead of imagined.

create table if not exists time_entries (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  lawyer_id    uuid references lawyers(id) on delete set null,
  worked_on    date not null default current_date,
  minutes      integer not null,
  description  text not null,
  billable     boolean not null default true,
  rate_cents   integer not null,                  -- per hour, captured at entry
  status       text not null default 'unbilled',  -- unbilled | billed | written off
  invoice_id   uuid,
  external_ref text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists time_matter_idx on time_entries (matter_id);
create index if not exists time_status_idx on time_entries (status);

create table if not exists disbursements (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references matters(id) on delete cascade,
  incurred_on  date not null default current_date,
  description  text not null,
  amount_cents bigint not null,
  status       text not null default 'unbilled',  -- unbilled | billed
  invoice_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists disb_matter_idx on disbursements (matter_id);

-- Invoices ----------------------------------------------------------------------
-- The firm's own fee records: rendered from WIP by `bill`, sent by a person,
-- paid into the office account. No trust money, ever. Aged debtors are a
-- subtraction from due_on, not a report you buy.

create table if not exists invoices (
  id                   uuid primary key default gen_random_uuid(),
  number               text unique,
  matter_id            uuid not null references matters(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  issued_on            date not null default current_date,
  due_on               date,
  time_cents           bigint not null default 0,
  disbursements_cents  bigint not null default 0,
  total_cents          bigint not null default 0,
  status               text not null default 'draft',  -- draft | sent | paid
  sent_on              date,
  paid_on              date,
  paid_cents           bigint,
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists invoices_matter_idx on invoices (matter_id);

-- Key dates ---------------------------------------------------------------------
-- The dates a firm must never miss. A limitation date under the Limitation
-- Act 2010 is the sharpest: miss it and the claim dies with the file open.
-- Settlements, hearings, filing deadlines and lease renewals live here too.

create table if not exists key_dates (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references matters(id) on delete cascade,
  kind          text not null default 'deadline',  -- limitation | settlement | hearing | filing | renewal | deadline
  title         text not null,
  due_on        date not null,
  completed_on  date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists key_dates_matter_idx on key_dates (matter_id);

-- Undertakings --------------------------------------------------------------------
-- A solicitor's undertaking is a personal professional promise (Rules of
-- Conduct and Client Care 2008, r 10.3: honour it, strictly and on time).
-- Firms die by the undertaking someone gave on the phone and nobody wrote
-- down. This register is where they all live.

create table if not exists undertakings (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references matters(id) on delete cascade,
  lawyer_id      uuid references lawyers(id) on delete set null,
  given_on       date not null default current_date,
  given_to       text not null,
  undertaking    text not null,
  due_on         date,
  discharged_on  date,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists undertakings_matter_idx on undertakings (matter_id);

-- File notes and tasks ---------------------------------------------------------------

create table if not exists file_notes (
  id          uuid primary key default gen_random_uuid(),
  matter_id   uuid references matters(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  lawyer_id   uuid references lawyers(id) on delete set null,
  noted_on    date not null default current_date,
  channel     text not null default 'phone',   -- phone | email | meeting | letter | court
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists file_notes_client_idx on file_notes (client_id);
create index if not exists file_notes_matter_idx on file_notes (matter_id);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  matter_id   uuid references matters(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  lawyer_id   uuid references lawyers(id) on delete set null,
  due_on      date,
  status      text not null default 'open',   -- open | done
  done_on     date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at triggers -----------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['lawyers','clients','matters','matter_records','time_entries','disbursements','invoices','key_dates','undertakings','tasks']
  loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- =============================================================================
-- Views: the questions a firm asks every week, as SQL it can read.
-- =============================================================================

-- Work in progress per matter: unbilled time at its captured rates, plus
-- unbilled disbursements, with the age of the oldest unbilled entry. WIP that
-- sits is fees the firm has earned and not asked for.
create or replace view v_wip as
select
  m.id as matter_id,
  m.ref,
  c.name as client,
  c.id as client_id,
  coalesce(a.full_name, 'unassigned') as lawyer,
  m.matter_type,
  m.status as matter_status,
  coalesce((select sum(round(t.minutes * t.rate_cents / 60.0))
            from time_entries t where t.matter_id = m.id and t.status = 'unbilled' and t.billable), 0)::bigint as wip_time_cents,
  coalesce((select sum(t.minutes) from time_entries t
            where t.matter_id = m.id and t.status = 'unbilled' and t.billable), 0)::integer as wip_minutes,
  coalesce((select sum(d.amount_cents) from disbursements d
            where d.matter_id = m.id and d.status = 'unbilled'), 0)::bigint as wip_disb_cents,
  coalesce((select sum(round(t.minutes * t.rate_cents / 60.0))
            from time_entries t where t.matter_id = m.id and t.status = 'unbilled' and t.billable), 0)::bigint
    + coalesce((select sum(d.amount_cents) from disbursements d
                where d.matter_id = m.id and d.status = 'unbilled'), 0)::bigint as wip_cents,
  (select min(t.worked_on) from time_entries t
   where t.matter_id = m.id and t.status = 'unbilled') as oldest_unbilled_on,
  (current_date - (select min(t.worked_on) from time_entries t
                   where t.matter_id = m.id and t.status = 'unbilled')) as oldest_unbilled_days,
  m.estimate_cents,
  m.billing_type,
  m.fixed_fee_cents
from matters m
join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id;

-- The matter list, one row per open matter, with the numbers a principal
-- scans: WIP, the estimate position, the next key date, activity and the
-- client care file gaps.
create or replace view v_matters as
select
  m.id as matter_id,
  m.ref,
  c.name as client,
  c.id as client_id,
  coalesce(a.full_name, 'unassigned') as lawyer,
  m.matter_type,
  m.description,
  m.status,
  m.opened_on,
  (current_date - m.opened_on) as days_open,
  w.wip_cents,
  m.estimate_cents,
  (m.estimate_cents is not null and m.billing_type = 'hourly'
   and w.wip_cents + coalesce((select sum(i.total_cents) from invoices i where i.matter_id = m.id), 0) > m.estimate_cents) as over_estimate,
  (select min(k.due_on) from key_dates k where k.matter_id = m.id and k.completed_on is null) as next_key_date_on,
  (select k.title from key_dates k where k.matter_id = m.id and k.completed_on is null order by k.due_on limit 1) as next_key_date,
  greatest(
    (select max(fn.noted_on) from file_notes fn where fn.matter_id = m.id),
    (select max(t.worked_on) from time_entries t where t.matter_id = m.id)
  ) as last_activity_on,
  (current_date - greatest(
    (select max(fn.noted_on) from file_notes fn where fn.matter_id = m.id),
    (select max(t.worked_on) from time_entries t where t.matter_id = m.id)
  )) as days_since_activity,
  (select count(*) from matter_records mr where mr.matter_id = m.id and mr.status = 'missing') as record_gaps,
  (select count(*) from undertakings u where u.matter_id = m.id and u.discharged_on is null) as open_undertakings,
  c.cdd_completed_on
from matters m
join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id
left join v_wip w on w.matter_id = m.id;

-- Key dates, pending first, the countdown attached. A negative number on a
-- limitation row is the worst line of SQL a law firm can read.
create or replace view v_key_dates as
select
  k.id as key_date_id,
  m.ref,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as lawyer,
  m.status as matter_status,
  k.kind,
  k.title,
  k.due_on,
  k.completed_on,
  (k.due_on - current_date) as days_left,
  k.note
from key_dates k
join matters m on m.id = k.matter_id
join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id;

-- The undertakings register, open first.
create or replace view v_undertakings as
select
  u.id as undertaking_id,
  m.ref,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as lawyer,
  u.given_on,
  u.given_to,
  u.undertaking,
  u.due_on,
  u.discharged_on,
  (current_date - u.due_on) as days_overdue
from undertakings u
join matters m on m.id = u.matter_id
join clients c on c.id = m.client_id
left join lawyers a on a.id = u.lawyer_id;

-- Aged debtors: every unpaid invoice with its bucket.
create or replace view v_debtors as
select
  i.id as invoice_id,
  i.number,
  m.ref,
  c.id as client_id,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as lawyer,
  i.issued_on,
  i.due_on,
  i.total_cents,
  i.status,
  i.sent_on,
  (current_date - i.due_on) as days_overdue,
  case
    when i.due_on >= current_date then 'current'
    when current_date - i.due_on <= 30 then '1 to 30'
    when current_date - i.due_on <= 60 then '31 to 60'
    when current_date - i.due_on <= 90 then '61 to 90'
    else 'over 90'
  end as bucket
from invoices i
join matters m on m.id = i.matter_id
join clients c on c.id = i.client_id
left join lawyers a on a.id = m.lawyer_id
where i.status <> 'paid';

-- Lock-up per client: WIP nobody has billed plus bills nobody has paid. The
-- number that decides whether a firm makes payroll comfortably or anxiously.
create or replace view v_lockup as
select
  c.id as client_id,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as lawyer,
  coalesce((select sum(w.wip_cents) from v_wip w where w.client_id = c.id and w.matter_status = 'open'), 0)::bigint as wip_cents,
  coalesce((select sum(d.total_cents) from v_debtors d where d.client_id = c.id), 0)::bigint as debtors_cents,
  coalesce((select sum(w.wip_cents) from v_wip w where w.client_id = c.id and w.matter_status = 'open'), 0)::bigint
    + coalesce((select sum(d.total_cents) from v_debtors d where d.client_id = c.id), 0)::bigint as lockup_cents
from clients c
left join lawyers a on a.id = c.lawyer_id
where c.status = 'active';

-- Recovery per lawyer: minutes worked against minutes billed and written off,
-- and what the effective rate really was after the write-offs.
create or replace view v_recovery as
select
  coalesce(a.full_name, 'unassigned') as lawyer,
  a.id as lawyer_id,
  coalesce(sum(t.minutes) filter (where t.billable), 0)::integer as billable_minutes,
  coalesce(sum(t.minutes) filter (where not t.billable), 0)::integer as no_charge_minutes,
  coalesce(sum(round(t.minutes * t.rate_cents / 60.0)) filter (where t.billable), 0)::bigint as worked_cents,
  coalesce(sum(round(t.minutes * t.rate_cents / 60.0)) filter (where t.status = 'billed'), 0)::bigint as billed_cents,
  coalesce(sum(round(t.minutes * t.rate_cents / 60.0)) filter (where t.status = 'written off'), 0)::bigint as written_off_cents,
  coalesce(sum(round(t.minutes * t.rate_cents / 60.0)) filter (where t.status = 'unbilled' and t.billable), 0)::bigint as unbilled_cents
from time_entries t
left join lawyers a on a.id = t.lawyer_id
group by a.id, a.full_name;

-- The client care file gaps that matter: an open matter missing records. This
-- is what a standards committee reads first when a complaint lands.
create or replace view v_record_gaps as
select
  m.ref,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as lawyer,
  m.matter_type,
  m.opened_on,
  mr.kind as missing_record,
  mr.standard
from matter_records mr
join matters m on m.id = mr.matter_id
join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id
where mr.status = 'missing' and m.status = 'open';

-- One client, one line: the whole relationship.
create or replace view v_client_position as
select
  c.id as client_id,
  c.name as client,
  c.client_type,
  c.status,
  coalesce(a.full_name, 'unassigned') as lawyer,
  c.cdd_completed_on,
  (select count(*) from matters m where m.client_id = c.id and m.status = 'open') as open_matters,
  (select count(*) from matters m where m.client_id = c.id) as all_matters,
  coalesce((select sum(w.wip_cents) from v_wip w where w.client_id = c.id and w.matter_status = 'open'), 0)::bigint as wip_cents,
  coalesce((select sum(d.total_cents) from v_debtors d where d.client_id = c.id), 0)::bigint as owing_cents,
  coalesce((select sum(i.paid_cents) from invoices i where i.client_id = c.id and i.status = 'paid'), 0)::bigint as lifetime_paid_cents,
  (select max(fn.noted_on) from file_notes fn where fn.client_id = c.id) as last_contact_on,
  (current_date - (select max(fn.noted_on) from file_notes fn where fn.client_id = c.id)) as days_since_contact
from clients c
left join lawyers a on a.id = c.lawyer_id;

-- Everything that wants a decision, one union, worst first. The reasons are
-- the ones a principal actually loses sleep over.
create or replace view v_attention as
-- A limitation date already missed on an open matter. The claim may be dead.
select 'limitation_missed' as reason, m.ref as label, c.name as client, coalesce(a.full_name, '') as lawyer,
       (current_date - k.due_on) as days, null::bigint as amount_cents,
       'LIMITATION DATE ' || to_char(k.due_on, 'YYYY-MM-DD') || ' has passed: ' || k.title as detail
from key_dates k join matters m on m.id = k.matter_id join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id
where k.kind = 'limitation' and k.completed_on is null and k.due_on < current_date and m.status = 'open'
union all
-- A limitation date inside sixty days.
select 'limitation_soon', m.ref, c.name, coalesce(a.full_name, ''),
       (k.due_on - current_date), null::bigint,
       'limitation date ' || to_char(k.due_on, 'YYYY-MM-DD') || ': ' || k.title
from key_dates k join matters m on m.id = k.matter_id join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id
where k.kind = 'limitation' and k.completed_on is null and m.status = 'open'
  and k.due_on between current_date and current_date + 60
union all
-- Any other key date inside seven days, or missed.
select case when k.due_on < current_date then 'key_date_missed' else 'key_date_week' end,
       m.ref, c.name, coalesce(a.full_name, ''),
       abs(k.due_on - current_date), null::bigint,
       k.kind || ' ' || to_char(k.due_on, 'YYYY-MM-DD') || ': ' || k.title
from key_dates k join matters m on m.id = k.matter_id join clients c on c.id = m.client_id
left join lawyers a on a.id = m.lawyer_id
where k.kind <> 'limitation' and k.completed_on is null and m.status = 'open'
  and k.due_on <= current_date + 7
union all
-- An undertaking past its date and not discharged.
select 'undertaking_overdue', u.ref, u.client, u.lawyer,
       u.days_overdue, null::bigint,
       'given to ' || u.given_to || ' on ' || to_char(u.given_on, 'YYYY-MM-DD') || ': ' || u.undertaking
from v_undertakings u
where u.discharged_on is null and u.due_on is not null and u.due_on < current_date
union all
-- Unbilled work past the estimate the client was given.
select 'over_estimate', v.ref, v.client, v.lawyer,
       null::integer, v.wip_cents,
       'work on the clock has passed the estimate: tell the client before the bill does'
from v_matters v
where v.status = 'open' and v.over_estimate
union all
-- An open matter with money on the clock and no activity for thirty days.
select 'matter_quiet', v.ref, v.client, v.lawyer,
       v.days_since_activity, v.wip_cents,
       case when v.last_activity_on is null then 'no time or file note ever recorded'
            else 'last activity ' || to_char(v.last_activity_on, 'YYYY-MM-DD') end
from v_matters v
where v.status = 'open'
  and (v.last_activity_on is null or v.days_since_activity > 30)
union all
-- Unbilled WIP where the oldest entry is over ninety days old.
select 'wip_stale', w.ref, w.client, w.lawyer,
       w.oldest_unbilled_days, w.wip_cents,
       'oldest unbilled entry ' || to_char(w.oldest_unbilled_on, 'YYYY-MM-DD') || ': bill it or write it off'
from v_wip w
where w.matter_status = 'open' and w.wip_cents > 0 and w.oldest_unbilled_days > 90
union all
-- An invoice past its due date.
select 'invoice_overdue', d.number, d.client, d.lawyer,
       d.days_overdue, d.total_cents,
       'issued ' || to_char(d.issued_on, 'YYYY-MM-DD') || ', due ' || to_char(d.due_on, 'YYYY-MM-DD') || ' (' || d.bucket || ' days)'
from v_debtors d
where d.status = 'sent' and d.due_on < current_date
union all
-- A draft bill never sent.
select 'invoice_draft', d.number, d.client, d.lawyer,
       (current_date - d.issued_on), d.total_cents,
       'drafted ' || to_char(d.issued_on, 'YYYY-MM-DD') || ' and never sent'
from v_debtors d
where d.status = 'draft' and d.issued_on <= current_date - 7
union all
-- An open matter for a client with no AML/CFT due diligence on file.
select 'cdd_missing', m.ref, c.name, coalesce(a.full_name, ''),
       (current_date - m.opened_on), null::bigint,
       'opened ' || to_char(m.opened_on, 'YYYY-MM-DD') || ' with no CDD on the client (AML/CFT Act 2009)'
from matters m join clients c on c.id = m.client_id left join lawyers a on a.id = m.lawyer_id
where m.status = 'open' and c.cdd_completed_on is null
union all
-- A client care record missing on an open matter.
select 'record_gap', g.ref, g.client, g.lawyer,
       null::integer, null::bigint,
       'missing: ' || g.missing_record
from v_record_gaps g
union all
-- A practising certificate expiring inside sixty days, or not on file at all.
select 'practising_cert', coalesce(l.code, ''), l.full_name, l.full_name,
       case when l.pc_expires_on is null then null else (l.pc_expires_on - current_date) end, null::bigint,
       case when l.practising_cert is null or l.practising_cert = '' then 'no practising certificate on file'
            else 'certificate expires ' || to_char(l.pc_expires_on, 'YYYY-MM-DD') end
from lawyers l
where l.active and l.role <> 'legal executive'
  and (l.practising_cert is null or l.practising_cert = ''
       or (l.pc_expires_on is not null and l.pc_expires_on <= current_date + 60))
union all
-- A task past its date.
select 'task_overdue', t.title, coalesce(c.name, ''), coalesce(a.full_name, ''),
       (current_date - t.due_on), null::bigint,
       'due ' || to_char(t.due_on, 'YYYY-MM-DD')
from tasks t left join clients c on c.id = t.client_id left join lawyers a on a.id = t.lawyer_id
where t.status = 'open' and t.due_on < current_date;
