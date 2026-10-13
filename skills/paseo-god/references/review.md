# Review procedure

Use for a requested review or to check a consequential change before completion.

1. Identify the requested behavior, changed scope, applicable instructions and
   acceptance criteria. Inspect the actual diff and affected callers.
2. Trace concrete triggers through changed code. Look for behavior regressions,
   data loss, permission changes, dependency failures and missing coverage where
   relevant. Prefer findings with a reproducible trigger and observable impact.
3. Run proportionate checks and distinguish an observed failure from a reasoned
   risk. A delegated report, when delegation is authorized, still needs evidence.
4. If implementation is authorized, fix concrete in-scope issues and recheck
   the affected boundary. For a review-only request, report findings without
   silently editing the target.
5. Report actionable findings with path/location, trigger, impact and evidence.
   If none are found, say so with the validation performed and material limits.

This procedure does not require extra reviewers, security scans or a commit for
every task. Choose checks that can change the conclusion.
