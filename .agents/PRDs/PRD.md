# PRD: Tetris (working title)

**Status:** Draft v1
**Date:** 2026-10-30
**Source:** Brainstorm session (this repo, conversation history)

---

## 1. Executive Summary

A modern-classic Tetris that runs entirely in the web browser. It implements guideline Tetris mechanics — 7-bag randomizer, SRS rotation with wall kicks, hold piece, next queue, ghost piece, soft/hard drop, lock delay — wrapped in a polished, low-friction experience: load the page, press any key, and you're playing.

The core value proposition is **"one more game"**: spec-accurate mechanics that feel precise (tuned DAS/ARR input handling), visible progression (levels, real scoring with T-spins, back-to-back, combos), and just enough juice (line-clear animations, screen shake on a Tetris) to make it feel alive rather than functional. Persistent high scores in localStorage give players a reason to come back and share the link with friends.

The MVP goal is a **fully client-side static site** — no accounts, no backend, no server state — deployed to **Cloudflare Pages** as a single shareable URL. Everything the game needs ships in the initial bundle; the deployment is a static file host, nothing more.

## 2. Mission

**Mission statement:** Make the best-feeling free browser Tetris a player can reach in one click from a link.

**Core principles:**

1. **Feel over features** — input responsiveness and game feel outrank any feature add. A precise DAS/ARR implementation matters more than a second game mode.
2. **Zero friction** — no menus, no accounts, no loading screens. The distance from "clicked the link" to "pieces are falling" is one keypress.
3. **Spec-accurate mechanics** — SRS kicks, 7-bag, guideline scoring behave the way experienced players expect. No surprises, no half-implemented rotations.
4. **Honest scope** — a small set of features executed well beats a large set executed adequately. Features not in the MVP list are explicitly deferred, not silently dropped.
5. **Boring deployment** — static files on Cloudflare Pages. No backend to maintain, nothing to break, free at this scale.

## 3. Target Users

**Primary persona: The friend with the link (Alex)**
- Plays a few rounds when the URL is shared in a group chat or on a break.
- Comfortable with keyboard games; expects arrows + space + Z/X or C to just work.
- Low tolerance for friction: no sign-up walls, no "how to play" modal dumps.
- Success looks like: first game within 5 seconds of clicking, second game 10 seconds after dying.

**Secondary persona: The returning player (the project owner)**
- Has a high score to defend. Comes back to beat it.
- Notices when the game *feels* wrong (sluggish input repeat, unfair rotation) and cares about it being right.
- Technical comfort: high. Will run the dev server locally and tinker with settings.

**Key needs and pain points:**
- Existing free web Tetris clones are frequently mechanically broken (no wall kicks, visible RNG non-randomness, mushy input) or ad-cluttered. Pain point: finding one that just feels right.
- Players want to *measure* a run: score, lines, pieces-per-second — not just see a number.

## 4. MVP Scope

### In Scope

**Core functionality**
- [x] 10×20 visible playfield (+ hidden rows above for spawn), line-clear detection
- [x] 7 tetrominoes with guideline colors and standard spawn states
- [x] SRS rotation system with standard wall-kick tables (JLSTZ + I-piece)
- [x] 7-bag randomizer; next queue showing 5 pieces
- [x] Hold piece (once per drop)
- [x] Ghost piece
- [x] Move left/right, soft drop, hard drop
- [x] Lock delay (~500 ms, resets on move/rotate with a move-reset cap to prevent infinite stalling)
- [x] Top-out / game-over condition
- [x] Marathon progression: gravity increases per level (10 lines per level, guideline-style curve)
- [x] Scoring: single/double/triple/Tetris, soft-drop and hard-drop points, back-to-back, combo
- [x] Pause (Esc / window blur) and restart (R)
- [x] Game-over overlay with run summary (score, lines, level, PPS, longest combo)

