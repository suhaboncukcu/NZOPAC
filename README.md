# NZOPAC // GRID 64

A web-deployable Three.js arcade game whose entire art direction is **derived from a
random 64-character alphanumeric string**.

```txt
NzopacbAmWFrlER6vV48ZbqKEqJEqrM4CZl9XuJ9lbyTYasTcVnHoav3BQBWMGBv
```

## How the seed became the design

| Observation in the string | Design decision |
| --- | --- |
| Exactly **64** characters | The world is an **8×8 = 64 tile** floating circuit board |
| **7** digits: `6 4 8 4 9 9 3` | **7 numbered cores**, **7 notes** in the collect arpeggio, up to **7 glitches** |
| First six digits as hex `64 84 99` → `#648499` | Base colour of the whole palette (steel blue), hue-rotated for every accent |
| Trailing `3` | The "three lives" motif; repeated 3×-letters echoed in triadic accents |
| Uppercase / lowercase / digit positions | Rendered literally as the animated **8×8 sigil** in the HUD and title screen |
| Digits cluster on the right edge (col 7) | The glitch swarm favours enclosing you from the edges |

Every palette is computed at runtime from the seed: the board hue comes from the digits
read as a hex colour, cores take the complementary hue, and the swarm takes the triadic
hue. Change the seed and the whole game re-skins itself.

## Play

- **WASD** / **Arrow keys** — move one tile at a time (hold to run)
- **Swipe** — move on touch devices
- **Space / Enter / Tap** — start, restart
- **P** / **Esc** — pause · **M** — mute

Collect all seven numbered cores to clear the level. Each level adds a glitch and speeds
the swarm up. Getting touched costs a life and resets your combo.

## Run locally

The game is fully static, but it uses ES modules + import maps, so it needs to be served
over HTTP (not opened as `file://`).

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or `npx serve .`

## Deploy

Drop the folder on any static host — GitHub Pages, Netlify, Vercel, Cloudflare Pages,
S3, anything. There is no build step and no server code.

Three.js (r160) is loaded from the unpkg CDN via the import map in `index.html`; the only
other network request is the Google Fonts stylesheet. Both degrade gracefully.

## Reseed

Use **NEW SEED** in game, or pass one in the URL:

```txt
https://your-host/?seed=YOUR_OWN_64_CHAR_STRING
```

Any 16–128 character alphanumeric string works, and high scores are kept per seed in
`localStorage`.

## Files

```txt
index.html   markup, HUD, overlays, import map
style.css    telemetry-style interface skin (palette injected from JS)
game.js      the game: seed decoding, palette, world, entities, loop
```

## Tech

Three.js · vanilla ES modules · WebAudio (no audio files) · UnrealBloom + ACES tone
mapping · canvas-generated textures · no assets, no bundler.
