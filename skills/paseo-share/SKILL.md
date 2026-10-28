---
name: paseo-share
description: >-
  Share Paseo files (up to 50 MiB each) through a private Git repository and
  return preview/download links, onboarding the account's private paseo_share
  repository on first use. Use to share a file or result, or to find, list,
  preview or fetch shared files across Paseo computers or on mobile. Triggers
  include "share this file", "show the file from my other computer", "latest
  shared artifact", "공유해줘", "올려줘", "다른 컴퓨터 파일", and "공유한 파일
  가져와".
---

# Paseo Share

A dedicated private Git repository is the user's file inbox across computers
and phone. The bundled Node.js CLI does all Git work with plain
`fetch`/`rebase`/`commit`/`push`; no daemon, no GitHub Actions, and no
dependency on Paseo's daemon or MCP tools.

Needs `node` and `git` on every computer, and GitHub CLI (`gh`) for automatic
onboarding. Custom remotes (Forgejo etc.) use `setup <repo-url>` with SSH or
the OS credential manager; never put a token in the URL. Use one repository
per person or fully trusted device group. State and the clone live under
`~/.paseo/share/` (`PASEO_SHARE_HOME` overrides, for tests).

## Commands

```bash
node <skill-dir>/scripts/paseo-share.js <command> [arguments]
```

```text
onboard [--machine <name>] [--branch <name>]
setup <repo-url> [--machine <name>] [--branch <name>]
publish <file...> [--note <text>]
list [--limit <number>]
latest
fetch <artifact-id|latest> [--output <path>] [--force]
status
```

`--json` works on `onboard`, `setup`, `publish`, `list`, `latest`, `fetch` and `status`.

## First use

Installation stays side-effect free; the first real share request authorizes
onboarding.

1. Run `status`; if unconfigured, run `onboard`.
2. If `gh` is missing or unauthenticated, ask the user to install it or run
   `gh auth login --hostname github.com`, then retry. A GitHub connector alone
   does not prove local `git push` works.
3. `onboard` sets up Git auth through `gh` and targets `<login>/paseo_share`
   as a private repository. It creates it when absent and reuses it only when
   it is private and empty or already a Paseo Share tree. It refuses a public,
   unrelated, or incompletely inspected same-name repository, and never
   changes visibility, renames, deletes, or overwrites one. Relay that refusal
   and offer `setup <repo-url>` with another private repository.
4. Report repository, machine name, branch and checkout path. Each computer
   runs the same onboarding; the CLI infers the machine name unless the user
   wants a friendly one (`--machine macbook`).

For custom remotes, verify repository privacy with the provider before `setup`;
the helper cannot verify visibility for an arbitrary Git remote.

## Share

"Share this", "upload this result", "휴대폰에서 보게 올려줘" authorize
publishing the files the user means.

- Pass every requested file to one `publish` call; they land in one commit,
  each with its own ID. If a name could match several files, take the one the
  context points to (usually the most recent output) and say which.
- Reply with each artifact ID and the CLI's links as `[미리보기](...)` and
  `[다운로드](...)`. Private links need GitHub/Forgejo login on mobile.
- Any file type up to 50 MiB (GitHub's large-file warning) is accepted. For a
  folder, zip it first. The filename `artifact.json` (any letter case) is
  reserved for metadata and is refused before staging.
- The CLI refuses secret-looking names (`.env`, `*.pem`, `*.key`, SSH keys,
  `credentials`, `secrets`) and text content with private-key or access-token
  signatures. Never rename or edit a refused file to get it through; Git
  history keeps everything ever pushed. Binary contents are not scanned.

## Find and fetch

- `latest` for "the file I just shared"; `list` for broad or ambiguous
  requests. Show a short list (ID, machine, time, name) only when several
  artifacts fit equally.
- Preview links are enough for viewing. When the user wants to work with an
  artifact here, `fetch <id> --output <path>` and use the returned path.
  An existing directory receives the original filename; otherwise the path
  is the destination filename, not a new directory. Create a directory first
  when that is the intended destination.
- `fetch` never overwrites a different existing file: an identical file is
  reused, otherwise it writes `name (2).ext` and reports the path. `--force`
  overwrites only when the user asked to replace the file.

`publish`, `list`, `latest` and `fetch` sync from the remote first. `status`
only reads local configuration and does not test connectivity. Artifacts are immutable under
`artifacts/<machine>/<year>/<month>/<id>/` with an `artifact.json`; fetch
verifies path, size and SHA-256 and skips malformed entries. Do not edit the
managed clone by hand.

## Push failures

Concurrent pushes from other computers are rebased and retried automatically.
If a push still fails (offline, auth, hook), the commit stays in the managed
clone and the next `list`, `latest`, `fetch` or `publish` pushes it. Retry
with `list` once the cause is fixed; never publish the same file again just
to retry, which would create a second ID.

## Safety

- Publish only to the configured private repository, never to a public
  location. If the user wants a public link, say this skill does not do that.
- Never print repository credentials or secret file contents.
- Grant write access only to the same user or fully trusted collaborators.
