# Cua platform validation status

`/paseo-cua` is **preview / limited validation**. It is not broad, stable, and
fully verified Mac and Windows support. This page records the exact verified
boundary, what remains unverified, and the short procedure to validate a new
target before any support claim is updated.

## Verified boundary

One target has real evidence, recorded here on 2026-09-21:

| Field | Verified value |
| --- | --- |
| Host | one Apple Silicon macOS machine, macOS 26.6.2 |
| Cua Driver | 0.28.2 (pinned by the Paseobility installer) |
| Binary / self-check | installer prepared the binary; `cua-driver doctor` reported every probe ok |
| MCP integration | registered with the OpenCode client and connected; handshake ok and `tools/list` returned 56 tools |
| macOS permissions | Accessibility and Screen Recording reported `true` under the driver-daemon identity (`com.trycua.driver`) |
| Native GUI smoke | dedicated background Calculator instance; background accessibility actions performed `1 + 1 = 2` with no focus steal and no foreground escalation; the driver's own window screenshot (plus a zoom crop) visually showed result `2` |

What was actually demonstrated there: the pinned binary installs and self-checks,
the MCP server is discoverable by a real client, the OS grants can be held under
the driver's own app identity, and at least one native app can be driven and
captured. That is a preview boundary, not a support matrix.

## Explicitly not verified

- **Exposure inside an already-running Paseo session.** The MCP server was
  registered and connected, but the long-running Paseo provider was
  intentionally not restarted, so tool exposure inside a live, pre-existing
  session was not confirmed. A new session or an integration reload may be
  needed to pick it up, but that specific path was not exercised here.
- **The driver's `verify_state` on the Calculator result.** It returned
  `unknown`, meaning **Cua's own observation of that target was incomplete**.
  This is a Cua observation gap on that target, not a statement that macOS never
  exposes the value — an independent native accessibility read-back did expose
  `2`. Treat `unknown` as "not confirmed", never as success and never as proof
  about the platform.
- **A dedicated ScreenCaptureKit capture probe.** It remains `not_checked`. The
  screenshot above is real image proof for the capture path that ran; it does
  not validate every capture backend.
- **Other macOS hardware and OS versions, the current native Windows runtime,
  and Linux.** No evidence yet (see the matrix below).

### Permission-status semantics

`unknown` / `permissions_pending` is **not** the same as denied. On this host an
earlier status reported `unknown` / `permissions_pending` even though the user
had granted the permissions. A `cua-driver stop` followed by a LaunchServices
relaunch cleared that state, after which status reported the grants `true` under
the `driver-daemon` identity. The earlier daemon attribution was **not
independently established**, so do not treat the earlier `unknown` as proof the
grants were absent, and do not attribute it to a specific cause.

## Dated matrix

| Target | Status | Basis / limits |
| --- | --- | --- |
| Apple Silicon macOS 26.6.2 — single host | Preview, partial | 2026-09-21, Cua Driver 0.28.2: driver install + self-check, MCP registered/connected (56 tools, OpenCode), Accessibility + Screen Recording `true` under the driver-daemon identity, Calculator background AX input and screenshot verified. Live Paseo-session exposure, the driver's `verify_state` on that target, and a dedicated capture probe remain unconfirmed. |
| Intel macOS | Unverified | No evidence on any Intel host or OS version. |
| Other macOS versions | Unverified | One host + OS only; nothing else was exercised. |
| Native Windows runtime | Unverified | The PowerShell installer was source-reviewed only; no native runtime, permission, or GUI evidence. |
| Linux | Unverified | No evidence. |

A past Windows-success entry in the compatibility report is a prior-version
record for other skills and is not evidence for the current Cua Driver runtime.

## How to validate a new target

Update a support statement only after matching, dated evidence exists for that
exact target. For each target, record:

1. OS name, OS version, and CPU architecture.
2. Paseo version and the provider/client name and version used for discovery —
   record what is observed; do not invent versions.
3. Cua Driver version (`cua-driver --version`).
4. Clean install **and** reuse: a fresh install works, and a pre-existing working
   driver is reused and not auto-upgraded.
5. Platform readiness from the installed contract/doctor on that OS — macOS:
   Accessibility + Screen Recording `true` under the driver-daemon identity
   (`cua-driver permissions status`); Windows: the daemon runs on an interactive
   user desktop, not Session 0; Linux: the daemon shares the graphical session
   and the AT-SPI session bus.
6. MCP discovery **in the actual fresh client** (`tools/list`).
7. Native GUI input plus read-back on a concrete app, and a screenshot capture.

Only then update the matrix and any public support claim. Do not infer one
target's success from another's, and do not record a CI result as a real-host
result unless it genuinely ran on that OS and architecture.

## Telemetry

The Cua Driver ships product telemetry **enabled by default** (the installer
does not change this). On the validated host, `cua-driver doctor` reported
`telemetry: enabled via default (install-id present)` and
`cua-driver telemetry status` showed the same setting with a pseudonymous
installation id.

Inspect or disable it yourself:

```bash
cua-driver telemetry status      # current setting + install-id presence
cua-driver telemetry disable     # stop sending; keeps the local install id
```

Precedence is environment override, then the persisted preference, then enabled
by default. Paseobility does not change this setting and does not disable it for
you.

Per the pinned upstream source, events are described as content-free and bounded
(fixed event names with bounded properties). That description was **not**
independently audited here and is not a privacy guarantee. The pinned source and
the driver's own commands are authoritative:

- Pinned upstream: [`trycua/cua` @ `9bbfa7dd3e27ca7f1861ede70aaca390174493f9`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9),
  telemetry module
  [`crates/cua-driver/src/telemetry.rs`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/crates/cua-driver/src/telemetry.rs).
- Driver docs: [cua.ai/docs/cua-driver](https://cua.ai/docs/cua-driver).

## Related

- Reproducible macOS onboarding: [`skills/paseo-cua/references/setup.md`](../skills/paseo-cua/references/setup.md).
- Prior-version skill compatibility (does **not** cover `paseo-cua`): [`compatibility-0.9.0-beta.2.md`](./compatibility-0.9.0-beta.2.md).
