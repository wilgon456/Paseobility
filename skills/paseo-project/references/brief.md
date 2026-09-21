# Read-only brief

1. Confirm root, branch, and current git status. Reuse information already
   established during this conversation; verify anything that may have changed.
2. List files with `rg --files` if the repository shape is unknown. Read relevant
   README/AGENTS/CLAUDE/Cursor/Copilot instructions and overview/setup docs, not
   every source file or every document.
3. Find commands in package.json, pyproject.toml, Cargo.toml, go.mod, Makefile,
   justfile, Taskfile.yml, and paseo.json as applicable. Distinguish commands
   found in source from commands actually executed.
4. Return only requested/relevant sections: purpose, current changes, key rules,
   install/dev/test commands, project map, risks, and useful next steps.
5. For handoff, provide a self-contained prompt with root, goal, completed work,
   constraints, relevant files, commands, and unresolved blockers.

No dependency installs, server starts, file edits, or context generation. Do not
run setup mode just to make a brief. When a setup summary already answers the
request, summarize that evidence without surveying the repository again.
