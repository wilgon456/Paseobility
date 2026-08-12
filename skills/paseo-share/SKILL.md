---
name: paseo-share
description: >-
  Share small Paseo artifacts through a dedicated private Git repository and
  return clickable preview/download links, with automatic first-use GitHub
  onboarding to the authenticated account’s private paseo_share repository.
  Use when the user asks to share, upload, publish, find, list, preview, open,
  or fetch documents, code files, PDFs, or images across Paseo computers or on
  mobile. Triggers include
  "share this file", "upload this result", "show the file from my other
  computer", "latest shared artifact", "공유해줘", "올려줘", "다른 컴퓨터
  파일", and "공유한 파일 가져와".
---

# Paseo Share

Use a dedicated private Git repository as a small artifact inbox. Run the
bundled Node.js CLI for deterministic Git operations. It uses only local
`git fetch`/`rebase`/`commit`/`push`; it never creates or runs GitHub Actions.

## Requirements

- Require `node` and `git` on every computer.
- Require GitHub CLI (`gh`) for automatic GitHub onboarding. Keep explicit
  `setup <repo-url>` support for Forgejo or another dedicated remote.
- Use one dedicated private repository for all computers.
- Use one repository per person or fully trusted device group. Do not treat it
  as a multi-tenant exchange for mutually untrusted collaborators.
- Let automatic onboarding configure local Git authentication through `gh`.
  For custom remotes, use SSH or the operating system credential manager.
  Never put a token in the repository URL.
- Expect mobile viewers to be signed in to the Git host for private links.

The CLI stores machine-local configuration and its clone under
`~/.paseo/share/` by default. Override this only for testing with
`PASEO_SHARE_HOME`.

## Command runner

Resolve this skill's installed directory and run:

```bash
node <skill-dir>/scripts/paseo-share.js <command> [arguments]
```

Commands:

```text
onboard [--machine <name>] [--branch <name>]
setup <repo-url> [--machine <name>] [--branch <name>]
publish <file> [--note <text>]
list [--limit <number>]
latest
fetch <artifact-id|latest> [--output <directory>] [--force]
status
```

Add `--json` to `publish`, `list`, `latest`, `fetch`, or `status` when
machine-readable output helps.

## First-time setup

1. Run `status` first.
2. Treat the user’s first actual Paseo Share request as authorization to run
   `onboard`; installation alone must remain side-effect free.
3. If `gh` is missing or unauthenticated, ask the user to install it or run
   `gh auth login --hostname github.com`, then retry. GitHub Connector access
   alone does not prove that local `git push` is authenticated.
4. Let `onboard` configure local Git authentication, resolve the authenticated
   login, and target `<login>/paseo_share` with private visibility.
5. Create the repository when absent. Reuse it only when it is private and
   either empty or already contains a recognized Paseo Share artifact tree.
6. Refuse automatic setup when the fixed-name repository is public, contains
   unrelated data, cannot be completely inspected, or local Git authentication
   fails. Never change visibility, rename, delete, or overwrite repository
   contents automatically.
7. For Forgejo or a user-selected custom repository, obtain its URL and run
   `setup <repo-url>` instead of `onboard`.
8. Let the CLI infer the machine name unless the user wants a stable friendly
   name such as `macbook`, `desktop`, or `laptop`. Report the repository,
   machine name, branch, and checkout path without exposing credentials.

Run the same setup on every computer using the same repository URL and a
different machine name. For the same GitHub account, `onboard` discovers and
reuses the same valid private repository. Setup initializes an empty repository
safely.

## Publish a file

Treat requests such as "share this", "upload this result", or "휴대폰에서
보게 올려줘" as authorization to publish the named file.

1. Resolve the exact file. If multiple files plausibly match, ask which one.
2. Run `publish` for one file at a time.
3. Return the artifact ID and clickable Markdown links from the CLI output:
   `[미리보기](...)` and `[다운로드](...)`.
4. Mention that a private link requires GitHub/Forgejo login on mobile.

The CLI allows common document, code, PDF, and image formats up to 50 MiB. It
rejects obvious secret/key files and scans text-like files for common private
key and access-token signatures. Do not rename or override a rejected secret
just to publish it. Treat secret scanning as defense in depth: PDF, Office,
image, and other binary contents are not inspected for embedded secrets.

## Find or view artifacts

- Run `latest` for "the file I just shared" or the most recent artifact.
- Run `list` when the request is ambiguous or asks for shared files broadly.
- Show preview links for browser/mobile viewing. Viewing does not require a
  local download.
- If multiple artifacts could satisfy a request, show a short list with IDs,
  machine names, timestamps, and filenames.

Every read command synchronizes from the remote first, so another computer's
completed push is visible immediately after normal network propagation.

## Fetch an artifact for local work

When the user asks to edit, summarize, inspect, or otherwise work with an
artifact on the current computer, do not ask them to download it manually.

1. Resolve the artifact with `latest`, `list`, or its ID.
2. Run `fetch <id> --output <appropriate-existing-directory>`.
3. Use the returned local path for the requested work.
4. Never overwrite an existing file unless the user explicitly asks; only
   then pass `--force`.

## Storage and conflict model

Artifacts are immutable and stored in machine-specific, unique directories:

```text
artifacts/<machine>/<year>/<month>/<artifact-id>/
```

Each directory contains the shared file and `artifact.json`. Concurrent pushes
normally touch different paths; the CLI retries rejected pushes with a rebase.
Do not manually edit files inside the managed clone. Publish a new artifact
instead.

On fetch, validate the metadata schema, exact artifact path, portable filename,
real filesystem containment, regular-file type, size, and SHA-256 before
copying. New publishes calculate size and SHA-256 from the Git-staged blob so
Git line-ending conversion cannot invalidate cross-platform fetches. Fetch also
supports legacy text artifacts whose recorded bytes differ only by verified
LF/CRLF conversion. Fail closed if any remote artifact is malformed or modified.

## Safety

- Keep the remote repository private unless the user explicitly chooses
  public sharing.
- Never repurpose a public or unrelated `<login>/paseo_share` repository.
- Grant write access only to the same user or fully trusted collaborators.
- Do not publish `.env` files, credentials, private keys, certificates,
  executables, package archives, or files larger than the limit.
- Remember that removing a file in a later commit does not remove it from Git
  history. Never publish a secret; rotate it immediately if one is exposed.
- Do not print repository credentials or sensitive file contents.
- Do not install a background daemon or create GitHub Actions workflows.
- If the remote is unavailable, report that the local commit remains in the
  managed checkout and retry only when the user asks or during the next share.