**Technical**
- [x] Fixed-timestep game loop (logic decoupled from `requestAnimationFrame` rendering)
- [x] Pure game-state module with no DOM dependencies (board, pieces, RNG, scoring)
- [x] Canvas 2D rendering, devicePixelRatio-aware for HiDPI screens
- [x] DAS/ARR input handling implemented in the game loop (not browser key-repeat)
- [x] High score and lifetime stats persisted to `localStorage` with graceful fallback when unavailable (private browsing)
- [x] Line-clear flash + collapse animation, lock flash, subtle screen shake on Tetris
- [x] Unit tests for the pure core (SRS kick cases, 7-bag distribution, scoring table) via **Vitest**
- [x] Ship a CI workflow (`.github/workflows/ci.yml`) that runs `npm test` (Vitest) and `npm run build` on every PR
- [x] Sound effects via **zzfx** — procedural, zero audio assets: move, rotate, lock, line clear, Tetris, hard drop, level up, game over; M toggles mute

**Deployment**
- [x] Static build (Vite) deployed to **Cloudflare Pages** via Git integration — every merge to `main` auto-builds and deploys
- [x] Operator one-time setup (outside the factory lap loop): connect the repo to Cloudflare Pages with build command `npm run build` and output directory `dist`; neither the factory nor CI ever holds Cloudflare credentials
- [x] Production URL loads and plays with no configuration on the player's part

### Out of Scope (deferred)

**Core functionality**
- [ ] Music and richer audio design (basic SFX ship in MVP via zzfx)
- [ ] Key rebinding / settings menu
- [ ] Touch / mobile controls
- [ ] Additional modes (Sprint 40L, Ultra, Zen, multiplayer/versus)
- [ ] Accounts, cloud leaderboard, server-side anything
- [ ] PWA / offline install

**Technical**
- [ ] Automated end-to-end tests (manual play-test + type checking for MVP)
- [ ] CI/CD pipeline (Git-integrated auto-deploy) — manual `wrangler` deploy for MVP
- [ ] Custom domain setup

## 5. User Stories

1. **As a player, I want to start playing the moment I press a key on page load, so that I'm never stuck in menus.**
   *Example:* Alex clicks the shared URL, presses Left/Right, and a game is already falling — no start screen, no cookie banner.

2. **As a player, I want a ghost piece, hold slot, and 5-piece next queue, so that I can plan placements instead of reacting.**
   *Example:* Sam sees an I-piece is 2 pieces away, holds the current S-piece, and keeps a clean well open.

3. **As a player, I want held keys to repeat at a consistent, fast rate (DAS/ARR), so that movement feels precise at speed.**
   *Example:* Holding Left for a beat slides the piece 9 columns in a smooth, predictable sweep — not the stutter of browser key-repeat.

4. **As a skilled player, I want T-spin, back-to-back, and combo bonuses, so that risky play is rewarded over safe stacking.**
   *Example:* A T-spin double after a Tetris scores visibly higher than two plain doubles in a row, and the UI says so.

5. **As a returning player, I want my high score remembered, so that I'm chasing my own record every session.**
   *Example:* Jordan opens the site a week later; their best score greets them in the stats panel.

6. **As a player, I want a one-key restart and a run summary on death, so that the loop from game-over to next attempt is seconds.**
   *Example:* After topping out, the overlay shows score/lines/PPS; pressing R immediately deals a fresh bag.

7. **As a friend with the link, I want the game to work in my normal browser without installing anything, so that I can just play.**
   *Example:* Chrome, Firefox, and Safari on desktop all load the same URL and play identically.

8. **As the developer (technical), I want the game core as a pure module with no DOM access, so that I can unit-test rules and later add bots, replays, or netplay without a rewrite.**
   *Example:* `Game` exposes `update(dt)` / `moveLeft()` / `hardDrop()` over plain state; the canvas layer only reads state.

## 6. Core Architecture & Patterns

**High-level approach:** pure logic core + thin shell. All game rules live in DOM-free modules; input, rendering, and persistence are replaceable layers around them.

