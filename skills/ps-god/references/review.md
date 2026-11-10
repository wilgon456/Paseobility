# Review procedure

Use for a requested review or to check a consequential change before completion.

1. Pin what is reviewed: a fixed point (commit, branch, tag or merge base) and
   the diff from it (`git diff <point>...HEAD`). Confirm the reference resolves
   and the diff is not empty before reviewing anything.
2. Review along two separate axes:
   - **Request**: does the change do what the issue, spec or user asked, and
     only that? Compare against the literal requirements and acceptance
     criteria; note anything missing or added.
   - **Standards**: does it follow this repository's documented rules
     (`AGENTS.md`, `CONTRIBUTING.md`, style or architecture documents)? A
     documented rule overrides general taste; skip what tooling already
     enforces.
   For a large diff, give each axis to its own helper so one does not color the
   other, and merge their findings yourself.
3. Trace concrete triggers through the changed code and its callers. Look for
   behavior regressions, data loss, permission changes, platform differences,
   dependency failures and missing coverage.
4. Keep a finding only when a run, test or concrete trace shows its trigger and
   impact; label anything else a risk with what would confirm it. A delegated
   report still needs that evidence.
5. When the task includes fixing, fix in-scope issues and recheck the affected
   boundary. For a review-only request, report without editing the target.
6. Report findings by axis with path, trigger, impact and evidence. If none are
   found, say so with the checks performed and their limits.

This procedure does not require extra reviewers, security scans or a commit for
every task. Choose checks that can change the conclusion.
