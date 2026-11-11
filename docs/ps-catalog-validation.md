# Local skill catalog verification

2026-11-10 · P1 only · version 3.0.0 · macOS · Node 22.23.2.

The catalog reads original skill files and creates no catalog cache, usage log or configuration. Tests use temporary synthetic homes. Existing rename work and staged content are preserved. No installer was run against the real home, no dependencies were installed, and no agents or daemon were created or restarted.

## Files in this change

| Change | File | Purpose |
| --- | --- | --- |
| Added | [skills/ps/SKILL.md](../skills/ps/SKILL.md) | Explicit routing, original-file reading and instruction precedence. |
| Added | [skills/ps/scripts/skill-catalog.js](../skills/ps/scripts/skill-catalog.js) | Read-only live catalog, conflicts, warnings and budgets; Node 20+ stdlib. |
| Added | [skills/ps/scripts/skill-catalog.test.js](../skills/ps/scripts/skill-catalog.test.js) | Twenty synthetic-tree tests; no private skill fixtures. |
| Modified | [paseobility.json](../paseobility.json) | Register the thirteenth skill; retain version 3.0.0. |
| Modified | [plugin/shared/skills.ts](../plugin/shared/skills.ts) | Register catalog status and summary. |
| Modified | [plugin/shared/workflows.ts](../plugin/shared/workflows.ts) | Register catalog entry with existing icon and English/Korean labels. |
| Modified | [plugin/server/update-core.mjs](../plugin/server/update-core.mjs) | Accept bare ps; skip nonexistent legacy predecessor. |
| Modified | [plugin/tests/workflows.test.mjs](../plugin/tests/workflows.test.mjs) | Catalog draft, install/backup/rollback, ID rejection and manifest parity. |
| Modified | [plugin/paseo-plugin.json](../plugin/paseo-plugin.json) | Update workflow count. |
| Modified | [scripts/paseobility-doctor.py](../scripts/paseobility-doctor.py) | Allow catalog ID in integrity reports. |
| Modified | [scripts/check-plugin-runtime.mjs](../scripts/check-plugin-runtime.mjs) | Expect thirteen registered skills. |
| Modified | [scripts/validate-skills.py](../scripts/validate-skills.py) | Print the validated skill count. |
| Modified | [tests/test_skill_migration.py](../tests/test_skill_migration.py) | Thirteen-skill installation; preserve twelve legacy mappings; isolated catalog-only tests. |
| Modified | [.github/workflows/ci.yml](../.github/workflows/ci.yml) | Run catalog tests in both POSIX and Windows jobs. |
| Modified | [AGENTS.md](../AGENTS.md) | Catalog installation guidance and current count. |
| Modified | [README.md](../README.md) | Catalog usage, skill table, tree and current count. |
| Modified | [README.ko.md](../README.ko.md) | Korean catalog usage, skill table, tree and count. |
| Modified | [plugin/OVERVIEW.md](../plugin/OVERVIEW.md) | Catalog entry and bounded picker scope. |
| Modified | [docs/release-history.md](../docs/release-history.md) | Catalog paragraph in the existing v3.0.0 entry. |
| Modified | [docs/release-history.ko.md](../docs/release-history.ko.md) | Korean paragraph in the existing v3.0.0 entry. |
| Added | [docs/ps-catalog-validation.md](ps-catalog-validation.md) | This scoped verification record. |

## Verification

| Command | Result |
| --- | --- |
| `python3 -B -m unittest discover -s tests -p "test_*.py"` | PASS; 426 tests, 13 skipped (platform/tool prerequisites) |
| `for f in scripts/*.sh skills/*/scripts/*.sh; do bash -n "$f" \|\| exit; done` | PASS |
| `python3 -B skills/ps-multi/scripts/test_hosts.py` | PASS |
| `node --check skills/ps-multi/scripts/rpc.mjs` | PASS |
| `node --test tools/paseo-bot/bridge.test.mjs` | PASS |
| `node --test tools/paseo-bot/discord_core.test.mjs` | PASS |
| `python3 scripts/validate-skills.py` | PASS; prints OK with 13 skills |
| `python3 -B skills/ps-toss/scripts/verify.py` | PASS |
| `python3 -B skills/ps-toss/scripts/test_verify.py` | PASS |
| `python3 -B skills/ps-design/vendor/ui-ux-pro-max/scripts/validate_data.py` | PASS |
| `python3 -B -m unittest discover -s skills/ps-design/vendor/ui-ux-pro-max/scripts/tests -p "test_*.py"` | PASS |
| `node --test skills/ps-agent-cleanup/scripts/snapshot.test.mjs` | PASS |
| `node skills/ps-agent-cleanup/scripts/agent-cleanup.test.js` | PASS |
| `node --test skills/ps-god/scripts/god-run.test.mjs` | PASS |
| `python3 -B -m unittest discover -s skills/ps-browser/scripts -p "test_*.py" -v` | PASS |
| `node --test skills/ps-browser/scripts/browser-sweep.test.mjs` | PASS on retry outside sandbox; process listing is restricted in the sandbox |
| `node skills/ps-share/scripts/paseo-share.test.js` | PASS |
| `node skills/ps/scripts/skill-catalog.test.js` | PASS; 20 tests on the final implementation |
| `python3 -B skills/ps-spyware-check/scripts/spyware-check.test.py` | PASS |
| `node skills/ps-design/scripts/design-check.mjs --selftest` | PASS outside sandbox; temporary headless Ego Lite profile |
| `npm test --prefix plugin` | 43 PASS, one known failure: missing `@getpaseo/protocol` |
| `npm --prefix plugin run typecheck` | BLOCKED: local `tsc` is absent |
| `npm --prefix tools/paseo-bot/plugin run typecheck` | BLOCKED: local `tsc` is absent |
| `npm --prefix tools/paseo-bot/plugin test` | One PASS, three test files cannot load: missing `@getpaseo/plugin`, `zod`, `playwright` |
| `git diff --check` | PASS |

The Python suite also requires local socket/process access; its final passing run was outside the sandbox. Dependencies were not installed to address missing tools. The twelve legacy-name migration assertions remain twelve because the new catalog has no legacy counterpart.

## Limits

- Windows and PowerShell behavior was not executed on this Mac; CI includes the shared catalog tests and the added PowerShell installer case.
- The published-host compiler/SDK matrix needs dependencies and was not executed.
- Plugin picker rendering on phone, tablet, desktop and native clients was not verified. The checker selftest validates the checker only. The new entry reuses the existing workflow renderer and verified icon.
- Local skill choice quality was not re-evaluated with separate model sessions; no other agents were created. The helper intentionally has no keyword search command.
- User-specific host check sizes and original paths are reported only in the final response, not stored in this repository.