```
tetris/
├── .agents/PRDs/          # this PRD
├── index.html
├── src/
│   ├── main.ts            # bootstrapping, game loop wiring
│   ├── core/              # PURE — no DOM, no timing APIs
│   │   ├── constants.ts   # board size, gravity table, scoring table, colors
│   │   ├── pieces.ts      # tetromino shapes, spawn states, SRS kick tables
│   │   ├── bag.ts         # 7-bag randomizer
│   │   ├── board.ts       # grid state, collision, line clears
│   │   ├── scoring.ts     # score/b2b/combo/T-spin evaluation
│   │   └── game.ts        # state machine: update(dt), move/rotate/drop/hold, lock delay
│   ├── input/
│   │   └── keyboard.ts    # key state → intents, DAS/ARR timers, rebindable map (later)
│   ├── render/
│   │   ├── canvas.ts      # playfield, hold, next, ghost, HiDPI scaling
│   │   └── effects.ts     # line-clear animation, lock flash, screen shake
│   └── storage/
│       └── records.ts     # localStorage wrapper with in-memory fallback
```

**Key patterns and principles:**

- **Fixed-timestep accumulator:** `requestAnimationFrame` drives rendering; game logic advances in fixed dt slices (e.g., 1000/60 ms) so gravity and lock delay are framerate-independent.
- **State machine:** `menu → playing → paused → gameover` transitions live in `game.ts`; rendering and input read/respond to state.
- **Data over conditionals:** piece shapes, kick tables, gravity curve, and scoring values are lookup tables, not if-chains.
- **Intent-based input:** the keyboard layer emits intents (`left-press`, `left-held`, `hard-drop`); the core decides what they mean. Keeps DAS/ARR logic out of game rules.
- **Deterministic core:** the only randomness is the seeded bag; future replays/bots need only the seed and input log.

## 7. Tools / Features

**Playfield & pieces**
- Board: 10 columns × 20 visible rows, 2 hidden rows above for spawn buffering.
- Pieces: I, O, T, S, Z, J, L with guideline colors (cyan, yellow, purple, green, red, blue, orange).
- SRS rotation with wall kicks; I-piece uses its dedicated kick table. T-spin detection (3-corner rule) feeds scoring.

**Input**
- Left/Right: DAS ≈ 167 ms initial delay, ARR ≈ 33 ms repeat. Soft drop: ~20× gravity while held.
- Space: hard drop. Z/Ctrl or X: rotate CCW/CW. C/Shift: hold. Esc: pause. R: restart. M: mute.

**Boot & build**
- `npm test` runs Vitest in CI mode; `npm run build` produces the static bundle in `dist/`; `npm run dev` and `vite preview` serve locally.
- `index.html` mounts the game at a stable root element `<div id="app">`.
- Arrow keys and Space never scroll the page (`preventDefault`).

**Scoring & progression (guideline-style)**
- Base: Single 100 × level, Double 300 ×, Triple 500 ×, Tetris 800 ×; T-spin bonuses; back-to-back ×1.5; combo +50 × combo count × level.
- Soft drop +1/cell, hard drop +2/cell.
- Level up every 10 lines; gravity follows the guideline curve, starting gentle and becoming demanding by level 10+.

**Juice**
- Line clear: flash then collapse (~200 ms, non-blocking — the next piece deals immediately).
- Lock flash on the placed piece; subtle screen shake on Tetris/T-spin.
- Effects are renderer-side only — they never gate game logic.

**Sound**
- zzfx-generated retro SFX (~1 KB procedural synth, no audio files or licensing): move, rotate, lock, line clear, Tetris, hard drop, level up, game over.
- Audio context initializes on the first keypress — the game already starts on user gesture, so autoplay policies are satisfied naturally.
- M toggles mute; SFX fire-and-forget and never block game logic.

**Testing**
- Vitest (native Vite pairing) over the pure core: SRS wall-kick cases from the spec, 7-bag distribution, scoring table values, top-out condition. Zero runtime cost.

**Persistence & summary**
- `localStorage` keys: high score, total lines, best PPS. Wrapped so private-browsing failures degrade to in-memory.
- Game-over overlay: score, lines, level, PPS, longest combo, high-score callout.

