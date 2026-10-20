# Comparison and tournament mode

Load only for an explicit request for competing answers, plans, implementations,
or a debate; ordinary review or "the best answer" is not one. Shared discovery
and safety rules are in ../SKILL.md.

1. Define the same task, evidence, constraints, and scoring criteria for all
   contestants. Start with two contestants unless the user requests more or
   distinct requested roles require them. Share verified context rather than
   asking every contestant to survey the repository again.
2. Choose the requested mode:
   - Debate: assign distinct stances and compare evidence, not vote counts.
   - Plans: request tradeoffs, risks, acceptance criteria, and verification.
   - Implementations: give every writer a separate worktree workspace using
     `create_workspace { isolation: "worktree", mode: "branch-off", ... }`.
     Require relevant tests and a concise diff summary.
3. Launch all contestants at once; collect results through completion
   notifications (`get_agent_activity` only for missing evidence).
4. Use a separate analysis-only judge. Follow a user-named judge; otherwise choose
   an independent profile/provider when useful. Give it the task, scoring criteria,
   outputs, and evidence. Ask for the best-supported result, decisive disagreement,
   useful parts to merge, and remaining risks. Do not manufacture a winner when
   requirements are missing or evidence is incomparable.
   Compare behavior at the same boundary and base revision. A contestant's test
   claims need commands/results, and a proposed plan must not be scored as a
   working implementation. When implementations are combined, rerun the relevant
   checks in the integrated tree before accepting the combination.
5. Report the contestants/judge used and verification. When the user asked for
   an implementation, integrate the winner (or merged parts) locally and rerun
   checks; pushing, publishing or deploying still needs the user's request.

Read-only contestants may share the current workspace; competing writers never
share a checkout. Afterwards archive this run's agents and workspaces that hold
no unintegrated work, and list them in the report.
