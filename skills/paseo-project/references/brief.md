# Brief

1. Confirm root, branch and git status. Reuse what this conversation already
   established; verify anything that may have changed.
2. Use `rg --files` if the shape is unknown. Read relevant README/AGENTS/CLAUDE/
   Cursor/Copilot instructions and overview/setup docs, not every file.
3. Find commands in package.json, pyproject.toml, Cargo.toml, go.mod, Makefile,
   justfile, Taskfile.yml and paseo.json as applicable. Attach the working
   directory to each. In a monorepo, check the selected package and root
   workspace scripts rather than assuming root `npm test` covers it. Read
   `packageManager`, toolchain files and lockfiles before recommending an
   installer. Mark commands you ran versus commands you only found; run a cheap
   one (e.g. `--version`, a fast test) when it settles a doubt.
4. Return only relevant sections: purpose, current changes, key rules,
   install/dev/test commands, project map, risks, next steps.
5. For handoff, write a self-contained prompt: root, goal, completed work,
   constraints, relevant files, commands, blockers, branch/base or HEAD,
   uncommitted paths, date of runtime evidence and the next unmet criterion.
   Mark inherited claims you did not refresh. Point to artifacts that already
   exist (spec, diff, commit, issue, PR, report) by path or URL instead of
   copying them in, name the skills the next agent should load, and redact
   secrets. A handoff saved as a file goes to the system temporary folder
   (`$TMPDIR` or `/tmp`; `$env:TEMP` on Windows), not into the repository.

When `.paseobility/` context is missing or stale, refresh it from what you just
read (context helper with `--force`, or edit the files directly). Skip
dependency installs and long-running servers; those belong to setup mode.
