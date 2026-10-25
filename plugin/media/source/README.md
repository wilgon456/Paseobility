# Listing media sources

`cover.html` composes typography, the vector brand mark and the unchanged real-app `../skills.png` capture. It is a listing illustration, not a new app screen. The picker capture was taken in the Paseo 0.13 web app during the integration pass documented in `docs/plugin-gui-validation.md`; plugin picker code has not changed since that capture.

`icon.svg` is the code-native source for `../icon.png`. Render `icon.html` at 512×512 and `cover.html` at 1600×1000 in Chromium with device scale factor 1. Use a temporary isolated profile, hide scrollbars and wait for local images. There are no remote fonts, assets or scripts. PNGs are registry assets; SVG is a source only.

The older `screen.png` is retained as historical evidence but is excluded from current listing media because it contains a personal host label and an illustrative old-version update state. Native mobile screenshots and new runtime behavior are outside this media-only update.
