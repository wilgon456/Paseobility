# Listing media sources

`cover.html` composes typography, the vector brand mark and the real-app `../skills.png` capture. It is a listing illustration, not a new app screen.

`skills.png` is a 2x capture of the skill picker in the Paseo 0.13.2 web bundle with the app in English, connected to a throwaway daemon (separate home and port) with this plugin installed from the working tree and all twelve skills present in a temporary home. See "English listing media (v2.12.11)" in `docs/plugin-gui-validation.md`.

`icon.svg` is the code-native source for `../icon.png`. Render `icon.html` at 512×512 and `cover.html` at 1600×1000 in Chromium with device scale factor 1. Use a temporary profile with sync disabled (Edge otherwise signs a new profile in to the Windows account), hide scrollbars and wait for local images. There are no remote fonts, assets or scripts. PNGs are registry assets; SVG is a source only.
