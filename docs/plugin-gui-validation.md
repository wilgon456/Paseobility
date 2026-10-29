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

## Native integration pass (v2.12.1, Paseo 0.12 and 0.13)

Goal: the plugin should read as part of Paseo, not a page embedded in it. Measured
from the real Paseo 0.13.0 web app: system font, 14px body, 12 to 13px secondary
text, 24px page titles, 8px radii, theme surfaces and 1px theme borders.

- Version screen: built from the host's `SettingsSection`, `SettingsCard`,
  `SettingsRow` and `SettingsAction`, the same components as Paseo's settings
  pages. A brand tile, host name and a status badge (up to date, update
  available, updating, offline) replace the explanatory paragraphs. Each of the
  eleven skills is an icon tile with its command and installed state.
- Skill picker: matches Paseo's model selector: icon header, borderless search
  row, divider, single-line rows with an icon, title and muted hint. Arrow keys
  and Enter work, and the search box takes focus when the popover opens (the host
  popover took focus away from `autoFocus` before; focus is now retried until it
  holds).
- Labels follow the app language on 0.13 (English or Korean) and stay Korean on
  0.12. The `+` menu entry is the brand alone because Paseo prefixes it with an
  English "Attach".
- 0.12 compatibility: `Icon` exists only in the 0.13 SDK, so icons are read
  through a namespace import and fall back to text glyphs on 0.12. A test
  rejects named imports of 0.13-only exports and custom fonts.

Verified in the published apps, not a mock: the 0.13.0 desktop web bundle
(from the v0.13.0 release archive) against a throwaway 0.13.0 daemon, and the
0.12.0 bundle against a throwaway 0.12.0 daemon, each with this plugin
installed from the working tree and a real agent conversation. Screens were
captured at 1440, 768 and 375 px in light and dark, in Korean and English. In
the 0.13 app, typing in the picker search and pressing Enter appended
`/paseo-design` to an existing draft, and ArrowDown twice plus Enter appended
`/paseo-project`; nothing was sent. `plugin/media/` now holds real-app
captures (the update-available state used a temporary local version change
that was reverted).

Not verified: the native mobile app, the Electron desktop shell itself (the
same web bundle runs inside it), and a real update install.

## English listing media (v2.12.11)

Goal: the plugin is listed worldwide on paseo.sh, so its listing images and
every message it shows must read in English unless the app is in Korean.

- Server errors and update progress were Korean-only strings. The server now
  sends English text; the update worker also writes a message code and values,
  and the screen shows the code in the app language. Jobs written by older
  workers have no code and are shown as written. Tests keep the worker's English
  equal to the shared table and reject Hangul in the server files.
- Paseo 0.12 has no app language for plugins and used to fall back to Korean;
  it now follows the device language (`navigator.language`, then `Intl`).
- Captured on VAXPORT (Windows 11) from the installed Paseo 0.13.2 web bundle,
  served locally, connected to a throwaway daemon on 127.0.0.1:6899 with its
  own home. The user's daemon, app and settings were not touched. The picker was
  opened above a real one-turn conversation; five English hints that
  were cut off with an ellipsis were shortened and checked again on screen.
- `screen.png` (Korean, with a personal host name) was removed from the package.

Not verified: the native mobile app, and the 0.12 device-language fallback in a
running 0.12 app.

