# Moving off Actionstep

Actionstep can export its raw data, and this system imports it. The move is one afternoon of exports and one command, then a single deliberate pass over the live files. This page is the whole path.

## 1. Export from Actionstep

Actionstep's Data Export Report lives at **Reports, then Matter Reports, then Export**. Each data source you tick exports as its own CSV. Take at least:

- **Contacts / participants**: names, emails, phones, contact type.
- **Matters (actions)**: matter id, action name, type, status, date opened.
- **Time entries**: matter id, date, hours, description, rate, billing status.

If your firm has API access, everything the report exports is also on the REST API (`docs.actionstep.com`), which is useful for documents and notes later. Export while your subscription is live: departing firms have reported access ending abruptly at the subscription boundary.

## 2. Import here

Dry run first, always:

```bash
npm run matters -- import actionstep --clients=participants.csv --matters=actions.csv --time=time.csv --dry-run
```

Nothing is written. Read the counts and every skip reason; the usual cause of a skip is a matter whose client name does not match the participants file exactly. Then the same command without `--dry-run`.

The importer matches Actionstep's column names (`Participant Name`, `Action Name`, `Action ID`, `Action Type`, `Step`) and the common variants case-insensitively. LEAP and Clio exports go through the same command with `leap` or `clio` in place of `actionstep`; anything else through `csv`.

## 3. What maps

| Actionstep | Here |
|---|---|
| Participants / contacts | `clients` (type inferred from the export or the name) |
| Matters / actions | `matters`, with `external_ref` holding the Actionstep matter id |
| Action type | `matter_type` |
| Status / step | open or closed |
| Time entries | `time_entries`, billed or unbilled from the billing status column |
| Rates on time entries | captured per entry, so history bills at the rate it was worked |

Re-running the import updates rather than duplicates: clients match on name, matters on the Actionstep id.

## 4. What does not carry over, deliberately

- **CDD dates.** The old system saying nothing is not evidence. `cdd <client> --on=` as each file is verified against your AML programme.
- **The client care file.** Every imported matter arrives with all six records missing. `/compliance` then lists exactly what to backfill, and only what genuinely exists gets marked on file.
- **Key dates and undertakings.** These rarely export cleanly, and they are the two tables too important to import wrongly. Walk the live files once and enter every limitation date, settlement, hearing and open undertaking by hand: `key-date add`, `undertaking give`. That pass is the most valuable hour of the whole migration, and most firms find at least one date nobody was watching.
- **Documents.** Files stay where they live (your document store); this system records the matter, not the PDFs. The Actionstep API can bulk-pull documents if you want them out too.
- **Workflow automations.** Actionstep's steps and workflows do not translate, and mostly do not need to: the weekly rituals are slash commands here, and `/customise` adds yours.
- **Trust accounting.** Not imported and not rebuilt, deliberately. Trust money stays in an audited trust accounting system; see the boundary in the README.

## 5. Verify

```bash
npm run matters -- stats
npm run matters -- clients
npm run matters -- matters --all
npm run matters -- wip
```

The matter count and the client names are the two things to check against the old system. Then run `/attention` and let the list tell you what the migration surfaced.
