---
name: paseo-skillhub
description: >-
  Discover and install Paseo-compatible skills from the AI Skill Library
  (ai-skill-library). Use the `skillhub` CLI to search, inspect, trust, and
  selectively install skills with risk gates and approval requirements. Use
  ONLY when the user asks to find a skill, search for skills, install a skill,
  or discover agent capabilities from the skill library. Triggers include
  "find skill", "install skill", "search skill", "skillhub", "skill library",
  "discover skill", "what skills are available", and "add skill". Do NOT use
  for general web searches or for skills that already exist locally.
---

# Paseo Skill Hub

The AI Skill Library ([wilgon456/ai-skill-library](https://github.com/wilgon456/ai-skill-library))
provides a Python CLI (`skillhub`) for discovering, inspecting, and selectively
installing portable AI skills. Skills are never bulk-downloaded — only the
manager and a search router are installed initially. Each skill is fetched
one at a time after source verification and explicit user approval.

Web catalog: https://wilgon456.github.io/ai-skill-library/

## Installation (one-time setup)

**Before installing:**
1. Check Python version: `python3 --version`. Requires Python 3.11+. If the
   system Python is older, use `python3.11`, `uvx`, or a venv with 3.11+.
2. **Ask the user for approval.** Installing a wheel from GitHub is a
   networked environment change. Never run the pip install without explicit
   user confirmation.

Once approved:

### macOS / Linux with Python 3.11+

```bash
python3.11 -m pip install --upgrade "https://github.com/wilgon456/ai-skill-library/releases/download/v0.3.1/ai_skill_library-0.3.1-py3-none-any.whl"
python3.11 -m skillhub init --target paseo --json
python3.11 -m skillhub doctor --json
```

### Windows PowerShell

```bash
python -m pip install --upgrade "https://github.com/wilgon456/ai-skill-library/releases/download/v0.3.1/ai_skill_library-0.3.1-py3-none-any.whl"
python -m skillhub init --target paseo --json
python -m skillhub doctor --json
```

After installing, **start a new agent** or **reload skill discovery** from
Paseo Settings → Integrations to pick up the new router. Do NOT restart the
Paseo daemon — that kills all running agents.

### Verify installation

```bash
python3 -m skillhub status --json
```

## Discovery workflow

Always follow this sequence. Never skip verification steps.

### 1. Search for skills

Use natural language routing for best results:

```bash
python3 -m skillhub route "find Korean subway arrival information" \
  --target paseo --json
```

For keyword-based searches:

```bash
python3 -m skillhub search "subway arrival" \
  --client paseo --available-only --explain --json
```

`route` is read-only — it returns candidate rankings and exclusion reasons
without downloading or executing anything. `search` accepts general keywords.

Always use `--json` for machine-readable output.

Note: `route` and `install` use `--target`, while `search` uses `--client`.
Both accept `paseo` as the value. This is intentional in the CLI design —
verify against `skillhub --help` if commands fail.

### 2. Inspect a candidate

Before suggesting a skill to the user, inspect its metadata:

```bash
python3 -m skillhub inspect \
  community.nomadamas-k-skill/seoul-subway-arrival --json
```

Review: original repository, pinned commit, license, redistribution status,
risk level, expected checksum, compatible clients/OS, and block reasons.

### 3. Check trust and risk

```bash
python3 -m skillhub trust \
  community.nomadamas-k-skill/seoul-subway-arrival --json
```

Risk levels you must explain to the user:

| Risk level | Meaning | Approval needed |
|-----------|---------|-----------------|
| `instructions-only` | Documentation and instructions only | `--approve` |
| `local-management` | Manages local skill state or files | `--approve` |
| `scripts` | Includes executable scripts | `--approve --allow-risk scripts` |
| `external-write` | Can make changes to external services | `--approve --allow-risk external-write` |
| `destructive` | Can delete, overwrite, or irreversibly change state | `--approve --allow-risk destructive` |

**Never install a skill without asking the user to confirm.** Present:
- Skill name and what it does
- Source repository and license
- Risk level and what it means
- The exact install command you would run

## Installation

### Install for persistent use

```bash
python3 -m skillhub install \
  community.nomadamas-k-skill/seoul-subway-arrival \
  --target paseo --allow-risk scripts --approve --json
```

`--target paseo` ensures the skill is wired for Paseo agents. `--approve` is
required for non-interactive installs. `--allow-risk` must be specified for
each risk level the skill declares beyond `instructions-only`.

### Use once (current task only)

For one-off tasks where you don't want permanent installation:

```bash
python3 -m skillhub use \
  community.nomadamas-k-skill/seoul-subway-arrival \
  --once --target paseo --allow-risk scripts --approve --json
```

The output includes a verified `skill_path`. Read its `SKILL.md` to apply
the skill to the current task. `--once` does not create a permanent link.

## Management

### List installed skills

```bash
python3 -m skillhub list --installed --json
```

### Verify an installed skill

```bash
python3 -m skillhub verify \
  community.nomadamas-k-skill/seoul-subway-arrival --json
```

### Check for updates

```bash
python3 -m skillhub update --json
```

Update reports differences between pinned sources and local state. It does
not auto-replace skills — the user must decide.

### Uninstall a skill

```bash
python3 -m skillhub uninstall \
  community.nomadamas-k-skill/seoul-subway-arrival \
  --target paseo --approve --json
```

### Snapshot and rollback

```bash
python3 -m skillhub snapshot core.skill-hub-router --json
python3 -m skillhub rollback core.skill-hub-router --target paseo --json
```

Snapshots create recovery points. Rollback restores a previous state.

## Advanced management

For fine-grained control:

```bash
python3 -m skillhub bootstrap --profile default --json
python3 -m skillhub enable core.skill-hub-router --target paseo --yes --json
python3 -m skillhub disable core.skill-hub-router --target paseo --json
```

- `bootstrap`: Link the default router profile.
- `enable` / `disable`: Toggle skill visibility for Paseo agents.

## Complete conversation flow

When a user says "find me a skill for X" or "I need a skill that does Y":

1. **Check installed skills first.** Run `skillhub list --installed --json`.
   Don't suggest searching for a skill that's already present.
2. **Install skillhub if needed.** Run `python3 -m skillhub status --json`.
   If it fails, ask the user for approval to run the one-time setup above.
3. **Search.** Use `skillhub route` with their natural language request.
4. **Present candidates.** Show the top 3 results with name, description,
   risk level, and source. Ask the user to pick one.
5. **Inspect and trust.** Run `inspect` and `trust` on the chosen skill.
   Explain the risk level and what `--allow-risk` flags are needed.
6. **Get approval.** Present the install command and ask the user to confirm.
   Never run `install` or `use` without explicit approval.
7. **Install.** Run the install command and confirm success.
8. **Apply.** If using `--once`, read the returned `SKILL.md` and apply it
   to the current task.

## When the user already has skills installed

Check first with `skillhub list --installed --json` before searching for new
skills. Don't suggest installing a skill that's already present.

## Troubleshooting

| Problem | Check |
|---------|-------|
| `skillhub` not found | Run the pip install command. First verify Python 3.11+ with `python3 --version`. |
| `init` fails | Check `--target paseo`. Run `skillhub doctor --json` for diagnostics. |
| `route` returns nothing | Try `skillhub search` with simpler keywords. Check the web catalog. |
| Install blocked | Ensure `--approve` and all required `--allow-risk` flags are present. |
| Skill not found by agent | Start a new agent or reload skill discovery from Paseo Settings → Integrations. Do NOT restart the daemon. |
