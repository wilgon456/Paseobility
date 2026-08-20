# Paseobility Claude Install Guide

This repository is an AI-installable skill package. When the user gives this
repository URL and asks to install `paseo-share`, share Paseo artifacts, enable
cross-computer/mobile file viewing, install the requested skill instead of
merely describing the repository.

Read `AGENTS.md` for the complete safety and platform rules. For the common
`paseo-share` request, use this fast path:

1. Clone or use the provided checkout and confirm
   `skills/paseo-share/SKILL.md` exists.
2. Detect the operating system.
3. Run the matching single-skill installer with Claude support:

   ```bash
   ./scripts/paseobility-init.sh --skill paseo-share --with-claude --no-context
   ```

   ```powershell
   .\scripts\paseobility-install.ps1 -Skill paseo-share -WithClaude
   ```

4. Preserve the installer's backup path if it replaced an existing copy.
5. Verify both installed copies contain `SKILL.md` and
   `scripts/paseo-share.js`:
   - Paseo/Codex: `~/.agents/skills/paseo-share`
   - Claude Code: `~/.claude/skills/paseo-share`
   - On Windows, resolve both paths under `%USERPROFILE%`.
6. If Node.js is available, run the installed `paseo-share.test.js` once.
7. Do not restart the Paseo daemon. Tell the user to start a new agent session
   or reload integrations.

The Paseobility URL is only the skill source. Never configure this repository
as the artifact destination. Installation must remain side-effect free. On the
first actual share request, run `status` and then `onboard` when unconfigured.
If GitHub CLI is missing or unauthenticated, ask the user to install `gh` or run
`gh auth login --hostname github.com`. Onboarding targets the authenticated
account’s private `<login>/paseo_share` repository. Create it when absent;
reuse it only when empty or already recognized as Paseo Share. Refuse public,
unrelated, or incompletely inspected same-name repositories. Use explicit
`setup <repo-url>` for Forgejo or another custom remote.

After installation, give the user this first-use prompt:

```text
/paseo-share 이 파일을 공유해줘.
GitHub 연결이 필요하면 먼저 알려주고, 연결되어 있으면 내 계정의
private paseo_share 저장소를 안전하게 준비해서 사용해줘.
```