## 8. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.x (strict) | Type-safe data tables (pieces, kicks) catch mistakes at build time |
| Build tool | Vite 7.x | Zero-config dev server + static build; the default for this shape of project |
| Rendering | HTML5 Canvas 2D | More than sufficient for grid rendering; no framework or WebGL needed |
| Testing | Vitest | Native Vite pairing; unit-tests the pure core with zero runtime cost |
| Audio | zzfx | ~1 KB procedural SFX generator — retro sounds with zero audio assets |
| UI framework | None (vanilla DOM for overlays) | The game is a canvas; a framework would be pure overhead |
| Hosting | **Cloudflare Pages** | Free static hosting via Git integration — auto-build + deploy on every merge to `main`; no backend |
| Deploy tooling | `wrangler` 4.x | `wrangler pages deploy dist` |
| Package manager | npm | Default; no monorepo needs |

**Dependencies:** runtime — `zzfx` only (single ~1 KB module); everything else is vanilla TS + Canvas. Dev dependencies: `vite`, `typescript`, `wrangler`, `vitest`.

## 9. Security & Configuration

**Authentication/authorization:** None. The game has no accounts, no server, no user data beyond local records. Deliberately.

**Configuration management:**
- No environment variables or secrets exist — the site is fully static.
- Tunables (DAS/ARR values, gravity curve) are constants in `src/core/constants.ts`, trivially editable for later settings features.
- `wrangler.toml` holds only the Pages project name and output directory; no secrets file is needed or present.

**Security scope:**
- In scope: standard static-site hygiene (no inline eval, dependencies pinned, `npm audit` clean at ship).
- Out of scope: CSP hardening beyond Vite defaults, auth, rate limiting — no server surface exists.

**Deployment considerations:**
- Single deploy target: Cloudflare Pages (production), connected to the GitHub repo via Git integration — merges to `main` auto-build (`npm run build`) and deploy; neither the factory nor CI holds Cloudflare credentials.
- `wrangler pages deploy` remains the manual fallback path.
- Custom domain deferred; `*.pages.dev` subdomain is fine for MVP.

## 10. API Specification

**Not applicable for MVP** — the game is 100% client-side with no endpoints.

*Future note:* if a global leaderboard is ever added, it would be a Cloudflare Worker + D1 (e.g., `GET/POST /api/scores`) deployed alongside Pages Functions. The pure-core architecture keeps this additive; nothing in the MVP presumes it.

## 11. Success Criteria

**MVP success definition:** the production URL loads in any modern desktop browser, and a player can complete multiple full games of mechanically-correct guideline Tetris, see their high score persist, and restart in one keypress.

**Functional requirements:**
- [ ] All guideline mechanics from MVP scope behave correctly (SRS kicks verified against known cases, 7-bag distribution, hold-once-per-piece)
- [ ] DAS/ARR movement feels consistent across Chromium/Firefox/Safari
- [ ] Scoring matches the specified table, including T-spin and back-to-back cases
- [ ] High score survives a full page reload
- [ ] Pause on Esc *and* on window blur; restart from both pause and game-over
- [ ] Game remains at ~60 fps during line clears and effects
- [ ] `npm test` passes — core rule tests (kick cases, bag distribution, scoring) green
- [ ] SFX play on lock/line clear without stuttering input or blocking the loop; M mutes

**Quality indicators:**
- `npm run build` completes with zero TypeScript errors
- Production bundle small and fast (first playable well under 1 s on a normal connection)
- No console errors during a full game session

**User experience goals:**
- From link-click to first falling piece: ≤ 5 seconds including page load
- From game-over to next attempt: one keypress
- A Tetris player would describe it as "feels right" — the calibration target for DAS/ARR and lock delay

## 12. Implementation Phases

**Phase 1 — Engine (est. 1 session)**
- *Goal:* correct game rules with no visuals.
- *Deliverables:* [ ] Vite + TS scaffold, [ ] `src/core/` modules (board, pieces, kicks, bag, scoring, game state machine), [ ] fixed-timestep loop in `main.ts`, [ ] top-out handling, [ ] Vitest setup with core rule tests (SRS kick cases, 7-bag distribution, scoring table), [ ] CI workflow (`.github/workflows/ci.yml`) running `npm test` + `npm run build`.
- *Validation:* build passes strict TS; `npm test` green; core state transitions exercise cleanly (temporary console logging acceptable).

