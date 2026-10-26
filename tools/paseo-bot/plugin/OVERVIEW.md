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
it never connects to SSH or the real queue. Browser tests need Chrome/Edge
or a Playwright Chromium install. `CHROME_PATH` selects an existing binary.
