# Paseobility E2E report template

Copy this file, fill every field with values you actually observed, and keep
`unknown` where a layer was not confirmed. `verify_state: unknown` is **not** a
pass. A layer that was not run is `not_run`, not `pass`.

There is no automated validator: no static check can confirm that evidence is
true, so filling this template is a manual, honest record.

## Run metadata

- Date (start/end, timezone):
- Operator:
- Driver / model that operated the session:
- Commit or release under test:
- Fixture: `e2e/browser-fixture/index.html`

## Environment

- OS and version:
- Architecture:
- Paseo version:
- Paseo provider/client used for tool discovery:
- Cua version:
- Paseobility version:
- MCP connection type (`stdio`, client name):

## Result layers

Report each layer separately. A tool reply or exit status alone is not proof.

| Layer | What counts as evidence | Result |
| --- | --- | --- |
| Tool discovery | Actual installed tool names from the live contract | not_run |
| Browser semantic | Snapshot/DOM read-back of the adder result | not_run |
| Browser visual | Inspected viewport PNG (actual image seen) | not_run |
| Browser scroll | Marker text observed at MIDDLE and BOTTOM | not_run |
| Native accessibility | Cua AX read-back of the calculator result | not_run |
| Native visual | Inspected native window PNG | not_run |
| `verify_state` | Cua's own postcondition verdict | unknown |

Notes:

- Tool discovery: list the exact tool names used here and where they came from
  (do not paste a fixed schema).
- Browser semantic — value observed:
- Browser visual — image dimensions, and whether you inspected it:
- Browser scroll — marker values observed:
- Native accessibility — value observed:
- Native visual — image dimensions, and whether you inspected it:
- `verify_state` — raw result and why `unknown` is not a pass:

## Limitations

- What was not exercised:
- Which failures remain unresolved (do not claim a fix that was not verified):
- Bounded retries used (at most one) and their outcome:

## Cleanup

- Fixture server stopped:
- Tabs / apps closed:
- Agents archived (IDs):
- Anything left running:
