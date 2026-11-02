# Logo proposals

Four sketches for an icon that says "meeting notes" (not recording, not a microphone), all on a 512 × 512 canvas with the same rounded square as the current placeholder so they drop in unchanged.

| File | Idea |
| --- | --- |
| `a-page-wave.svg` | A sheet of paper whose lines are a sound wave: what was said, written down. Black ground, paper white. |
| `b-bubble-note.svg` | A speech bubble that is also a notepad, with one amber dot for "the point to remember". Deep blue. |
| `c-m-wave.svg` | The letter M drawn as a wave, with an underline. Dark green. The simplest at small sizes. |
| `d-bubble-wave.svg` | A mix of B and the wave: the notepad bubble holds a sound wave above one line of text, with the amber dot kept. Deep blue. |

Open them in a browser to compare. They are sketches, not a final identity: the colours and strokes are meant to be tweaked.

## Make your own

- **Edit one of these**: any vector editor opens an SVG (Inkscape is free, Figma and Affinity work too). Keep the 512 × 512 canvas and the rounded square (`rx="112"`) so the icon fits the scripts.
- **Draw from scratch**: same canvas and rounded square, a simple shape that still reads at 16 × 16, no text inside the icon.
- **Ask for a variation**: say which one you like and what to change (colour, shape, add or remove the amber dot) and it is a quick edit.

## Adopt one

1. Copy the chosen file over `brand/mynota-app-icon.svg`.
2. Run `scripts/generate-icons.sh` to regenerate the icon set in `app/src-tauri/icons/`.
3. Replace the mark and wordmark in `ui/public/brand/` (the mark is the icon without its rounded square; the wordmark is the name set in the app's font).
4. Update `brand/README.md`: it still says the logo is a placeholder.

Mynota is a fork of Myna and does not reuse Myna's name, logo or icon: keep any new design clearly different from the original.
