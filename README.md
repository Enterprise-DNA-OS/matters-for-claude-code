<h1 align="center">Matters for Claude Code</h1>

<p align="center">
  <strong>The open-source law firm practice system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Or installed and run for you.
</p>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-actionstep-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-actionstep">Instead of Actionstep</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Matters for Claude Code does the job you pay Actionstep for, as a Postgres database and a set of Claude Code commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) and ask for what you want in plain language. It runs the right query, and it can answer questions the Actionstep dashboards cannot.

It is built for a small law firm: the matters and the client care file every retainer must carry with each record citing its rule, the parties on the other side that the conflict check reads forever, the time and disbursement ledger that becomes the bill, the key date calendar with limitation dates at the top of it, the undertakings register, the aged debtors, and the lock-up number a principal actually manages by. The words are the words a lawyer already uses.

**No trust accounting lives here, and nothing files at a court, ever.** Trust money belongs in an audited trust account system under the Lawyers and Conveyancers Act 2006 and its Trust Account Regulations; the invoices here are the firm's own fee records. That boundary is deliberate.

```
/matters                          every open matter, next key date and WIP on it
/attention                        everything that wants a decision this week, worst first
/key-dates                        the calendar that must not slip, limitation dates first
/conflicts Quays                  one name checked against every client, party and matter, forever
/undertakings                     the register: open, overdue, discharged
/wip                              unbilled work per matter, oldest entry flagged
/lockup                           WIP plus debtors per client: the money asleep
/matter MT-1002                   one matter: parties, file, dates, time, money
/bill                             draft the invoice from the ledger; a person sends it
/compliance                       eight rules from the Acts and the Rules, run against your records
/weekly-review                    the Monday review, written from three commands
```

Time is recorded the way people say it (`1.5h`, `90m`, `1:30`) and stored in minutes at the rate captured on the day, so a rate change never rewrites history and every bill reconciles.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export request, no API project, no access ending when a subscription does.
- No per-user licence, no implementation project, no add-on module for the analytics. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/matters-for-claude-code.git
cd matters-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Harbourview Law (a demo Wellington firm with four fee earners, thirteen matters, a limitation date 21 days out on a debt claim nobody has touched in 40 days, an undertaking six days overdue, an employment matter past its estimate, a company client with no CDD, an invoice 52 days overdue and unbilled work 120 days old), then prints the matter board, the key dates, the attention list and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/matters`, `/key-dates`, `/conflicts Quays`, `/undertakings`, `/wip`, `/matter MT-1002`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`, or add clients one at a time with `add client`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md) so drafts come out in your firm's voice, put your firm's name and colours in [brand.json](brand.json) so the letters and invoices carry them, and give every open matter its estimate so the over-estimate alarm has a number to watch.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee. A firm shares one database: each person clones the repo, points at the same `DATABASE_URL`, sets `MATTERS_LAWYER` to their own name, and works in their own Claude Code.

## The commands

