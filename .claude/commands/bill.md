---
description: Draft an invoice from a matter's unbilled time and disbursements. The invoice is a draft; a person reads it and sends it.
---

The operator names a matter to bill.

1. Before billing, read the matter: `npm run matters -- matter <ref>`. Check the estimate position. If the work has passed the estimate and the client has not been told, that call happens first (r 3.5); a surprise bill is how complaints start.
2. Run `npm run matters -- bill <ref> [--through=YYYY-MM-DD] [--due-days=14]`.
   - It gathers every unbilled billable entry and disbursement, computes fees at the rates captured when the work was done, mints the next invoice number, and marks the ledger lines billed.
   - On a fixed fee matter it bills the fixed fee and notes the time recorded against it.
   - `--through=` bills up to a date and leaves newer work on the clock.
3. It will refuse if the letter of engagement is not on file (rr 3.4, 3.5). Fix the record, or `--force` only when the letter genuinely exists outside this system.
4. Render it to read: `npm run docs -- invoice`. The HTML lands in `docs-out/invoice/`, in the firm's brand from `brand.json`. Print to PDF from the browser.
5. Nothing sends from here. When the operator has sent it themselves: `invoice sent <number>`. When the money lands: `invoice paid <number> [--amount=]`. A short payment is called out so it gets chased or credited deliberately.

The draft-never-sent alarm on the attention list exists because a drafted bill is not revenue. Send it or delete the pretence.
