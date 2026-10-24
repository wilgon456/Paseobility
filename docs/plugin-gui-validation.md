# Paseobility GUI validation — 2026-10-24

Scope: the selectable eleven-skill launcher, browser choice, prompt preview, explicit existing-agent target, host installation view, sidebar and workspace panel registrations. Local app and daemon: Paseo 0.12.0. Source development SDK: 0.11.4; manifest minimum: 0.12.0 (the tested app).

## Verified

- TypeScript strict typecheck and six Node tests passed. Tests cover permission/active-turn/archive/workspace exclusions, a fresh snapshot becoming busy, concurrent and repeat clicks, lost delivery acknowledgement, and retrying a failed read.
- Actual `client/screen.tsx` rendered through React Native Web with a mocked Paseo host. Launch, installation, and offline states were checked at 375, 768 and 1440 pixels in light/dark themes: 18 renders, zero errors and zero warnings. Screenshots were reviewed, including the bottom of the mobile form. The fixture is not a live Paseo client.
- Ego Lite interactions verified the Chrome instruction, Korean task text, one accepted send, target navigation, new-task reset, skill switching, installation status, empty/offline states, and a lost-acknowledgement send remaining disabled with exactly one send attempt. The one test TaskSpace was finished with no retained tabs.
- The actual local `paseobility` plugin was reloaded and reported `running`; logs showed `Plugin ready` without an error. Its actual app accessibility tree exposed all eleven skill buttons, MAC_HOME context, task input, and a real idle-agent list. This also exercises the host SDK list and status RPC path. No daemon restart was performed.
- Existing skill/catalog validation passed. CI now runs plugin dependency installation, typecheck and launch safety tests.

## Limits

- No message was sent to a real user agent. Send/acknowledgement scenarios were tested against a controlled SDK fixture; an actual provider turn launched from the GUI remains unverified.
- Actual mobile clients and other computers were not changed or exercised. Compact/light/dark proof is from the rendered component fixture. The workspace panel registration typechecks; its actual workspace navigation was not exercised.
- The native app's pixels initially stayed stale while its accessibility state advanced. A screen-only Reload restored app navigation; subsequent external app activity ended native UI actions. This is not evidence that the launcher failed or that all app rendering paths were tested.
- Installation status is file presence only. Existing sessions may not have loaded newly copied skills.
- Paseo has no atomic idle-only send. A concurrent turn between refresh and send may be steered or interrupted according to the provider's steering support. Unknown delivery acknowledgement is never automatically retried.

Local evidence was generated under `/tmp/paseobility-gui-final-check/` (launch/status/offline reports and screenshots); `plugin/media/screen.png` is the non-private mock-host launch screenshot. Temporary evidence paths are not portable artifacts. This change updates the current local plugin and Git source; it is not a fleet rollout or a published release.
