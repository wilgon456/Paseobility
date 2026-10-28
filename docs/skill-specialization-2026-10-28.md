# Skill specialization from pstack and mattpocock/skills — 2026-10-28

Paseobility's skills were compared with
[pstack](https://github.com/cursor/plugins/tree/main/pstack) (Lauren Tan, MIT)
and [mattpocock/skills](https://github.com/mattpocock/skills) (Matt Pocock, MIT)
for repeated real use on Windows and macOS. Ideas were adapted and rewritten;
no text was copied. `paseo-god` was handled separately in v2.12.9.

## Adopted

| Area | Change | Adapted from |
|---|---|---|
| Design | `design-check --compare <before>`: per-width changed-pixel ratio and a red diff image; a look-preserving change fails above `--max-diff` (default 0) | pstack visual-parity playbook |
| Design | Variants as `?variant=A`, `B`, `C` of the real screen, 3–5 structurally different, choice recorded in the brief; variant URLs keep separate report files (they overwrote each other before) | mattpocock `prototype`, pstack prototype playbook |
| Design | Reports record the exact command, browser path and version | pstack prove-it-works, benchmark-checklist |
| Browser | Notes for sites you return to: stable selectors, steps that need the person, proof of success; never secrets | pstack verification-skill feature maps |
| Research | New `paseo-research` skill: primary sources in trust order, claims graded observed/documented/inferred/unknown, one cited Markdown answer with links that stay valid | mattpocock `research`, pstack `how`/`why` |
| Project | Handoffs point to existing artifacts instead of copying them, name the next agent's skills, redact secrets, save outside the repository | mattpocock `handoff` |
| Orchestration | Decision log for runs with three or more agents, a heartbeat or an absent user, written with the file tool | pstack `show-me-your-work` |
| Catalog | `validate-skills.py` fails a description over 80 words; `paseo-share`'s description trimmed from 88 | mattpocock `writing-for-agents` |

## Windows and macOS fixes found on the way

- `paseo-multi` and `paseo-agent-cleanup` now find a standalone npm Paseo CLI on
  Windows (`paseo.cmd` beside `node_modules`) and a desktop app in
  `~/Applications` on macOS.
- `paseo-design` gives a PowerShell path form: Windows PowerShell passes `~` to
  `node` literally.
- `paseo-cua` explains that Windows PowerShell 5.1 strips quotes from JSON
  arguments and pipes ASCII by default (both reproduced), and how to pass JSON
  safely.
- `paseo-spyware-check` calls its PowerShell helpers with `& "<path>"`; `.\` in
  front of an absolute path fails.
- `paseo-project` lists the Windows doctor (`paseobility-doctor.ps1`).
- Tests read files and child-process output as UTF-8 (23 calls), so the suites
  no longer fail on Windows with a non-UTF-8 code page such as Korean. Calls that
  read native Windows tools keep the system code page on purpose.

## Not adopted

- Principle library and Cursor-specific skills (Bugbot, automations,
  `make-bot-ui`): per-task cost or features Paseo does not have.
- `unslop` and `technical-writing` as skills: their checks are English-specific;
  the research skill carries the writing rules for its own output.
- `statechart` (TLA+/Java toolchain), `wizard` (Bash and keyboard input),
  `teach`, `to-spec`, router skills, `retro`: too heavy, tied to another setup,
  or already covered by `paseo-god`.
- A design-check manifest of screens and states: useful, larger; left for later.