**Phase 2 — Playable game (est. 1 session)**
- *Goal:* fully playable on screen.
- *Deliverables:* [ ] Canvas renderer with HiDPI, [ ] hold/next/ghost/stats layout, [ ] keyboard input with DAS/ARR, [ ] gravity + lock delay wired to loop, [ ] pause/restart/game-over flow.
- *Validation:* manual play-test — movement feels precise; hold, kicks, and hard drop behave; no stuck states.

**Phase 3 — Polish & persistence (est. 1 session)**
- *Goal:* it feels like a game, not a demo.
- *Deliverables:* [ ] line-clear flash/collapse, lock flash, screen shake, [ ] full scoring with b2b/combo/T-spin, [ ] localStorage records + fallback, [ ] game-over summary overlay, [ ] zzfx SFX (move/rotate/lock/clear/Tetris/hard drop/level up/game over) with M-mute.
- *Validation:* scoring spot-checks against the table; reload preserves high score; effects and SFX don't block input.

**Phase 4 — Release (operator step, outside the factory lap loop)**
- *Goal:* shareable URL, kept current automatically.
- *Deliverables (operator):* [ ] connect the repo to Cloudflare Pages (build command `npm run build`, output directory `dist`, production branch `main`), [ ] first production deploy, [ ] smoke test on the live URL.
- *Validation:* production URL loads, plays a full game, high score persists; every later merge to `main` deploys automatically; no console errors.

## 13. Future Considerations

- **Music and richer audio:** a real soundtrack via Howler.js on top of the MVP's zzfx SFX; per-sound volume settings.
- **Settings:** key rebinding, DAS/ARR sliders, background/gridline toggles.
- **Touch controls:** mobile layout with swipe (move) / tap (rotate) / swipe-down (drop) — meaningful work; separate PRD-worthy.
- **Extra modes:** Sprint (40 lines), Ultra (2 min), Zen — the mode system slots into the existing state machine.
- **Global leaderboard:** Cloudflare Worker + D1 behind Pages Functions; needs the account/abuse conversation first.
- **PWA:** offline install for a "real app" feel.
- **Replays/bots:** the deterministic seeded core makes both nearly free later.

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Game feel is off** (DAS/ARR or lock delay tuned wrong) — the one thing that can sink "feels right" | High | Tune values as named constants from day one; play-test in Phase 2, not after polish; defaults follow widely-used values (167/33 ms) |
| **Scope creep** (sound, modes, mobile creeping into MVP) | Medium | Out-of-scope list is explicit and frozen; new ideas go to Future Considerations, not this build |
| **SRS/kick implementation bugs** (piece clips through walls, rotation desyncs) | Medium | Kick tables as verbatim data from the SRS spec; hand-verify known edge cases (T-spin triples, I-piece kicks) during play-test |
| **HiDPI/cross-browser rendering glitches** (blurry canvas, stuck keys on tab-out) | Medium | devicePixelRatio scaling from the start; clear key state on `blur`; smoke-test Chromium + Firefox + Safari |
| **localStorage unavailable** (private browsing, cleared storage) | Low | Storage wrapper catches failures and falls back to in-memory records — game never blocks or errors |

## 15. Appendix

**Related documents**
- Brainstorm session notes (conversation history, 2026-10-30): three-perspective ideation; top priorities = core mechanics → tuned input → juice → scoring/progression → persistence. All five are in MVP scope.

**Key references**
- Tetris Guideline / SRS wall-kick tables: https://tetris.wiki/Super_Rotation_System
- 7-bag randomizer: https://tetris.wiki/Random_Generator
- Guideline scoring: https://tetris.wiki/Scoring
- Cloudflare Pages — direct upload with Wrangler: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Vite — getting started: https://vite.dev/guide/
- ZzFX sound effect generator: https://github.com/KilledByAPixel/ZzFX
- Vitest — testing: https://vitest.dev/

**Repository structure:** see section 6.
