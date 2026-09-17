---
description: Draft the letter of engagement for a matter that is missing one, from the matter's own facts, into drafts/. Never sends.
---

The operator names a matter, or asks to clear every engagement gap on the board.

1. Find the gaps: `npm run matters -- compliance engagement` lists every open matter with no letter on file.
2. For each one, run `npm run matters -- matter <ref>` and draft to `drafts/engagement-<ref>-<client>.md`, carrying what rr 3.4 and 3.5 require in writing, in advance:
   - The scope: what the firm is doing, in the matter's own words, and what it is not doing.
   - The fee basis: the hourly rates by fee earner, or the fixed fee, and the estimate on the matter. Disbursements are extra and examples help.
   - Who has carriage of the work and their status.
   - The client care information: the professional indemnity position, the Fidelity Fund, the complaints process and the Law Society's role. Firms have standing wording for this block; use the operator's if they have one, and mark it clearly if a placeholder remains.
3. `npm run docs -- engagement-letter-draft` renders the branded version for every open matter missing the record, with the rates table and the matter facts attached.
4. When the letter has actually been sent by a person, close the record: `record <ref> "engagement" --on=<date sent>`, and usually `record <ref> "scope"` and `"fee"` with it, because one letter carries all three.

The draft carries the matter's facts; the firm's standing client care wording is the operator's to confirm. Never mark the record on file for a letter that was never sent.
