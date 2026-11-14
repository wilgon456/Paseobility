# v3.0.1 release validation — 2026-11-14

This record separates the public skill package, plugin behavior, installation,
and external runtime limits. It supplements the dated compatibility reports;
it does not replace their platform-specific limits.

## Public package and compatibility

- The package contains fifteen skills, the skill-picker/version plugin,
  installers and their public checks. The resident bot and its full operational
  documentation/tests are maintained separately in a private project. Historical
  public Git commits and release archives still contain their earlier copies.
- The [manifest](../plugin/paseo-plugin.json) declares the accepted Paseo range;
  the [policy](../config/paseo-compatibility.json) records checked versions.
  The release includes exact allowances for 0.16.0-beta.1 and beta.2, alongside
  0.12.x–0.15.x. It does not implicitly admit the next prerelease or stable 0.16.
- [Release monitoring](paseo-release-automation.md) checks npm channels hourly.
  Compilation, SDK registration, both controller/daemon directions and live
  isolated-daemon RPC checks must pass before it proposes a range update.
  Proposed changes are not automatically merged or deployed to computers.
- Package catalog/frontmatter, pinned Toss resources, plugin typecheck and all
  55 plugin/policy tests passed locally. Public CI checks macOS, Windows and the
  declared compiler/SDK matrix; its results are attached to the release commit.

## Actual desktop application

On the macOS Paseo 0.16.0-beta.2 desktop application, using an owned disposable
conversation and the installed plugin:

- The composer displayed Paseobility and opened its fifteen-entry picker.
- Searching `ps-browser` showed Browser; selecting it appended `/ps-browser`
  below an existing Korean draft while preserving the existing text and its
  trailing space.
- Repeated selection left the complete multiline draft unchanged. Agent-history
  counts before/after selection showed zero additional user messages.
- The version screen displayed plugin v3.0.1 and fifteen installed skills.
  Before publication, it correctly reported the then-latest official release
  as v2.12.13. Legacy skill-version receipts remained unknown.
- A fresh Claude plan-mode agent read the installed `ps-project/SKILL.md` and
  summarized the scratch project using brief mode without modifying its files.
  The first OpenCode probe was blocked by its provider's monthly quota; that
  provider did not prove skill recognition.

The native-input preparation had one test-harness incident: Cua's keystroke
fallback submitted the first line of a multiline test string in the disposable
conversation. Selection assertions were measured afterwards, independently of
that preparation. The unsent draft was cleared after the checks. Raw native
captures contain personal sidebar content and are not part of this package.

This is a desktop smoke test of existing components, not a new responsive-layout
certification. The earlier rendered/interaction checks and their scope remain
in [GUI validation](plugin-gui-validation.md). Native mobile visual behavior,
fresh Windows GUI behavior and every skill's end-to-end runtime are not proved
by this desktop check. `ps-cua` remains preview; copying skills does not grant
OS permissions or configure external services.

## v2.12.13 to v3.0.1 migration

The actual v2.12.13 tag was installed into a temporary custom target home with
both Codex and Claude directories, runtime setup disabled. The current installer
then ran with `--migrate-skills --with-claude --no-context`:

- Twelve recognized old `paseo-*` directories per home moved to backup.
- Fifteen current skills per home matched all 314 source files byte for byte.
- A local customization in the old project skill was retained in its backup.
- Unrelated skill and private-library fixtures were preserved.
- A second installation succeeded with identical installed source bytes.

Separately, a throwaway Paseo 0.15.4 daemon installed the Git-managed v2.12.13
plugin. The documented `plugin remove paseobility` then `plugin add git:wilgon456/Paseobility:plugin` sequence was exercised with the replacement
pinned to public source commit `ec3412b3c3e3d371f46e43392fa1541fb4bd098c`.
The catalog changed from twelve to fifteen and the replacement reported
`running`. Only the throwaway daemon was stopped afterwards. The two disposable
recognition agents and their owned workspaces were archived after testing.

An old v2 updater still cannot bootstrap itself to v3: it rejects the bare `ps`
skill name. Follow the one-time manual migration in the repository README.
These local migration checks ran on macOS; Windows installer coverage is the
public Windows CI suite, not a fresh interactive Windows migration.

## Publication checks

The official release is built from its exact tagged Git commit, with a
`Paseobility-3.0.1.zip` archive and `SHA256SUMS.txt`. Release validation must check
that the archive excludes the removed bot source and ignored runtime data,
extract it, verify pinned resources, and install it into a fresh custom target
home. The downloaded public assets and tag must agree with those local bytes
and the tested release commit. None of these checks upgrades or restarts the
user's Paseo daemon.
