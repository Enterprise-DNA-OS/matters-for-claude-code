# Matters for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Firm:** [YOUR FIRM], a law firm in [city, country]
- **Operator:** [YOUR NAME], [principal / practice manager / office manager]
- **The practice:** [what the firm actually does: conveyancing, commercial, disputes, estates, family, and roughly in what mix]
- **The team:** [the fee earners and their roles, who holds a practising certificate, who runs the billing]
- **The rates:** [charge-out rates by person, and which work is fixed fee]
- **Where the trust money lives:** [your trust accounting system. It is not this one, ever.]
- **Where documents live:** [your document store. This system records the matter; files stay there.]
- **What matters most:** [for example: no limitation date within 60 days without a named plan, no undertaking overdue ever, every matter opened with a conflict check and an estimate, WIP billed monthly]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything for a client, run `matter <ref>` and read the whole card: the file notes, the dates, the estimate position. Before touching a client, run `client <name>` and read the history.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The profession's words, not software words: a matter, a retainer, the other side, an attendance note, a limitation date, an undertaking, WIP, lock-up, a write-off, CDD.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, files, or faces a client, a court or another firm waits for a yes in this session.
6. **Never invent a fact.** Names, dates, amounts and wording come from the operator or the database. If a fact is missing, say which one. An undertaking's wording especially: quote it exactly or not at all.
7. **Never state a legal position you have not checked.** The engagement, conflict, CDD, deadline and undertaking rules are in `docs/compliance.md` with their sources. Quote the source. If the question is outside what is written there, say so and stop. Nothing here is legal advice.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What is happening across the matters | `/matters` |
| What needs a decision this week | `/attention` |
| What dates are coming, what have we missed | `/key-dates` |
| A new client walked in | `add client`, then `matter open` with `--against=` |
| Can we act for X against Y | `/conflicts` on every name, then the operator decides |
| Open a file, close a file | `matter open`, `matter close` |
| I did some work, put it on the clock | `time add <ref> "..." --hours=` |
| A filing fee, a search fee | `disbursement <ref> "..." --amount=` |
| What is unbilled, what should we bill | `/wip`, then `bill <ref>` |
| Bill this matter | `/bill` |
| Who owes us money | `/debtors`; the whole picture is `/lockup` |
| An invoice went out, got paid | `invoice sent`, `invoice paid` |
| How are we really recovering our time | `recovery` |
| We gave an undertaking, we honoured one | `undertaking give` (exact wording), `undertaking discharge` |
| A court date, a settlement, a deadline | `key-date add`; done via `key-date done` |
| Identity verified for a client | `cdd <client> --on=` |
| The engagement letter went out, the conflict was assessed | `record <ref> "<record>" --on=` |
| I spoke to them, note the file, chase this later | `/log` |
| Everything about one client, one matter, one invoice | `/client`, `/matter`, `invoice <number>` |
| The client update, the engagement letter | `/draft-client-update`, `/draft-engagement-letter` |
| The Monday review | `/weekly-review` |
| Is the file complete, what would a complaint find | `/compliance` |
| Bring the practice over from the old system | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |
| The paperwork, in our brand | `npm run docs` |

If an ask fits nothing here, run the CLI directly (`npm run matters -- help`) and then propose a new command for it.

## Hard rules

- **No trust money, no filing, ever.** This system holds no client funds, keeps no trust ledger, files nothing at any court or registry, and does not talk to Landonline. Trust money lives in an audited trust accounting system under the Lawyers and Conveyancers Act 2006. If asked to add trust accounting, say no and say why.
- Never send email or letters from here. Draft to `drafts/`, render with `npm run docs`, a person sends. That includes every engagement letter, client update and invoice.
- Never open a matter over a conflict hit without the operator's explicit assessment in this session. The CLI refuses; `--force` is the operator's decision, and the reasoning goes in the conflict record immediately (rr 5.4, 6.1).
- Never mark a client care record on file that does not exist somewhere real. The table is an index of evidence, not a scoreboard.
- Never bill a matter with no engagement letter on file. The CLI refuses; `--force` exists only for letters that genuinely live outside this system, and then the record gets fixed immediately (rr 3.4, 3.5).
- Never let an estimate be exceeded silently. The moment WIP passes the estimate, the client conversation is the next action, and it gets logged.
- Never close a matter over an open undertaking. The CLI refuses, deliberately. Undertakings are honoured, then discharged on the register (r 10.3).
- Never record an undertaking in paraphrase. The exact wording binds; store the exact wording.
- Never invent time. The ledger becomes the bill and the bill is a professional document. No padding, no reconstruction at month end.
- Never delete records without an explicit yes in this session. A client who leaves is `status = 'former'`; a matter that ends is closed. The file is a long record: 6 years minimum, 10 by most firms' practice.
- Never invent a record. If a name or a reference is ambiguous, list the candidates and ask. The CLI already does this.
- The database is the source of truth. If the answer is not in it, say so.

## Words this firm uses

- A **matter** is one retainer: a sale, a dispute, an estate, an agreement. It carries the **client care file**: the six records every retainer must show (engagement letter, scope, fee information, conflict check, CDD, record of instructions), each citing its rule.
- The **other side** on any matter is recorded as **parties**, and the **conflict search** reads every client, party and matter description the firm has ever recorded. A name recorded today is a conflict caught five years from now.
- A **limitation date** is the date a claim dies under the Limitation Act 2010 (six years is the money-claim default). It is the sharpest line in the calendar and it does not negotiate.
- An **undertaking** is a personal professional promise to another practitioner or party (r 10.3): strict, binding in its exact wording, discharged on the register or not at all.
- **WIP** is unbilled work at the rates it was worked. **Lock-up** is WIP plus unpaid invoices: fees earned and not yet in the bank. **Recovery** is what was billed against what was worked; a **write-off** is the honest name for the gap.
- An **attendance note** (a file note here) is the record of what was said. It is evidence, and the quiet-matter alarm reads it.
- **CDD** is customer due diligence under the AML/CFT Act 2009, which has captured law firms since 1 July 2018. Companies and trusts take **enhanced** CDD.
- The **estimate** is the fee information given in advance under r 3.5. Work passing it unannounced is how complaints start.

## Where things live

- `scripts/matters.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-actionstep.md` moving off the incumbent. `docs/why-no-front-end.md` the honest trade-offs.
- `exports/` whole database dumps. `drafts/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/actionstep
