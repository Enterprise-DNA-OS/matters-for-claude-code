---
description: The conflict search. One name checked against every client, every party and every matter description, forever. Run it before any new retainer.
---

The operator gives a name: a prospective client, the other side, a company, a director.

1. Run `npm run matters -- conflicts "<name>"`. Run it once per distinct name: the person, their company, their trust. Short distinctive fragments beat full legal names ("Quays" finds Quays Hospitality Group Ltd).
2. Read the three sections separately, because they mean different things:
   - **As a client:** the firm has acted FOR this name. Acting against a current client is r 6.1 territory; against a former client, the question is confidential information (r 8.7A).
   - **As a party:** the firm has acted against or around them. What does the firm know from that file, and does it matter here?
   - **Named in a description:** weakest signal, still worth a look.
3. A hit is not automatically a conflict; it is a fact to assess. Say what was found in one line each and ask the operator to make the call. Never make it for them.
4. Whatever the call, record it on the matter so the file shows the check happened:
   `npm run matters -- record <ref> "conflict" --on=today --note="Searched X, Y. Found Z. Cleared because ..."`
5. A clean search on a new matter is recorded automatically when the matter is opened with `--against=`.

The search is only as good as the party records. Every matter should carry its other side: `party add <ref> "<name>" --role=`. A name recorded today is a conflict caught five years from now.
