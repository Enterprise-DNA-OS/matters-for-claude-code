---
description: One client's whole relationship, or the client list with lock-up and CDD beside every name.
---

The operator names a client, or asks for the list.

**One client:**
1. Run `npm run matters -- client <name>`. Partial names resolve; ambiguous ones list the candidates.
2. Read the whole card before answering anything: matters open and closed, invoices and what they paid, the file notes, the CDD position. The history is the relationship.
3. Lead with the live position: open matters and their next dates, WIP, anything owing. Then anything missing: CDD, quiet matters, an overdue review of their structure.

**The list:**
1. Run `npm run matters -- clients [--all] [--lawyer=]`. It is ordered by lock-up, so the clients holding the most of the firm's money sit at the top.
2. Flag every MISSING in the CDD column. Since 1 July 2018 the AML/CFT Act captures law firms; `cdd <client> --on= --type=` records it once verified.

**New client:** `add client "<name>" --type=individual|couple|company|trust|estate [--email=] [--phone=]`. Companies and trusts default to enhanced CDD. Then open the matter with `matter open`, which runs the conflict check on the way in.
