# tetris

A mechanically correct browser Tetris on canvas: guideline SRS kicks, 7-bag deals, hold, DAS/ARR auto-shift, ghost piece, and level-based scoring with back-to-back and combos.

## Why

Classic Tetris clones often fudge the mechanics — biased piece streams, missing wall kicks, or scoring that only looks right. This repo is a dependency-light reference implementation of guideline mechanics with a pure-logic core (`src/core/game.ts`) decoupled from rendering and input, kept honest by a Vitest suite that runs in CI.

## Quickstart

Prerequisites: Node.js 20+ and npm.

```sh
git clone https://github.com/techafreshh/tetris.git
cd tetris
npm ci
npm run dev      # open http://localhost:5173, then press any key to start
```

More commands:

```sh
npm test         # run the Vitest suite
npm run build    # typecheck + build to dist/
npm run preview  # serve the production build at http://localhost:4173
```

> [!NOTE]
> Sound starts only after your first keypress — the browser requires a user gesture before audio can play.

## Usage

The game boots to a menu prompt. Press any key to start playing; the stats bar appears and pieces start falling. Clear lines to score and level up (10 lines per level); the game ends when new pieces can no longer spawn, and an overlay shows your run summary (score, lines, level, pieces-per-second, best combo).

The HUD shows `SCORE`, `LINES`, `LEVEL`, and `BEST` (all-time high score), with `HOLD` and `NEXT` side panels flanking the board. Event banners (e.g. back-to-back, T-spin, combo) appear above the board.

### Controls

| Key | Action |
| --- | ------ |
| `ArrowLeft` / `ArrowRight` | Move piece (DAS/ARR auto-repeat) |
| `ArrowDown` | Soft drop |
| `ArrowUp` / `KeyX` | Rotate clockwise (SRS kicks) |
| `KeyZ` | Rotate counter-clockwise (SRS kicks) |
| `Space` | Hard drop |
| `KeyC` | Hold (once per piece) |
| `Escape` | Pause / resume |
| `KeyR` | Restart |
| `KeyM` | Mute / unmute |

Leaving the window pauses an active run automatically. `KeyR` restarts from any state. `KeyM` toggles procedural sound effects for the session (shown in the `#mute-indicator` line under the board).

## Configuration

The app reads **no environment variables or CLI flags**. All game tuning lives in constants in `src/core/constants.ts`:

- Board: 10×20 cells with 2 hidden spawn rows
- `DAS_MS` 167 ms initial auto-shift delay, `ARR_MS` 33 ms repeat interval
- `LOCK_DELAY_MS` 500 ms before a grounded piece locks
- 15-entry gravity table (levels beyond it reuse the fastest row), 10 lines per level

The only persisted state is three `localStorage` keys (plain strings, corrupt values coerce to 0):

| Key | Stores |
| --- | ------ |
| `tetris-high-score` | All-time high score (integer) |
| `tetris-total-lines` | Lifetime lines cleared across runs (integer) |
| `tetris-best-pps` | Best pieces-per-second rate across runs (float) |

## Deploy (Cloudflare Pages)

Connect this repo in the Cloudflare Pages dashboard via Git integration:

| Setting | Value |
| ------- | ----- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production branch | `main` |

`wrangler.toml` pins the same contract in-repo (`pages_build_output_dir = "./dist"`).
`dist/` stays gitignored; Pages builds it from source. No `wrangler` CLI calls,
tokens, or credentials are stored in this repo — the operator owns project
creation and DNS outside the factory.

## Limitations

- No touch or mobile controls — keyboard only (`src/input/keyboard.ts` handles key codes, not pointer input).
- No multiplayer or online leaderboard — records are local bests in `localStorage` only.
- Fixed 10×20 board; the gravity curve is a 15-entry table, so levels above 15 all fall at the fastest row's speed.
- No sound before the first keypress — audio unlock requires the boot gesture.

## Architecture

- `src/core/` — pure game logic: board, pieces/SRS kicks, 7-bag, scoring, tuning constants
- `src/input/` — keyboard intents with DAS/ARR timing
- `src/render/` — canvas playfield renderer plus line-clear effects
- `src/audio/` — procedural sound effects with session mute
- `src/storage/` — persisted best-score records
- `src/ui/` — HOLD/NEXT panels and game-over overlay sync
- `src/main.ts` — fixed-timestep loop wiring input, game, rendering, and HUD together
