---
description: Bring the practice across from Actionstep, LEAP, Clio or a plain CSV. Clients, matters and time, dry run first, gaps flagged honestly.
---

The operator has exports from the old system. The full walkthrough is [docs/replace-actionstep.md](../../docs/replace-actionstep.md); the short version:

1. Three files, any of them optional except clients on the first run:
   - **Clients** (Actionstep's participants or contacts export): name, email, phone, type.
   - **Matters** (the matters or actions export): client, matter name, type, status, matter id, date opened.
   - **Time** (the time entries export): matter id, date, hours or minutes, description, rate.
   The importer matches column names case-insensitively and accepts the common variants (Actionstep's "Action Name" and "Participant Name" included); nothing needs renaming.
2. Dry run first, always:
   `npm run matters -- import actionstep --clients=clients.csv --matters=matters.csv --time=time.csv --dry-run`
   Nothing is written. Read the counts and every skip reason. The usual cause of a skip is a matter whose client name does not match the client file exactly.
3. Then the same command without `--dry-run`. LEAP and Clio exports go through `leap` or `clio` in place of `actionstep`; anything else through `csv`.
4. Check it: `stats`, `clients`, `matters`, `wip`. The matter count and the client names are the two things to verify against the old system.

What arrives deliberately incomplete, and why:
- **No CDD dates.** The old system saying nothing is not evidence. `cdd <client> --on=` as each file is verified.
- **Empty client care files on imported matters.** Same reason. `/compliance` now lists exactly what to backfill.
- **No key dates and no undertakings.** They rarely export cleanly, and they are too important to import wrongly. Walk the live files once and put every limitation date and open undertaking in by hand: `key-date add`, `undertaking give`. That single pass is the most valuable hour of the migration.
