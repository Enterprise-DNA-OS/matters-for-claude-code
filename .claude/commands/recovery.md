---
description: Billed against worked against written off, per fee earner, with the effective rate. The honest version of utilisation.
---

1. Run `npm run matters -- recovery`.
2. Read the recovery percentage per lawyer: billed against billed-plus-written-off. The gap between the charge-out rate and the effective rate is the discount the firm is silently giving.
3. Say what the write-offs were, not just their size: `matter <ref>` on the matters that carry them. Rework, scope creep and estimate overruns each have a different fix.
4. No-charge time is shown separately and deliberately. Work the firm chooses to eat is a decision; work that evaporates unbilled is not.
5. Unbilled value is not lost yet; it is the WIP list. If recovery looks fine but unbilled is large, the problem is billing rhythm, not write-offs: go to `wip`.

For a printable version, `npm run view -- money` renders recovery beside lock-up and the aged debtors.
