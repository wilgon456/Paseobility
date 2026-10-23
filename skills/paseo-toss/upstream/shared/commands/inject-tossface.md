---
description: 'Wire the Tossface emoji web font (이모지 서체) into the project files directly — the official CDN link or a subset bundle, picked and inserted into the actual project, not just explained in chat, so emoji render as consistent Tossface glyphs instead of each OS system font. Run this immediately for requests like "이모지를 토스페이스 서체로 렌더하고 싶어", "CDN 링크로 Tossface 붙여줘", or "이모지 서체 적용해줘" — do not just paste a code snippet in the reply instead of invoking it.'
argument-hint: ''
---

Load the `inject` skill — the user invoked the **tossface facet** (`/ait:inject-tossface`): they want to render emoji as Tossface glyphs, either via a CDN link (zero bundle cost, network-dependent) or by bundling the specific font subsets the project actually uses (deterministic, adds ~520KB–1.9MB per subset, requires the license file). Jump to the "tossface facet — `/ait:inject-tossface`" section, not the devtools or debug-console facet. Takes no argument.
