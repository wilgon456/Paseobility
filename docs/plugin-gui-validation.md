# Paseobility GUI validation — 2026-10-24

Scope: sidebar version/update screen; composer skill picker that preserves the draft and never sends; supported attachment source for mobile/new drafts. This replaces the earlier standalone agent launcher. Local app and daemon: Paseo 0.12.0. Development SDK: 0.11.4, checked against the published 0.12.0 contracts and source. Manifest: >=0.12.0 <0.13.0 because draft insertion uses a private DOM layout.

## Verified

- Strict TypeScript and 13 Node tests pass. Tests cover exact draft/whitespace preservation, duplicate references, absence of send/create/submit calls, pill subscription cleanup and late snapshots, backup/rollback, partial failure, concurrent edits, symlink rejection, Windows argument encoding, version consistency, and complete/failed/uncertain update jobs with a fake Git/Paseo process boundary.
- Actual React Native components rendered through React Native Web with mocked RPCs at 375/768/1440, light/dark. Version, offline, failed-update and composer views: zero measured errors. The version screen has one gap-rhythm warning per width/scheme, and the failure view has two: intervening buttons/text are omitted by the checker's grouping; all real parent gaps use 16/24 px. Screenshots were inspected. The picker was rerendered separately with its menu open.
- Ego Lite fixture: Korean multiline draft including leading/trailing whitespace and an existing attachment survive skill selection; another selection of the same skill adds nothing; a second skill appends normally. Send count remains zero. An ambiguous duplicate editor is refused without changing the draft.
- Actual MAC_HOME Paseo app: sidebar version RPC returned current/latest v2.12.0; legacy installed-skill version was correctly unknown. The composer displayed both the existing generic Skills plugin and the new Paseobility pill. A two-line verification-only draft was entered in this task's own conversation. Selecting Browser appended `/paseo-browser` while keeping both lines and trailing spaces. The draft remained unsent and was cleared back to its original empty state.
- The local plugin reload reached running/Plugin ready. No daemon restart, real agent message, or unrelated plugin mutation was performed.

## Limits

- A future real release update was not applied: the published release is still v2.12.0, so downgrade/same-version updates are disabled. Worker success, rollback and uncertain-completion behavior were tested in isolated temporary homes with fake external commands; actual GitHub-to-plugin replacement awaits a newer release.
- Windows argument construction and shared suites are covered; a live Windows plugin replacement, native mobile attachment picker and other hosts were not exercised.
- The desktop adapter is based on the v0.12.0 `message-input-root` textarea layout and standard input events. It rejects stale/multiple/missing editors, but future host layout changes need revalidation. No React internals are accessed.
- The plugin cannot know legacy installed-skill versions from file presence. It displays unknown until the updater has written a receipt and the bytes still match it. Runtime permissions and provider skill discovery remain separate.
- This change updates the local plugin and repository source. It is not a new published release or a fleet rollout.

Local evidence: `/tmp/paseobility-composer-check/` and `/tmp/paseobility-composer-picker-check/`. Catalog media uses a mock host, not a private workspace. These temporary evidence paths are not portable.

## Skill list visual refinement

The reference-driven list now has a fixed search field and result count, plain skill-name rows with short Korean descriptions, and hover/keyboard focus feedback. Existing selection/draft behavior is unchanged. The actual picker component was rendered at 375/768/1440 in light/dark: zero errors and warnings. Ego Lite verified Korean and case-insensitive English search, empty results, Tab/Enter selection, preserved multiline draft/attachment and zero sends. The prior footer produced a scroll-clipping overlap finding and was removed for a cleaner list.

Evidence: `/tmp/paseobility-list-design-final/` and `plugin/media/skills.png` (mock host, actual component). Local reload reported running. Native mobile and remote hosts were not exercised for this refinement.
