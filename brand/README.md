# Mynota visuals

The app icon is proposal E, `proposals/e-page-cut-wave.svg`: a note page cut across by a sound wave, on deep blue. It is the logo for now, not a final identity; the other sketches stay in `proposals/` for comparison.

Mynota is a fork of Myna and does not reuse Myna's name, logo or icon: keep any change to the visuals clearly different from the original.

- `mynota-app-icon.svg`: source of the app icons, turned into the files in `app/src-tauri/icons/` by `scripts/generate-icons.sh` (macOS) or, on Windows, by rendering it onto a transparent 1024 px canvas with the icon inset to 824 px and running `npx tauri icon` on that PNG.
- `ui/public/brand/`: the mark and wordmark shown in the app window. `mynota-mark.svg` is a one-colour silhouette of the page and the wave (the UI paints it with a CSS mask, so it follows the theme colour); the horizontal logos are the same mark next to the name, in black and in white.
- `proposals/`: the other logo sketches and how to adopt one.
