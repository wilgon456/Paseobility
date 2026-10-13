# Skill improvements and validation — 2026-10-13

Scope: the local v2.9.1 preparation after the dependency refresh, without a push
or release. Existing edits from the dependency refresh were preserved.

## Research applied

| Primary source | Resulting change |
| --- | --- |
| [Paseo 0.11.2 data model](https://github.com/getpaseo/paseo/blob/v0.11.2/docs/data-model.md) | Use confirmed idle/error/closed states, permission/attention guards and workspaceId ownership; never infer ownership from cwd |
| [Paseo CLI list source](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/ls.ts) and [inspect source](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/inspect.ts) | These projections omit ownership or pagination. Use full paginated snapshots from the installed client |
| [Paseo archive source](https://github.com/getpaseo/paseo/blob/v0.11.2/packages/cli/src/commands/agent/archive.ts) | Full-ID client dispatch avoids first-page CLI ID resolution; retain explicit inactive-state checks before archive |
| [Playwright best practices](https://playwright.dev/docs/best-practices) and [Page API](https://playwright.dev/docs/api/class-page#page-wait-for-function) | Role/name and label locators, bounded postcondition waits, fresh result readback; avoid fixed sleeps/networkidle as readiness proof |
| [Node child processes](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options) | Bounded owned child processes and JSON stdin; avoid cmd.exe interpolation in cleanup |
| [Python unittest skipping](https://docs.python.org/3/library/unittest.html#skipping-tests-and-expected-failures) | Explicit SkipTest for four upstream-only modules, with reasons; runtime/data tests still execute |

## Cleanup changes

The helper defaults to a read-only preview. Unknown/missing states and permission
or unfinished attention stay protected, including explicit IDs. Short IDs must
be unambiguous. A workspace-only request no longer implicitly selects disposable
agents elsewhere; this additional bug was found by regression testing.

A complete snapshot requires all pages, valid unique IDs and a stable server
identity. Looped/inconsistent pagination, missing metadata or a timeout refuses
success. The adapter closes only its own installed-client connection. No SDK
package, pairing material, arbitrary RPC or other backend is fetched.

Before each archive, the helper checks fresh state. The dispatch adapter checks
identity/protection again within its connection and submits only the exact ID.
Afterward, the helper immediately verifies the acknowledgement's full ID and
timestamp plus removal from a new complete snapshot. Workspace verification also
checks that its children are absent. An uncertain result stops remaining
mutations; already verified effects are retained as partial failure.

The server API does not provide a single atomic inactive-only archive condition.
A concurrent new run can still race a separate read/action. The documentation
states this limit. Workspace terminals are not classified as disposable by the
helper; explicit authorization for that exact workspace remains required.

The installed-client interface is internal and version-sensitive. macOS Paseo
0.11.2 was read live; Windows discovery/dispatch has source and fixture coverage,
not a fresh Windows live run. Existing broader compatibility records retain
their historical scope.

## Verification

- Shared Python tests: 54 passed (including five catalog/frontmatter cases).
- Cleanup decision/verification tests: 23 passed.
- Installed-client adapter fixture tests: 8 passed. They cover every page,
  repeated/inconsistent cursor rejection, exact-ID archive on a later page,
  running agent/workspace refusal, changed server identity and connection close.
- Vendored design tests: 137 passed; 4 upstream-repository-only modules skipped
  with explicit reasons. Their supporting root scripts are not part of the
  shipped skill. No skipped test is counted as a runtime pass.
- Design data validation: 12 domain files, 22 stack files and ui-reasoning.csv passed.
- design-check: all 13 selftest checks passed using installed headless Edge.
- Catalog/frontmatter and applicable syntax/diff checks passed locally.
- A real read-only cleanup preview with the installed Mac client succeeded.
  No live agent or workspace was archived in this validation.
- Updated CloakBrowser 0.6.2 / Playwright 1.64.0 recipe waited for a result delayed
  by 400ms and freshly read 12; its browser and localhost fixture server closed.

## CI and installation

CI now validates version/catalog/frontmatter with PyYAML as a CI-only dependency,
runs the vendored data and runtime suites, tests the new adapter and syntax-checks
PowerShell under scripts, tests and skills. Independent Python checks use separate
steps so a later successful command cannot mask an earlier failure on Windows.
The shared default suite remains usable without PyYAML by explicitly skipping its
validation-only tests; CI installs the dependency before the suite.

Updated skill copies are installed with timestamped backups; file equality is
checked after installation. Claude's previously missing paseo-multi copy is
filled through the selected-skill installer. No host registry is imported and
Paseo is not restarted. GitHub CI for these unpushed changes and a fresh Windows
live runtime are not claimed.
