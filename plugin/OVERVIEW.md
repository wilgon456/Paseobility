# Paseobility

Paseobility adds version management and eleven bundled skills to Paseo. Open **Paseobility** in the sidebar to see the plugin version, verified installed-skill version when available, and the latest official release.

Above an existing conversation's input, **Paseobility** opens a searchable list of skill names and short Korean descriptions. Search matches skill IDs, task names and descriptions; Tab/Enter selection is supported. Selecting a skill appends its `/paseo-…` reference to your existing text. Your draft and attachments stay in place, repeated selection does not duplicate the reference, and you press Paseo's normal Send button yourself. The plugin never sends a message or starts an agent.

On native mobile clients and new-agent drafts, use **+ → Paseobility 스킬**. Paseo's attachment picker adds the skill reference as a resource and includes it when you send. Installed skills still need to be discoverable by the agent; an existing session may require a new session after installation.

**Paseobility 열기** in the Command Center (Paseo 0.12 and 0.13) opens the same version screen as the sidebar entry.

Paseobility supports Paseo 0.12.x and 0.13.x. On 0.13 the skill source, picker and Command Center labels follow the app language in English or Korean; on 0.12 they stay Korean. The composer textarea layout is unchanged between Paseo 0.12.0 and 0.13.0, and neither release has a public draft-editing API. The adapter locates the textarea from the exact host/agent pill, rejects ambiguous or changed editors, and emits a normal input event. It does not access React internals. If the adapter cannot resolve the editor, the picker points to the + menu, and the sidebar, updater and attachment source keep working. Mobile uses the public attachment-source API.

**Update** installs a newer official GitHub release on the selected computer. It resolves the tag to a commit, verifies the downloaded version and SHA, backs up existing skills, and registers a separate managed source directory. It preserves your development checkout and does not restart Paseo or update browser/Cua runtimes. Existing Claude skill installations are also updated. Git and the Paseo CLI must be available on that computer. The CLI's daemon identity must match the selected host.

The updater stores its progress, lock and content hashes under `~/.paseobility/updates/`; backups are under `~/.agents/skills-backups/`. It verifies installed bytes before displaying a skill version. Older installs without a receipt show **버전 미확인**. Failures restore previous files where safe; concurrent edits and uncertain plugin replacements require inspection rather than an automatic retry. A stale lock deliberately blocks another update until recovery is checked.

Version checks contact the public `wilgon456/Paseobility` GitHub release API. Updates fetch that repository and run the local Paseo plugin installer. Drafts and attachments are neither read by the server nor sent to GitHub. No telemetry is added. Local skill checks prove file presence, not runtime permissions or that a provider has loaded the skills.
