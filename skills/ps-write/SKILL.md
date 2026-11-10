---
name: ps-write
description: >-
  Use only for an explicit /ps-write request or a direct request to use this
  skill. Draft and revise reader-facing documents with source checks and a
  cold-reader review. Ordinary replies, code comments and commit messages do
  not trigger it.
---

# Paseo Write

Write documents people can use: reports, proposals, guides, announcements,
emails and READMEs. Drafting an email does not authorize sending it.

## 1. Name the reader and outcome

Restate the goal, acceptance criteria and constraints in at most five lines.
Name the reader and what they should be able to decide or do after reading.
Infer routine details; ask only when blocked by something that cannot be found
or sensibly defaulted. Keep the requested format, length and factual scope.

Required specialist check before task work: if `ps` is installed, execute
`node <ps-skill-dir>/scripts/skill-catalog.js list --names` once and read its output.
Report the number listed and the chosen name, or "none fits" only after that read.
For a clear fit, run `path <name>` with the same script and read at most one specialist
in place. If absent or the command fails, explicitly report that limitation; do not
silently skip. Never install or copy skills; retain this harness's verification.

Instruction order, highest first: what the user said in this conversation;
project instructions; this harness; the catalog specialist's domain guidance.

Write in the language the reader uses. For Korean output only, read
[references/korean-style.md](references/korean-style.md) before drafting.
For Word, HWP/HWPX, PDF or slides, choose a format specialist through `ps` in
the same single catalog pass. If none is available, prepare supported text
and report the format/rendering gap; do not reimplement a file-format tool or
claim that a plain-text draft is the requested formatted deliverable.

## 2. Gather facts, then outline

Read the sources the user supplied before writing claims. Keep a compact
claim-to-source map with locations precise enough to check later. Preserve
names, identifiers, numbers, dates, qualifications and uncertainty. Mark any
claim not supported by a source **unverified** instead of inventing support.
Separate recommendations from facts; a confident tone is not evidence.

Outline around the reader's next action. Put the conclusion or requested
action on the first screen, followed by the reason and necessary details.
Choose structure by content: tables for comparisons, numbered lists for
steps, prose for reasoning. Do not force every section into the same shape.

## 3. Draft, then revise

Follow the outline and the reader's register. Explain unfamiliar terms when
they first matter, keep concrete subjects and verbs, and cut repetition.
Retain source traceability with citations or a short source note; when inline
citations would hinder an email or announcement, keep the map in review notes.
Do not silently turn an unverified claim into an assertion during revision.

Honor the requested output path and format. Without a requested path, use an
authorized existing notes folder or the system temporary folder (`$TMPDIR` or
`/tmp` on macOS and Linux, `$env:TEMP` on Windows). Do not add repository files
unless asked. Exclude secrets and private local paths from shared artifacts.

## 4. Verify the finished document

Run these checks on the actual final draft and revise what they reveal:

- **Cold reader:** read as someone with no conversation context. Could they
  act on it? List what they would still have to ask; resolve answerable gaps.
  This is an agent review, not evidence of testing with a real reader.
- **Facts:** every factual claim traces to a source or is visibly marked
  unverified. Recheck numbers, dates and qualifications after editing.
- **First screen:** the opening states the conclusion or requested action;
  record where it appears, or inspect the rendered first page when available.
- **Structure:** comparisons use tables, steps use numbers, reasoning uses
  prose where appropriate; record any deliberate exception and its reason.
- **Length:** check the requested limit. Otherwise justify the length by what
  the reader needs to act, and cut passages that add no usable information.
- **Language and format:** apply the Korean checklist only for Korean output;
  use the chosen specialist's rendering checks for a formatted artifact.

Keep brief review evidence beside the artifact or in the reply, as appropriate
to its format. A missing check stays **unverified**, not done. Do not equate
source review with independent confirmation that a source's claims are true.

## 5. Report

Return a phone-readable summary and the artifact path. List which checks ran,
what changed because of them (or that no change was needed), remaining
unverified claims and unanswered cold-reader questions. If work remains, give
the exact resume point: section, missing source or format check, and next step.
