---
name: ps-plan
description: >-
  Use only for an explicit /ps-plan request or a direct request to use this
  skill (for example, /ps-plan 기획서 or /ps-plan 계획서 써줘). Produce one
  evidence-grounded Markdown plan with testable acceptance criteria. Ordinary
  planning inside a coding task does not trigger it.
---

# Paseo Plan

Turn a goal into one Markdown plan a reader can decide on and execute.
Planning does not authorize implementation, installation or external actions.

## 1. Frame the work

Restate the goal, acceptance criteria and constraints in at most five lines.
Ask only when blocked by something that cannot be found or sensibly defaulted.

Check for a specialist only when the task needs domain knowledge, a procedure
or a tool you lack. Skip this check for ordinary work you already know how to do
or when an installed skill already covers the task. If needed and `ps` is installed,
execute `node <ps-skill-dir>/scripts/skill-catalog.js list --names` once and read its output.
Report the number listed and the chosen name, or "none fits" only after that read.
For a clear fit, run `path <name>` with the same script and read at most one specialist
in place. If `ps` is absent or the command fails, explicitly report that limitation.
Never install or copy skills; retain this harness's verification.

Instruction order, highest first: what the user said in this conversation;
project instructions; this harness; the catalog specialist's domain guidance.

## 2. Establish the current state

Read or measure primary sources before proposing changes: the actual files,
observed workflow, tool output or official documents for the relevant version.
Record source locations and the date, version or configuration they cover.
Reconcile conflicting sources explicitly; check precise semantics and line references.
Absence of a record does not prove an event never happened. Separate source claims
from observed operation. Do not assume a feature or dependency is ready.

Grade every current-state statement using the research vocabulary:

- **Observed**: measured or read directly in source at an identified revision.
- **Documented**: stated in an official source for the relevant version.
- **Inferred**: follows from named observed or documented facts.
- **Unknown**: not established; name the evidence needed to settle it.

Tie numbers to a stated measurement or source. Label proposed targets as
proposals, with a sourced or measured basis; do not invent budgets or dates.

## 3. Set criteria, compare options, then phase

Write acceptance criteria before phases. Make each check reproducible: specify
inputs, method, expected observation, failure condition and the boundary proved.
Compare like with like at a defined state; account for timing and changing inputs.
A written policy or configured target does not prove the resulting behavior.
Distinguish checks possible now from observations requiring time or later access.
Consider realistic options, including keeping the current state when viable.
Recommend one and explain the tradeoff using the established facts.

Give each phase a deliverable, owner, effort estimate, dependencies and evidence
needed to leave it. Reconcile the total effort and elapsed time with actual capacity.
Before replacing a working process, specify when to switch, who decides, failure
signals and how to return to a usable state, including work created during transition.
Run a short pre-mortem: "This failed in a month: why?" Pair plausible failures
with preventive or recovery actions and checks. Include destructive steps, partial
completion, lost access and stale observations when relevant; preserve usable state
until the replacement has evidence. Name prerequisites rather than assuming them.

## 4. Write one plan

Use the reader's language and put the recommendation first. Include:

1. Goal and non-goals.
2. Current state: every statement graded, with source or unresolved evidence.
3. Options considered, one recommendation and its reason.
4. Acceptance criteria: reproducible checks, expected results and proof boundaries.
5. Phases: deliverables, owners, effort, prerequisites, exit evidence and transition.
6. Risks and the response to each, including the pre-mortem findings.
7. Decisions for the reader: at most five, each with a recommended answer;
   state "None" when there are no open decisions.
8. What was not verified and what would resolve it.

Use the project's existing notes folder when authorized to add repository
files; otherwise use the system temporary folder (`$TMPDIR` or `/tmp` on macOS
and Linux, `$env:TEMP` on Windows), as in `ps-research`. Honor a requested
output path. Do not add files to a repository unless the user asked for that.
Keep secrets, personal data and private absolute paths out of the document.

## 5. Verify and hand back

Read the finished document and record the checks and results in it:

- Walk through each check on a concrete example: can another person run it and
  distinguish a pass from a failure without guessing? Fix incompatible comparisons.
- No current-state claim is left ungraded; its source or evidence gap is clear.
- Every open decision has a recommendation and there are at most five.
- Every number has a stated measurement or source, including proposed targets.
- Phase gates are achievable when scheduled; effort and elapsed totals agree.
- Transition and recovery steps have observable triggers; risks have usable responses.
- Reopen cited lines and reconcile contradictions, unknowns and precise quantities.

Fix gaps before reporting. Without evidence, label the affected result
**unverified**, not done. A checked plan does not prove its phases were executed.

Return a phone-readable summary, the artifact path and any exact resume point
(section, unresolved input and next action). For an authorized handoff, pass
the plan's file path and acceptance-criteria section to `ps-god`; pass the file
path and unknowns to `ps-research`. Do not copy content or auto-start a harness.
