# Writing State Artifacts

Persist these only after the user approves a Studio state directory inside the
current target project. This directory is not a new Paseo workspace or external
project. Keep normal Quick mode in the conversation.

```text
.paseobility/writing/<slug>/
├── direction-lock.md
├── content-atoms.md
├── voice-profile.md
├── sources.md
├── angle-options.md
├── selected-angle.md
├── voice-calibration.md
├── locked-passages.md
├── section-ledger.md
├── drafts/
│   ├── draft-v1.md
│   └── draft-v2.md
├── reviews/
│   ├── fact-v1.md
│   ├── voice-v1.md
│   ├── clarity-v1.md
│   └── reader-v1.md
├── human-feedback.md
├── decision-log.md
└── final.md
```

## Rules

- Never overwrite an accepted `final.md`; create a dated or numbered final.
- Preserve each reviewed draft needed to explain a later change.
- Record the provider and model used for each agent role in `decision-log.md`.
- Record skipped gates, inaccessible sources, and user-approved assumptions.
- Do not store secrets, private source contents, or unnecessary personal data.
- Use stable atom, lock, source, section, and review IDs across revisions.

## Decision log entry

```text
Time:
Stage:
Decision:
Made by: user | coordinator | agent role
Reason:
Affected artifacts:
```

## Human feedback entry

```text
Target section:
Classification: must-change | preference | question | accepted
Feedback:
Locked after change: yes | no
Resolution:
```
