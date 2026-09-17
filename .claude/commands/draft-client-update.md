---
description: Draft the client update for one matter, from the record, into drafts/. What has happened, what it has cost, what is next. Never sends.
---

The operator names a matter whose client needs an update. The quiet-matter alarm is usually why.

1. Run `npm run matters -- matter <ref>` and read the whole card: the file notes, the key dates, the time, the estimate position. The update is written from the record, not from memory.
2. Write the update to `drafts/update-<ref>-<client>.md`, in the firm's voice (the operator block in CLAUDE.md):
   - What has happened since they last heard, in plain words. File notes are the source; translate them out of lawyer shorthand.
   - What happens next and when. The next key date, named and dated.
   - The fees position, honestly: what has been billed and what is on the clock. If the work has passed the estimate, this letter is where the client hears it, with the reason and a revised number (r 3.5). Never let the invoice deliver that news.
   - One page. No filler. It should read like the lawyer wrote it between calls.
3. If the operator wants the branded version instead, `npm run docs -- matter-status-report` renders every open matter's report as HTML with the same facts attached.
4. Say plainly: this is a draft, a person sends it, and the note of sending goes on the file: `log <ref> "Sent the client update" --channel=email`.

Never send anything from here. Never state a legal position that is not already on the file; every fact comes from the database, and if one is missing, say which.
