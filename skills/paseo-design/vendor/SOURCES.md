# Vendored design skills

These files ship with `/paseo-design` so the skill can read them without a second install. They stay out of the agent skill catalog: nested entries are named `GUIDE.md`, never `SKILL.md`.

Copies were taken on 2026-10-05 and compared line by line with the upstream path at the commit in the "Upstream commit" column (identical unless the last column says otherwise).

| Path | Upstream | Upstream commit | License | Local changes |
| --- | --- | --- | --- | --- |
| `frontend-design/` | https://github.com/anthropics/skills `skills/frontend-design` | `41bbe19d1a1a` (2026-09-03) | Apache-2.0 (`frontend-design/LICENSE.txt`) | none |
| `ui-ux-pro-max/` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | `477bcb28c981` (2026-10-03) | MIT (`ui-ux-pro-max/LICENSE`) | `GUIDE.md`: the 11 `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py` command paths rewritten to `vendor/ui-ux-pro-max/scripts/search.py` (relative to this skill's directory, where the plugin variable is empty); `references/*.md`: `SKILL.md` renamed `GUIDE.md` in two sentences |
| `web-design-guidelines/` | https://github.com/vercel-labs/agent-skills `skills/web-design-guidelines` | `ba46938889d4` (2026-01-16) | MIT (upstream README; that repo ships no LICENSE file) | none |
| `web-design-guidelines/command.md` | https://github.com/vercel-labs/web-interface-guidelines `command.md` | `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1` (2026-08-18) | MIT | pinned snapshot of the rules the guide above fetches at review time, so reviews work offline and do not change silently; refresh by re-fetching and updating this row |
| `hermes/design-md/` | https://github.com/NousResearch/hermes-agent `skills/creative/design-md` | `cae5c819565f` (2026-07-24) | MIT (`hermes/LICENSE`) | none |
| `hermes/claude-design/` | https://github.com/NousResearch/hermes-agent `skills/creative/claude-design` | `d4c14011ebbc` (2026-06-30) | MIT (`hermes/LICENSE`) | none |
| `hermes/popular-web-designs/` | https://github.com/NousResearch/hermes-agent `skills/creative/popular-web-designs` | `98db898c0bd4` (2026-05-08) | MIT (`hermes/LICENSE`) | none |
| `hermes/dogfood/` | https://github.com/NousResearch/hermes-agent `skills/software-development/dogfood` | `1c9433897c7b` (2026-08-08) | MIT (`hermes/LICENSE`) | none |

The upstream texts assume other runtimes: Hermes tools (`write_file`, `skill_view`, `browser_vision`, `generative-widgets`, cloudflared tunnels) and Claude plugin paths. `../SKILL.md` tells the agent to skip those sentences and use its own file and browser tools.

Written for this skill, under the repository's MIT license: `../references/design-digest.md` (a condensation of `frontend-design` and `hermes/claude-design`), `../references/review-checklist.md`, `../templates/DESIGN.md`, and everything under `../scripts/` (`design-check.mjs`, `measure.js`, the selftest and its fixtures).
