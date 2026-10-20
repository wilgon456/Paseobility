Paseobility is a pack of ten agent skills for Paseo: agent cleanup, browser automation, desktop GUI control, interface design checks, a bounded "god mode" task runner, multi-host operation, multi-agent orchestration, project briefs, file sharing, and repository spyware checks.

This plugin adds a Paseobility screen to the sidebar and the Command Center. It lists each skill with a short description and shows whether it is installed for Paseo agents (`~/.agents/skills`) or Claude (`~/.claude/skills`) on the daemon host.

The plugin only checks for the presence of each skill's `SKILL.md` on the daemon host. It does not install, modify, or send anything, and it makes no network requests. The skills themselves are installed with the installers in the repository; see the README.
