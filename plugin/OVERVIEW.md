# Paseobility skill launcher

Paseobility bundles eleven agent skills. This plugin makes them selectable through a Korean GUI in Paseo 0.12.0 or later.

1. Open **Paseobility** in the sidebar, or **Paseobility 작업 실행** in the workspace Command Center.
2. Choose a skill by its task name; its description and input example appear alongside it.
3. Enter the task. Browser work can use the skill's default backend, Ego Lite, or an already-running Chrome window.
4. Select an idle agent on the displayed host. The workspace panel only shows eligible agents in that workspace. Search applies to the current page; next/previous controls cover hosts with more than 200 idle agents.
5. Review **보낼 내용**, then press **선택한 에이전트에 보내기**. Open the target conversation to follow progress. Accepted delivery is not task completion.

The instruction is sent to the selected agent's existing conversation using the host-scoped Paseo SDK. Normal model usage and costs apply. The plugin checks installation and refreshes the agent before sending. Running, archived, permission-pending, or wrong-workspace agents are rejected. If a turn starts between refresh and send, `activeTurnBehavior: "steer"` requests steering. Paseo can fall back to interruption when steering is unavailable: the SDK has no atomic idle-only send, so do not start another task in the same target concurrently. Double clicks are guarded. An uncertain send stays locked until the user explicitly acknowledges checking the conversation. No automatic retries, agent creation, approvals, command execution, daemon restarts, or external telemetry are added.

**설치 상태** reads only `SKILL.md` presence under `~/.agents/skills` and `~/.claude/skills`, and Ego/Cua file presence in known locations/PATH. These are installation hints, not version, executable health, session skill discovery, browser availability, login, or OS permission checks. Install the skills separately with the repository installer; start a new agent after installation when needed.

Host/workspace changes reset the launcher selection and draft to prevent cross-host sending. Drafts are not persisted. Only an explicit send reaches the selected agent; merely opening the screen performs read-only queries. The generic Skills plugin remains useful for browsing arbitrary skills and their full instructions; this launcher supplies curated Paseobility task forms and backend choices.

## Development and verification

```sh
npm ci
npm run typecheck
npm test
paseo plugin reload paseobility
paseo plugin ls
paseo plugin logs paseobility
```

Tests require Node 22.6+ for native TypeScript stripping. They exercise busy/permission/workspace guards, fresh-state checks, duplicate sends, uncertain acknowledgements and retryable read failures. For UI changes, render the actual screen with a mocked host at phone/tablet/desktop widths in light and dark schemes, run the bundled `paseo-design` checker, then exercise the real plugin inside Paseo. Use only a dedicated test agent for live sending.

The catalog screenshot uses a mock host and test agent, rendered from the actual component; it contains no personal workspace or account data.
