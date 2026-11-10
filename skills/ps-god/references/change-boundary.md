# Change boundaries and coordinated work

Use when a change affects shared interfaces, persisted state, several writers
or delegated work. A local correction needs only a short scope note. This is
reasoning guidance; a run record does not lock files or enforce isolation.

## Close the affected behavior

Before adding a responsibility, look for an existing implementation and compare
its meaning, inputs, outputs, errors and side effects. Reuse it when these
match. Similar names or types alone are not enough, and changing a shared
implementation requires checking its existing callers.

Trace the changed definition through callers, exports, configuration, serialized
forms and relevant tests. Use available symbol/reference tools when useful;
otherwise search code and data, including dynamic/string references. State any
remaining gap rather than claiming an exhaustive boundary from one text match.

For state changes, name the invariant, valid transitions and existing writers.
Keep ownership explicit and avoid storing a second copy of a fact that can
diverge. Check a failure/retry or recovery transition when relevant. A refactor
should preserve observable boundary behavior; make an intended contract change
explicit and update its consumers. Do not introduce an abstraction for imagined
variants when the existing contracts do not match.

After editing, revisit affected callers and relevant checks. If an overlooked
consumer changes behavior, include it or revise the approach before declaring
the boundary covered. Record the useful scope summary, not an exhaustive symbol
inventory for every task.

## Delegate only work with a clear boundary

Use this section only when delegation is authorized and useful. Existing tools
and the host's agent rules govern launching helpers; no new agent team or DAG
engine is required by this procedure.

A handoff states the outcome, input artifacts/revisions, owned write paths,
dependencies, expected output and relevant checks. Each helper owns its own run
record; link that result from the parent rather than sharing a record writer.
Tell helpers to preserve other work. Check read/write dependencies as well as
write/write overlap: a verifier reading a file that is still being changed is
not independent just because it writes nothing there.

Run independent work together; order a consumer after its producer. Separate
worktrees prevent file collisions but do not isolate shared ports, databases,
remote targets or other external resources. Coordinate those resources, use
separate test targets or keep the affected operations sequential. A deadline
or a child's missing reply is not evidence that its process stopped.

Inspect each returned artifact and check result. A child task ending does not
certify the parent requirement. Integrate completed outputs, then check the
affected boundary after the last relevant edit. Reconcile interrupted effects
before handing the same write scope to another worker, using the verification
reference when needed.
