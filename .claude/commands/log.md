---
description: A file note, a task, a party. The small entries that keep the record true, and the ones every quiet-matter alarm reads.
---

The operator says what happened in their own words: "rang the Fletcher director about filing", "met the Ormiston client", "chase the surveyor Friday".

Map it to the right write:

- **Contact or an attendance note:** `log <matter or ref> "what was said" [--channel=phone|email|meeting|letter|court] [--on=]`. Give the matter ref when it belongs to one; a bare client name files it against the client.
- **Something to do later:** `task add "chase the surveyor" --matter= --due=`. Done: `task done <match>`.
- **A new name on the other side:** `party add <ref> "<name>" --role=`. Every name recorded is a conflict caught later.
- **Time that was worked** is not a log entry, it is a time entry: `time add <ref> "..." --hours=`.

Two rules:
1. Log it when it happens, in the words it happened in. An attendance note is evidence; one written at month end is fiction with dates.
2. Never log a contact that did not happen to clear an alarm. The alarms exist to make the work happen, not the records.
