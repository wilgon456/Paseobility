# Dinobot comparison for Paseo God — 2026-10-25

Scope: static inspection of selected non-design modules at Dinobot commit
`5071c150773140c8fc167e662004668ec90ba55c`, compared with the existing God
entrypoint, run helper/template, debugging, review and spike procedures. The
upstream main revision was rechecked on this date. This is a workflow comparison,
not a full repository audit or execution of Dinobot.

The Paseobility instructions are independently written. No Dinobot files, code,
instruction prose, assets or dependencies were copied into the package. The
public project uses PolyForm Noncommercial; its runtime was not installed or
executed for this comparison.

## Decisions

Source links below are pinned to the inspected revision.

| Area and inspected source | Useful distinction | Paseo God decision |
| --- | --- | --- |
| [Verification contract and freshness](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/verification.ts), [execution observations](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/verification-execution.ts) | Requirements/scenarios/checks are linked; results depend on the checked inputs and method, not only a passed label. | Add criterion/scenario/expected-result links and input state to RUN.md. Refresh affected evidence after a relevant change. Repair a method without silently shrinking the requested outcome. No runtime certificate claim. |
| [Task prompt profile](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/extensions/task-profile.ts) | A compact final check against exact requested names catches completion errors; a large prompt is not automatically better. | Preserve literal paths, names, formats and counts; inspect the actual final deliverable. Keep analysis/preparation within its requested boundary. Retain proportional reading/check costs rather than importing a provider-specific profile. |
| [Programming guidance](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/plugins/skills/bundled.ts) | Reuse needs semantic compatibility; shared-state changes need known writers, transitions and affected callers. | Add a conditional change-boundary reference for shared APIs, persisted state and coordinated work. No mandatory LSP, abstraction or symbol inventory for a local correction. |
| [Plan compiler](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/plan.ts), [resource claims](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/claims.ts) | Read/write conflicts and producer/consumer order matter; a task ending or a claim expiring does not prove that all effects ended. | Make optional handoffs explicit about input revision, owned paths, dependencies and returned evidence. Reconcile interrupted effects before an overlapping writer or retry. A worktree does not isolate shared external resources. No new DAG executor or lock service. |
| [Research state](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/research.ts), [experiment execution](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/research-experiments.ts), [readiness parsing](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/research-readiness.ts) | Candidate defects, evaluator failure and missing evidence differ; comparisons need a stable baseline and a confirmation step. | Extend the existing spike reference with controlled comparisons, retained failed/unavailable trials, proportionate confirmation and an inconclusive result when appropriate. Do not import its mission service or numeric defaults. |
| [Review evidence](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/memory/evidence.ts) | A failing regression can be useful debugging evidence, whereas unchanged failed tool calls can indicate no progress. Its findings are explicitly heuristic. | Distinguish product/check failures from tool/environment failures. A relevant fix justifies a recheck; repeated attempts without new evidence require another approach. Do not infer skill compliance from command-token matching. |
| [Scoped working agreements](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/memory/agreements.ts) | Project and broader scopes differ; duplicate lessons can share evidence, and human-authored/deleted guidance should not be casually rewritten or revived. | Improve learning candidates with trigger, evidence, scope and limits; deduplicate and distinguish explicit preferences from inferred lessons. Keep the existing proposal-only boundary. No automatic native-memory writes or always-on agreement injection. |
| [Skill evaluation](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/skills/evaluation.ts), [registered runner](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/skills/evaluation-runner.ts), [publication policy](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/skills/publication-policy.ts) | A measured comparison, a structural decision and permission to publish are distinct. Trusted fixtures, scoring, instrumentation and current baseline checks live outside the candidate. | Carry controlled-comparison principles into spikes and learning proposals. Defer automatic skill evolution, statistical promotion and deployment: a prose workflow cannot replace trusted runtime enforcement, and a trial does not authorize publication. |
| [Tool search](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/tool-search.ts) | Retrieve relevant capability descriptions instead of assuming a fixed tool surface. | Already covered by active-schema discovery and selective reference loading. Do not add a second router, tool index or claimed token saving. |

Design remains in `paseo-design`. God continues to use that skill and record its
evidence rather than duplicating creative procedures here.

## What changed and what did not

Changed: God instructions, the editable RUN.md template, a verification
reference, a change-boundary reference and the existing spike procedure. The
record helper's commands, metadata schema, single-writer convention and
explicit-only invocation policy are unchanged. Existing Markdown records can
still be resumed; the agent can add relevant evidence detail as work continues.

These additions are agent procedures. They do not mechanically invalidate an
old result, prevent a concurrent write, attest a process or certify completion.
Keep that distinction when reporting outcomes. No broad success-rate, cost or
performance improvement is established by this source comparison.

## Validation

Apple Silicon macOS, Node 22.23.2 and Python 3.9.22:

- Catalog/frontmatter and skill-creator validation passed; relative reference
  links resolved. The helper and explicit-only invocation metadata are unchanged.
- All 11 existing run-helper tests passed, including copied installation,
  CRLF templates, Unicode records, read-only resume and symlink rejection.
- Temporary installation and reinstallation in a path with spaces matched
  all 10 skill files under both `.agents` and `.claude`. Original/prior backups
  and an unrelated skill fixture were preserved. The copied helper created,
  listed and resumed a record.
- An independent agent exercised the four requests below in isolated synthetic
  local fixtures. Parent review inspected the actual changes/report and reran
  both sets of three existing tests and the read-only ledger audit.

