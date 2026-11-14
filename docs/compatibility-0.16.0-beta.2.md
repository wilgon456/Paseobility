# Paseo 0.16.0-beta.2 compatibility

Checked 2026-11-14 on macOS arm64 and the selected remote hosts. This change
adds the explicitly verified beta to the plugin requirement and CI matrix;
it does not claim support for later betas or 0.16.0 stable.

## Confirmed failure

The installed plugin was enabled but failed on the local 0.16.0-beta.2 daemon:

```text
Plugin "paseobility" requires Paseo >=0.12.0 <0.16.0 || 0.16.0-beta.1.
Your daemon is 0.16.0-beta.2.
```

The same rejection is reproduced with the published beta.2 protocol guard.
Paseo checks daemon and app requirements independently, so remote plugins on
0.15.4 also need the beta.2 allowance for a beta.2 controller.
See the [requirements contract](https://paseo.sh/docs/plugins/reference.md#requirements)
and [beta.2 release](https://github.com/getpaseo/paseo/releases/tag/v0.16.0-beta.2).

## Verification

- Plugin TypeScript check and all 44 regression tests pass. Both daemon and
  app guards accept beta.2 and continue rejecting beta.3 and 0.16.0 stable.
- Published beta.2 compiler and SDK: both entries compile; screen, sidebar,
  attachment source, Command Center and composer pill register; cleanup passes.
- A separate temporary beta.2 daemon loads the patched plugin as `running`.
  Live `skills.status` returns 15 skills; `skills.search` returns `ps-browser`;
  the agent subscription/list API passes. The temporary daemon was stopped.
- The actual local beta.2 installation passes the same live RPC checks after
  its manifest backup and plugin-only reload.
- The 0.15.4 compiler with the beta.2 controller SDK passes the same registration
  and cleanup checks, covering the selected remote-daemon/controller pairing.

Runtime patches verify all 18 executable source files against this checkout
before changing only the requirement. Each changed manifest is backed up under
the host's `~/.paseobility/backups/compat-beta2-<timestamp>/` (Windows uses
`%USERPROFILE%`). A failed reload restores the prior manifest. No Paseo daemon
restart or app update is part of this fix.

## Limits

The compiler/SDK checker stubs rendering primitives. Real desktop/mobile picker
click-through and Windows visual layout were not tested. The separate
`tools/paseo-bot/plugin` and Hermes `paseo-dispatch` are outside this patch.
