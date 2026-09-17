---
description: The calendar that must not slip. Limitation dates first, then settlements, hearings, filings and renewals, counted down.
---

1. Run `npm run matters -- key-dates [--days=60]`.
2. Read limitation rows first, always. A limitation date under the Limitation Act 2010 is the one deadline that kills the claim itself, and a missed one is a negligence file with the firm's name on it. Anything inside 60 days gets a named owner and a plan today.
3. Then the rest by countdown: settlements and hearings this week, filings, renewal notices. Anything already MISSED is triaged first: what actually happened, what can still be done, does the client know.
4. When a date is dealt with: `key-date done <match> --on=`. The record of it being done matters as much as the doing.
5. New dates go on the moment they exist, in the words of the matter:
   `key-date add <ref> "File and serve briefs of evidence" --due= --kind=limitation|settlement|hearing|filing|renewal|deadline`
   Opening a litigation matter without recording its limitation date is how the nightmare starts. Ask for it whenever a litigation matter opens.

The countdown reads from the database, not from anyone's memory. That is the entire point of this table.
