# Runtime and provider integration

## Readiness

Check `git --version`, `node --version`, `npm --version`, and `npx --version`.
The pinned official agent plugin requires Node **24 or later**. These tools are
not required merely to read a plan. Read the project's existing package manager,
lockfile and scripts before installing dependencies; do not replace its toolchain
as a side effect of skill installation.

Discover available tools for `apps-in-toss-docs` and `ait-console`. Configuration
presence, a reachable endpoint and an authenticated callable tool are different
states. Match server identity and tool purpose rather than a fixed name prefix.

Official endpoints from the pinned upstream README:

| Server | URL | Authentication |
| --- | --- | --- |
| apps-in-toss-docs | `https://developers-apps-in-toss.toss.im/~gitbook/mcp` | None |
| ait-console | `https://mcp.toss.im/adapters/apps-in-toss-console/mcp` | OAuth, static client ID `mcp-gateway` |

For Codex, if the user requests MCP setup, inspect the current CLI's `mcp --help`
and existing server entries first, preserving unrelated entries:

```bash
codex mcp add apps-in-toss-docs --url https://developers-apps-in-toss.toss.im/~gitbook/mcp
codex mcp add ait-console --url https://mcp.toss.im/adapters/apps-in-toss-console/mcp --oauth-client-id mcp-gateway
codex mcp login ait-console
```

Console OAuth requires the user's browser/account action per computer and
provider. Do not copy tokens from another PC. Use the appropriate provider's
configuration surface in Paseo, then reload integrations or start a fresh agent
session and verify tool discovery. Never restart the Paseo daemon for skill
discovery.

If the docs MCP is unavailable, use official developer pages via browsing and
cite them. Keep local planning/development moving; report console operations as
unavailable until authenticated tools are callable. Do not use a deploy API key
to bypass the console OAuth workflow.

## Device debugging

Browser mock debugging works independently of console OAuth. Standard phone
testing uses the test-on-device workflow: local build, authorized upload,
compilation status, and the returned entry link.

The pinned upstream on-device CDP attach procedure is **Claude Code-specific**.
Codex/Paseo must not write a Claude `.mcp.json` and claim the debugger works.
For an actual debugger setup request, use the provider's supported MCP mechanism
only after checking background-process and dynamic tool-list support; otherwise
state the unsupported adapter boundary and continue with browser debugging or
standard phone testing. The original opt-in debugger uses a pinned release URL
in `setup-debugger/WORKFLOW.md`; inspect it before enabling it. Do not auto-start
a relay, tunnel or debugger merely by loading this skill.

## Portable resources

Official shell helpers remain byte-identical under `upstream/shared/skills/`.
Read a helper before running it. The launch scanner is read-only and reports
candidate findings; zero findings is not a passed Toss review.

The design injection helper changes files and has fail-soft exit status. Verify
the per-item summary and actual files. Its quoted JavaScript snippets assume a
simple project path: for a path containing quotes or shell metacharacters, carry
out the documented merge with safe file APIs rather than interpolating that path
into the shell helper.

On native Windows do not assume Bash, `cp`, `sed` or POSIX environment assignment.
Use Git Bash only if already available, or translate the selected documented file
operations to PowerShell with literal paths and preserve existing files. Set
`$env:RELEASE_CHANNEL='dogfood'` around the build when that mode is requested,
then restore the prior value. A missing Bash helper is not a reason to install a
new shell or to overwrite project files wholesale.

The upstream `--local` scaffold fallback lives at
`<skill-dir>/upstream/shared/templates/react-vite`; it is a legacy fallback,
not equivalent to the current create-ait-app default. Read
`new-miniapp/references/local-template.md` before using it. Its historical
maintainer-only document links may not exist in this distribution; use the
bundled workflow and current official docs rather than inventing their contents.
