---
description: Run change-aware verification (T0/T1/T2) for the current changes
---

Read `.zcode/skills/verify/SKILL.md` and run the appropriate verification tier for the current change set. Use `$ARGUMENTS` as extra files or flags if provided.

- Default to T0 with the current working-tree changes.
- If the change is global UI, dependency-manifest, or T0 exits 2, escalate to T1.
- Report actual commands and results; never treat exit 2 as a pass.
