# Scanner CI and repeated-use correction — 2026-10-14

The reported macOS failure was run
[38413448102](https://github.com/wilgon456/Paseobility/actions/runs/38413448102)
at commit `0234766`: the report-location fixture assumed optional ripgrep was
installed. Windows passed. The published v2.9.2 commit `8f3faab` subsequently
passed both jobs in
[38413822429](https://github.com/wilgon456/Paseobility/actions/runs/38413822429).
The notification is historical, not proof that the released commit failed.

The first fix supplied a ripgrep stub, but other host scanners were still
discoverable through inherited PATH. This follow-up removes that dependency
class and protects repeated scans themselves:

- POSIX fixtures construct a utility-only PATH. Installed Gitleaks, Semgrep,
  OSV, Trivy, TruffleHog, ShellCheck and personal ripgrep configuration cannot
  enter the test. No scanner downloads, authentication or network scan is needed.
- Shared Python discovery runs the isolated shell suite twice while deliberately
  planting hostile optional-tool stubs in the inherited PATH. A sentinel verifies
  none was called. Within each suite, three fresh scans retain exactly one finding.
- Both report helpers refuse nonempty output directories and target-contained
  output. Old report/JSON files are preserved, not deleted or mixed with a new
  run. PowerShell tests verify byte-preserved prior evidence under both available
  pwsh and Windows PowerShell.
- POSIX fallback exit 1 means no matches; exit greater than 1 means failed
  coverage and exits nonzero without a Low/clean summary. Missing rg remains an
  explicitly skipped check. Personal rg config is disabled for scan commands.
- CI executes the repeated fixtures in shared discovery; the separate stdlib
  classification suite remains independent. Historical failures are retained.

Local checks cover repeated fixture execution, absent/hostile tools, optional
scanner failure, fresh/reused reports, target-contained output, fallback read
errors, source-value omission and required report-write failure. Windows behavior
requires its CI runner; no PowerShell is installed on this Mac. Passing these
fixtures does not certify live optional scanner databases or malware coverage.

[GitHub reruns](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
use the original SHA; rerunning the old failed commit does not apply a new fix.
Verify the new commit's run and its repeated attempt instead.
