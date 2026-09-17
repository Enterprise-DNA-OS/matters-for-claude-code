---
description: Every open matter with its next key date, WIP, estimate position and file gaps. The board a principal reads first.
---

The operator wants the matter list. Arguments might be a type ("conveyancing"), a lawyer name, or nothing.

1. Run `npm run matters -- matters [--type=] [--lawyer=]`.
2. Lead with two numbers: how many open matters, and the WIP sitting on them. That second number is fees earned and not yet asked for.
3. Then read the dates, because a matter list is really a list of deadlines:
   - **Any limitation date** on the board outranks everything. It does not negotiate.
   - **Settlements and hearings inside seven days.** Those files get touched today.
   - **Anything quiet for more than thirty days** with money on the clock. Quiet matters are the ones clients complain about.
4. Flag any matter marked OVER on its estimate: the client gets told before the bill arrives (r 3.5), not by it.
5. Flag file gaps. The client care file is built at the start of the retainer, not when a complaint lands.
6. Name the lawyer on every line, and end with the two or three matters to touch today and one line each on why.

Open and close when the operator says so:
- `matter open <client> --about="..." --type= --estimate= --against="the other side"` opens with the conflict check run
- `matter close <ref>` closes, and refuses while an undertaking is open or WIP is unbilled

Nothing here files at a court or sends to a client. This is the record of the practice.
