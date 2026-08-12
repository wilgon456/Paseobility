---
name: paseo-skill-save
description: >-
  Inspect and save one or more reusable AI skills from a GitHub URL or local
  skill directory into the user's private local skill library. Use when the
  user invokes /paseo-skill-save, supplies a GitHub skill link and asks to
  save, archive, register, remember, or add it, or wants the saved skill to
  become usable later from ordinary natural-language requests.
---

# Paseo Skill Save

Save user-selected skills to a private local overlay and synchronize the
portable library through the user's private `paseo_skill_save` Git repository.
Registration is persistent; activation is not. The router may attach one
selected skill for a task without permanently installing every saved skill.
The wrapper manages its pinned routing engine automatically; never require the
user to install or invoke skillNload separately.

## Required workflow

1. Identify the exact GitHub repository, `/tree/<revision>/<skill-path>` URL,
   or local skill directory. Reject credentials, query strings, and fragments.
2. Run the bundled wrapper, which invokes the bundled cross-platform Python
   `paseo-spyware-check` gate before manager bootstrap or registration. Do not
   bypass this gate by calling the routing engine directly. The gate snapshots
   local sources and pins GitHub sources to the exact scanned commit. It never
   installs dependencies, builds, imports, or executes target code. It blocks
   High or Critical findings. For Medium findings, show the receipt and obtain
   explicit user approval before rerunning with `--approve-medium`.
3. Derive a concise Korean description and tags from the verified source.
   Prefer a controlled domain and action when clear. Do not invent capabilities
   that are absent from `SKILL.md`.
4. Resolve this skill's installed directory and run the bundled wrapper using
   an argv list, never a shell-built command string:

   ```text
   python <skill-dir>/scripts/paseo-skill-save.py <source> \
     --description-ko "<Korean description>" \
     --tag-ko "<tag>" \
     --domain <domain> \
     --action <action>
   ```

   Add `--approve-medium` only after the user has seen the Medium findings and
   explicitly approved registration. Never infer approval from the original
   save request.

   By default, let the manager onboard or reuse the authenticated user's
   private `paseo_skill_save` repository and sync the verified overlay. Add
   `--local-only` only when the user explicitly requests storage on this
   computer alone. If GitHub authentication is missing, preserve the local
   skill and report `saved-locally-sync-pending` with the exact login command.

   On first use, the wrapper automatically fetches the official public
   skillNload engine at its hard-coded commit, verifies both the commit and the
   complete Git tree, and caches it under `~/.paseo/skill-save/manager/`. It
   uses no pip installation. Do not ask the user to prepare skillNload.
5. Require the wrapper to report all of the following:

   - spyware receipt digest, severity counts, findings, scanned checksum, and
     immutable source
   - internal manager mode, pinned commit, tree, and cache path
   - router target and initialization status
   - pinned source repository, commit, and skill path
   - checksum, inferred risk, activation policy, and catalog ID
   - checksum verification result
   - search discovery result
   - natural-language match decision and selected catalog ID
   - bounded skill body evidence for an instructions-only selection
   - library sync status (`pushed`, `up-to-date`, `saved-locally-sync-pending`,
     `review-required`, or `skipped-local-only`) and safe retry guidance

   A saved `instructions-only` skill is ready only when its activation policy
   is `on-demand`, the match decision is `select`, and confirmation is false.
   Executable or externally mutating skills may return `confirm`; keep that
   gate. Never claim that static checks prove absolute safety.
6. Do not run `enable`, `install`, or target skill code merely because the
   skill was saved. The installed `skill-hub-router` will select the minimum
   useful saved skill for later natural-language requests. A session that was
   already running before router initialization may require integration reload
   or a new agent session.

## Multiple skills

A repository root may contain multiple `SKILL.md` files. Register each one only
when the user clearly requested the whole repository. For one intended skill,
prefer its `/tree/<revision>/<path>` URL. Do not pass a single custom name or
description when bulk-registering multiple skills.

## Updates and collisions

skillNload refuses to overwrite an existing personal catalog ID. If the skill
already exists, show the existing record and the new pinned commit. Do not
delete or replace the old archive without explicit approval and a recoverable
snapshot or backup.

## Multi-computer behavior

Use the fixed, user-owned private repository `<github-login>/paseo_skill_save`.
Each computer pulls and verifies the complete portable library into its local
overlay; the router searches locally and never contacts GitHub for every
natural-language request. Never upload saved skills to the public Paseobility
or skillNload repositories. A sync failure must not disable an already verified
local overlay.

## Failure handling

- Missing `SKILL.md`: stop and ask for the correct skill path.
- Static scan rejection, symlink, junction, checksum mismatch, or ownership
  mismatch: stop; do not weaken the guard.
- Internal manager commit/tree mismatch or modified cache: stop; do not repair,
  replace, or execute the cache silently.
- Missing Korean metadata: generate a conservative description from verified
  source text and label it as generated.
- Search or match smoke failure: keep the archive registered, report that its
  routing metadata needs correction, and do not claim automatic use works.
