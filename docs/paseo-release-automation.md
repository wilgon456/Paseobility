# Automatic Paseo compatibility checks

The `Paseo release compatibility` workflow checks npm's official
`@getpaseo/cli` `latest` and `beta` tags every hour at minute 17 UTC. GitHub
scheduled runs can be delayed. It also supports manual runs with a `force`
input to recheck the current releases, and checks both releases when a PR
changes this automation.

## Detection and verification

`config/paseo-compatibility.json` is the source of truth for verified versions,
the bounded legacy range and the older remote-daemon baseline. Normal CI reads
its compiler/SDK matrix from this file. The plugin regression suite verifies
that the manifest's range agrees with the policy.

An unseen release is prepared only in the verification job's checkout. The
workflow installs that exact published CLI and plugin SDK and checks:

1. Plugin TypeScript and regression tests.
2. The candidate's compiler and SDK registrations and cleanup.
3. Older daemon compiler with the new app SDK, and the reverse pairing.
4. A separate temporary daemon: plugin loading, skill status/search RPCs and
   agent subscription/list. It creates no coding agent. Empty runner skill
   homes are accepted without writing to personal skill folders or changing
   `HOME`. Relay, service proxy and speech features are disabled.

A receipt is written only after all steps and daemon cleanup pass. Promotion
requires one complete successful receipt per candidate for the exact checkout
SHA. Missing SDK packages, failed checks, stale proofs or a changed default
branch prevent publication. If one candidate fails, neither candidate in that
batch is promoted. There are no repository write permissions in verification
jobs.

## Generated PR

After a successful batch, a separate job opens or updates one PR on the reserved
`automation/paseo-compatibility` branch. Do not edit that managed branch by hand.
Only the policy and plugin manifest can be included. Future releases are added
as exact versions: proving beta.3 does not permit beta.4 or the stable release;
proving 0.16.0 does not permit 0.16.1. The legacy base range is not widened.

The workflow uses the repository's `GITHUB_TOKEN`, with write permissions only
on the publication job. The repository setting allowing Actions to create PRs
must be enabled; its default workflow permission remains read-only. No personal
token or machine connection secret is needed.

PR events created with `GITHUB_TOKEN` do not start other workflows. The publisher
therefore dispatches full `CI` explicitly on the generated branch, and avoids
dispatching a duplicate queued, running or successful run for the same SHA.
CI failures block the normal review/merge process; the automation does not merge
the PR or modify installed plugins on any PC. Installation/deployment remains a
separate step after merge. This workflow must be on the default branch for its
schedule to be active.

Evidence is retained as `paseo-proof-<version>` artifacts for 30 days and in
Actions summaries. A failed run produces no support-range update. Rendered
desktop/mobile interactions and real device testing are separate from these
compiler, SDK and live-daemon checks.

## Local commands

```bash
npm ci --prefix plugin
node scripts/paseo-compatibility.mjs detect
node scripts/paseo-compatibility.mjs detect --force
node scripts/paseo-compatibility.mjs matrix
npm --prefix plugin test
```

The detector validates canonical versions before passing them to tools. It
deduplicates the tags, recognizes new stable patches even within the legacy
allowance, and does not create a new PR when all current releases are already
recorded.

References: [Paseo plugin requirements](https://paseo.sh/docs/plugins/reference.md#requirements),
[GitHub workflow triggering](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow),
[create-pull-request token behavior](https://github.com/peter-evans/create-pull-request/tree/22a9089034f40e5a961c8808d113e2c98fb63676#token).