| Command | What it does |
|---|---|
| `/matters` | Every open matter: next key date, WIP against estimate, quiet days, file gaps. |
| `/matter` | One matter in full, or open one (`matter open`, conflict-checked on the way in) or close one (refuses over open undertakings). |
| `/conflicts` | The conflict search: one name against every client, party and matter description, forever. |
| `/key-dates` | The calendar that must not slip. Limitation dates outrank everything. `key-date add` / `done`. |
| `/undertakings` | The register, r 10.3. `undertaking give` in exact wording, `discharge` when honoured. |
| `/time` | Record time as people say it, read the week. Recovery reads the honest version. |
| `/wip` | Unbilled work per matter, oldest entry flagged, estimate position beside it. |
| `/bill` | Draft the invoice from the ledger. Refuses with no engagement letter on file. A person sends it. |
| `/debtors` | Invoices out, aged into buckets, drafts that never went out called out. |
| `/lockup` | WIP plus debtors per client. The money asleep, and whose. |
| `/recovery` (CLI `recovery`) | Billed against worked against written off, per fee earner, with the effective rate. |
| `/client` | One client's whole relationship, or the list ordered by lock-up. |
| `/attention` | Everything that wants a decision this week, worst first. |
| `/compliance` | Eight rules from the Acts and the Rules, run against your records, each with its source. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/draft-client-update` | The client update for one matter, from the record. Into `drafts/`. |
| `/draft-engagement-letter` | The engagement letter for any matter missing one. Into `drafts/`. |
| `/log` | A file note, a task, a party. The entries every quiet-matter alarm reads. |
| `/import` | Bring the practice across from Actionstep, LEAP, Clio or plain CSV. |
| `/customise` | Add a field, rename types, change a rule, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run matters -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # invoices, engagement letter drafts, matter status reports, fee earner week reports, as HTML
npm run view    # the week and the money, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your firm's name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached. Each rule cites its source, and the CLI enforces the sharpest three at the gate: a matter cannot open over an unassessed conflict hit, a bill cannot be drafted with no letter of engagement on file, and a matter cannot close over an undischarged undertaking.

1. Letter of engagement and client care information, in writing, in advance (Conduct and Client Care Rules 2008, rr 3.4, 3.5).
2. The fee basis given in advance (r 3.5).
3. A conflict check on file for every matter (rr 5.4, 6.1).
4. Customer due diligence before the retainer proceeds (AML/CFT Act 2009; law firms captured since 1 July 2018).
5. No key date missed on an open matter (r 3, and the Limitation Act 2010 behind it).
6. Every undertaking honoured on time (r 10.3).
7. The client told before the work passes the estimate (r 3.5).
8. Every fee earner who needs a practising certificate holds a current one (Lawyers and Conveyancers Act 2006).

The Australian equivalents (Legal Profession Uniform Law costs disclosure, the Australian Solicitors' Conduct Rules, the 2026 tranche 2 AML changes) are in the same file, at a high level, with the parts to read. Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your jurisdiction and your practice.

## Ten questions Actionstep cannot answer

Every one of these is answered by the demo data today. Yours will be different, and that is the point.

1. Which limitation dates fall in the next 90 days, and which of those matters has had no activity in a month?
2. Which undertakings are open right now, who gave each one, in what wording, and which are past their date?
3. Which open matters have blown past the estimate the client was given, before the bill goes out?
4. What would one name on the other side of a new retainer hit, across every client, party and matter the firm has ever recorded?
5. What is the firm's lock-up by client, and which two clients hold most of it?
6. What is each fee earner's real recovery rate and effective hourly rate after write-offs, not the charge-out rate on the letterhead?
7. Which open matters carry unbilled work more than 90 days old, and what is it worth at face value?
8. Which matters would a standards committee find incomplete today: no engagement letter, no conflict check, no CDD?
9. Which drafted invoices never went out, and how long have they sat?
10. If a lawyer left tomorrow, which matters, key dates and open undertakings move with them?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your firm.

1. "Put our fee earners in with our real charge-out rates, and our practising certificate renewal dates."
2. "Put our logo and colours on the invoices and letters, and change the firm name to ours."
3. "Our matter types are Property, Commercial, Disputes, Private Client. Rename them everywhere."
4. "Add a court reference and an opposing counsel field to litigation matters."
5. "Warn me at ninety days before a limitation date, not sixty. And email format the weekly review."
6. "Add a rule to `/compliance`: no litigation matter opens without a limitation date recorded."
7. "We bill conveyancing as fixed fee with a disbursements schedule. Make `/bill` show the schedule."
8. "We are in Australia. Rebuild the compliance file on the Uniform Law costs disclosure and the ASCR."
9. "Build me a page per fee earner for Monday: their matters, their dates, their undertakings, their WIP."
10. "Write me a command that drafts the settlement day checklist for a conveyancing file."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of Actionstep

Export from Actionstep's Data Export Report (Reports, then Matter Reports, then Export), run one command, and the practice comes with you. Step by step, with what maps and what deliberately does not: [docs/replace-actionstep.md](docs/replace-actionstep.md).

```bash
npm run matters -- import actionstep --clients=participants.csv --matters=actions.csv --time=time.csv --dry-run
npm run matters -- import actionstep --clients=participants.csv --matters=actions.csv --time=time.csv
```

LEAP and Clio exports go through the same command with `leap` or `clio` in place of `actionstep`. Anything else works with `csv`.

Every imported client arrives with no CDD date and every imported matter with an empty client care file, deliberately: this system will not call a file complete because the old one never said otherwise. `/compliance` then lists exactly what to backfill. Key dates and undertakings are entered by hand in one deliberate pass, because they are too important to import wrongly.

## Architecture

```
matters-for-claude-code/
  CLAUDE.md                              how the firm wants this run (routing table + house rules)
  brand.json                             your firm's name, logo and colours on every document and view
  views.json                             the HTML dashboards npm run view renders
  documents.json                         the paperwork npm run docs renders
  .claude/commands/                      the slash commands
  scripts/matters.mjs                    the CLI the commands drive
  scripts/view.mjs                       read-only HTML dashboards from the SQL views
  scripts/docs.mjs                       the documents, one HTML file per record
  scripts/lib/db.mjs                     one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/                   plain SQL schema, tables and views
  supabase/seed.sql                      demo data
  docs/compliance.md                     the rules /compliance checks, each with its source
  docs/replace-actionstep.md             moving off the incumbent
  docs/why-no-front-end.md               the honest trade-offs
  exports/                               whole database dumps
  drafts/                                letters and updates written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, no trust money, and nothing that files at a court or sends to a client.

## Want it installed and run for you?

Enterprise DNA installs Matters for Claude Code for your firm, migrates your Actionstep data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: https://calendly.com/sam-mckay/discovery-call
- Read more: https://enterprisedna.co/omni/instead-of/actionstep

## License

MIT. Copyright (c) 2026 Enterprise DNA.
