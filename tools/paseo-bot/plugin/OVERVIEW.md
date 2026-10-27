# Paseo 봇

A conversation-first sidebar screen for the VAXPORT manager and queue. Registers `queue` with
`addScreen` / `addSidebarHeaderItem`, like Paseobility and Agent Observatory.
The original `plugin/` and its install remain independent.

See [v2 setup, conversation admission and security](../../../docs/paseo-bot-gui-v2.md).

Development (Node 22):

```sh
npm ci
npm run typecheck
npm test
npm run preview
```

Preview is explicitly offline fixture data rendered by the production view;
it never connects to SSH or the real queue. Browser tests use `CHROME_PATH`
when set, then an installed Ego Lite, then Google Chrome, and otherwise fall
back to Playwright's bundled Chromium; Microsoft Edge is never used.
