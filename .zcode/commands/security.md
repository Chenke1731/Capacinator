---
description: Run secret/dependency/signature security checks
---

Read `.zcode/skills/security/SKILL.md` and run the security checks appropriate to `$ARGUMENTS` (default: `security:audit`).

- Secret leak: revoke/rotate first; never print the secret.
- New OSV/signature finding: triage; do not silently update the baseline.
- ENCRYPTION_KEY rotation: run `--check` first; only rotate when it has zero encrypted rows or after `--re-encrypt`.
