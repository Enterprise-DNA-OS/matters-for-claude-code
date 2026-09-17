# The rule book /compliance runs

`npm run matters -- compliance` checks the records against the rules below and reports what is breached, with the source cited. The CLI also enforces the sharpest ones at the gate: a matter cannot open over an unassessed conflict hit, a bill cannot be drafted with no letter of engagement on file, and a matter cannot close over an undischarged undertaking.

**None of this is legal advice.** It is a rule book a New Zealand small firm pointed this system at, written down with sources so it can be checked, argued with, and changed. Your obligations are defined by the Acts, the Rules and your own practice; edit this file and the checks together (`/customise` does both).

## The eight rules

### 1. engagement: letter of engagement and client care information

**Source:** Lawyers and Conveyancers Act (Lawyers: Conduct and Client Care) Rules 2008, rr 3.4 and 3.5. Before undertaking significant work under a retainer, a lawyer must provide in writing the client care and service information (r 3.4) and the principal aspects of the service including the fee basis (r 3.5).
**The check:** every open matter has the `letter of engagement` record on file.
**The gate:** `bill` refuses on a matter with no letter on file, because the first document a client receives should not be an invoice.
**Fix:** `/draft-engagement-letter`, send it yourself, then `record <ref> "engagement" --on=`.

### 2. fees: the fee basis given in advance

**Source:** r 3.5: the basis on which fees will be charged and when payment is due, in writing, in advance.
**The check:** every open matter has the `fee information` record on file.
**Also watched:** the `estimates` rule below picks up the moment the work passes the number that was given.

### 3. conflicts: a conflict check on every matter

**Source:** rr 5.4 and 6.1: a lawyer must not act where there is a conflict between clients' interests, or between the client's interests and the lawyer's own.
**The check:** every open matter has the `conflict check` record on file.
**The gate:** `matter open --against=` runs the search across every client, party and matter description before the retainer exists, refuses on hits until they are assessed, and records a clean check automatically.
**Fix:** `conflicts "<name>"`, assess, then `record <ref> "conflict" --on= --note="what was found"`.

### 4. cdd: customer due diligence

**Source:** Anti-Money Laundering and Countering Financing of Terrorism Act 2009, ss 11 to 16. Law firms have been reporting entities since 1 July 2018 for captured activities (conveyancing, trust and company work, managing client funds among them).
**The check:** every open matter belongs to a client with a CDD date recorded.
**The nuance this system does not judge:** not every retainer is a captured activity, and companies and trusts need enhanced CDD. The check is deliberately broad; mark truly out-of-scope files with the record's `--na` flag and your reasoning in the note.
**Fix:** verify identity per your AML programme, then `cdd <client> --on= --type=standard|enhanced`.

### 5. deadlines: no key date missed on an open matter

**Source:** r 3 (a lawyer must act competently and in a timely manner), and behind it the Limitation Act 2010, whose s 11 gives a defendant a complete defence to a money claim filed more than 6 years after the act or omission (with late-knowledge and 15 year longstop periods in s 11(3)).
**The check:** no pending key date on an open matter is past its date.
**Fix:** deal with the date, then `key-date done <match> --on=`. A limitation date that genuinely moved gets edited with the reason in the note, never quietly.

### 6. undertakings: every undertaking honoured on time

**Source:** r 10.3: a lawyer must honour all undertakings, written or oral, given in the course of practice. Standards committees treat breach as unsatisfactory conduct even where nobody suffered loss.
**The check:** no undischarged undertaking is past its due date.
**The gate:** `matter close` refuses while any undertaking on the matter is open.
**Fix:** do the thing, or renegotiate with the recipient, today; then `undertaking discharge <match> --on=`.

### 7. estimates: the client told before the work passes the estimate

**Source:** r 3.5 (fee information in advance) and r 3.4A territory on changes: an estimate that silently becomes a bigger bill is a complaint in the post.
**The check:** no open hourly matter's unbilled-plus-billed work exceeds the estimate recorded on it.
**Fix:** ring the client, log the call, and revise the estimate on the matter with the client's agreement.

### 8. practising-certs: current certificates

**Source:** Lawyers and Conveyancers Act 2006: a "lawyer" is a person holding a current practising certificate (s 6), issued by the New Zealand Law Society (s 39). Certificates renew annually.
**The check:** every active fee earner other than a legal executive has a certificate on file that is not within 60 days of lapsing.
**Fix:** renew with the Law Society, then update the record.

## File retention, on closing

Not a live check, but the rule the closing reminder cites: New Zealand Law Society practice guidance treats records connected with the trust account as needing at least 6 years' retention from the last transaction, and most firms keep the client file 10 years from archive. When in doubt, keep it.

## Australia, at a high level

The same shapes exist under different names; a firm practising in Australia rebuilds this file on its own state's rules (each state's Legal Profession Uniform Law or equivalent). The parts to read:

- **Costs disclosure** replaces rr 3.4/3.5: Legal Profession Uniform Law ss 174 to 178 (disclosure of costs, estimates, and updates when they change) in NSW, Victoria and WA.
- **Conflicts and confidential information:** Australian Solicitors' Conduct Rules rr 10 to 12.
- **Undertakings:** ASCR r 6.
- **AML/CFT:** Australian lawyers become reporting entities under the AML/CTF Amendment Act 2024 tranche 2 reforms, with obligations commencing 1 July 2026; the Limitation equivalents are state Acts (6 years is the common contract period).
- **Practising certificates:** issued by each state's law society or bar association.

`/customise` rewrites the rules and the checks together. Change the words and the SQL in the same commit, so the report never claims a rule the doc does not carry.
