# Comparison and tournament mode

Load only for an explicit request for competing answers, plans, implementations,
or a structured debate. Ordinary review or asking for the best answer is not
such a request. Use the shared discovery and safety rules in ../SKILL.md.

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
3. Launch asynchronously; collect final results through completion notifications.
   Use `get_agent_activity` only when the completion result lacks needed evidence.
4. Use a separate analysis-only judge. Follow a user-named judge; otherwise choose
   an independent profile/provider when useful. Give it the task, scoring criteria,
   outputs, and evidence. Ask for the best-supported result, decisive disagreement,
   useful parts to merge, and remaining risks. Do not manufacture a winner when
   requirements are missing or evidence is incomparable.
5. The coordinator reports the actual contestants/judge used and verification.
   Selecting an implementation does not authorize merging, pushing, publishing,
   or deploying it. Perform those actions only within the user's authorization.

Read-only contestants may share the current workspace. Never let competing
writers edit the same checkout. Archive only agents/workspaces created for this
run, only when cleanup was requested or included in the agreed workflow.