| Request | Observed behavior |
| --- | --- |
| Resume a regression with historical green evidence | Marked old evidence stale, reproduced the uppercase/lowercase regression, made the one-line fix and passed all three original scenarios. Preserved the user note and tests. |
| Check a successful-looking verification configuration | Found an unmatched test-name filter selecting no behavioral cases. Removed only that filter and ran all three original assertions successfully; product and test sources stayed unchanged. |
| Finish an interrupted non-idempotent operation | Inspected the authoritative ledger and verified one application without replaying the increment/append operation. Ledger bytes remained unchanged. |
| Prepare a comparison report from incomplete measurements | Kept the report-only scope, retained the timeout/unknown row and identified different environments and missing confirmation. Completed the report while leaving performance superiority unproven. |

The exercise also exposed different Node resolution in a subprocess and the
implicit manual path for updating run status. The instructions now identify
the actual runner when versions differ and explicitly say to edit `- Status:`
in RUN.md. The evaluator reviewed those clarifications without repeating
unchanged checks and found no remaining material ambiguity for these requests.

The real local `.agents/skills/paseo-god` was then updated through the
single-skill installer with its default backup. All 10 installed files matched
the final source, and the backup matched the previous eight-file installation.
Digest comparison confirmed the other 29 installed agent skills and the Claude
God installation were unchanged. No daemon restart was needed.

The cases check these bounded decisions, not general task success rates,
concurrency isolation, external exactly-once execution or statistical evidence
quality. Windows/Linux behavior and fresh provider discovery were not exercised.

## Follow-up: plan, propagate and preserve context

The user authorized the additional candidates and requested an explicit initial
plan/TODO flow. The entrypoint now states a proportionate plan before substantive
changes and keeps it current through the task. The optional planning-and-handoff
reference and RUN.md template connect that plan to the following distinctions:

| Inspected basis | Follow-up adoption |
| --- | --- |
| [Goal amendment admission test](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/test/goal-admission.test.ts#L36) rejects a child effect/result bound to an old request epoch. | Record request revisions, update owned helpers through supported controls and reconcile old work before conflicting steps. Reassess late old-scope results against current criteria. No host-enforced epoch service is claimed. |
| [Research context](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/research-context.ts) includes lineage, contract and feedback and rejects missing/oversized context rather than silently omitting it. | Preserve critical requirements, rejected decisions, current evidence, unresolved effects and next checks in a compact handoff. Check source accessibility and surface missing material. No fixed byte limit or mandatory transcript dump is imported. |
| [Session skill manifests](https://github.com/dinobot-labs/dinobot/blob/5071c150773140c8fc167e662004668ec90ba55c/src/core/skills/manifests.ts#L285) retain a selected skill basis across conversation ancestry. | Record the actual loaded skill path and revision/digest, including references used; assess material drift on resume or handoff. Do not pretend a Markdown record pins runtime execution or override new user/project instructions with an old snapshot. |

The helper commands, run.json identity schema and explicit-only invocation remain
unchanged. Existing run records can acquire current provenance and a concise
plan without inventing a historical version. Prior validation above describes
the earlier revision; follow-up validation is recorded separately below.

## Follow-up validation

On the same local macOS/Node/Python environment, all 11 existing helper tests,
catalog/frontmatter and skill-creator validation passed. A temporary install and
reinstall under a path with spaces matched all 11 skill files in both `.agents`
and `.claude`, preserved the original/prior backups and unrelated fixture, and
exercised copied-helper initialization and read-only resume. Helper code/schema
and invocation metadata remain unchanged.

An independent agent exercised three raw requests in isolated local fixtures:

- A small normalization fix: saved a concrete two-step plan before the source
  change, reproduced the regression, replaced one casing call and passed both
  existing tests. Tests and the unrelated draft were preserved. Intermediate
  and final TODO states and loaded-guidance digests were recorded.
- A request changing Markdown to an exact JSON artifact: reused the existing
  run, retained superseded TODOs, updated request/plan revisions, steered the
  owned synthetic worker and inspected its acknowledgement and authoritative
  state. Created the exact requested JSON while preserving the earlier report;
  the late old-revision result was kept historical.
- A handoff-only request: retained exact CSV columns, Korean preservation,
  local-only constraints, a rejected JSON approach, missing authoritative
  requirements and the next unfinished action. Recorded the old/current God
  skill identities and prior unknown reference identities without inventing
  history. Created the handoff without an exporter or new experiments.

Parent review inspected the actual plan snapshots, action records, handoff,
controller state and outputs; reran the two unchanged tests; and checked exact
JSON bytes plus preservation of nine supplied files. The snapshots/action logs
are agent-maintained evidence, not tamper-proof ordering or runtime enforcement.

The handoff exercise exposed ambiguity over whether delivering its document
could complete the unfinished original implementation run. The skill now
distinguishes a new report-only goal from handing off an existing goal. On
rechecking the same request, the evaluator retained original required C1/T2
as unfinished, recorded handoff H1/H2 as delivered and changed the run from
complete to blocked on missing requirements-v2.md. Parent inspection verified
the corrected state and unchanged source/identity inputs. Other cases were not
rerun for this targeted clarification.

These checks establish bounded workflow behavior and packaging only. The
synthetic controller does not prove real asynchronous worker cancellation,
transport delivery, distributed race handling or enforced skill version pins.
No general success-rate/cost claim or fresh provider-discovery check is made.

After validation, the local `.agents/skills/paseo-god` was updated with the
single-skill installer. All 11 files matched final source, and the default
backup matched the previous 10-file tree. Digest comparison confirmed the
other 29 agent skills and the existing Claude God installation were unchanged.
