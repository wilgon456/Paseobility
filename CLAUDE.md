# Paseobility Claude Install Guide

This repository is an AI-installable skill package. When the user gives this
repository URL and asks to install `paseo-share`, share Paseo artifacts, enable
cross-computer/mobile file viewing, or install `/paseo-skill-save`, install the
requested skill instead of merely describing the repository.

For `/paseo-skill-save`, install both required skill directories with Claude
support, then read `skills/paseo-skill-save/SKILL.md` before first use:

```bash
./scripts/paseobility-init.sh --skill paseo-skill-save --skill paseo-spyware-check --with-claude --no-context
```

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-skill-save,paseo-spyware-check -WithClaude
```

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
as the artifact destination. Initial use requires a different, dedicated
private GitHub or Forgejo repository owned by the user. Do not create that
remote repository unless the user asks.

After installation, give the user this first-use prompt:

```text
/paseo-share 전용 private 저장소를 이 컴퓨터에 연결해줘.
저장소: <private artifact repository URL>
컴퓨터 이름: <friendly machine name>
```
