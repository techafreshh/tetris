# tetris

A complete, mechanically correct browser Tetris: SRS kicks, 7-bag deals,
hold-once per piece, DAS/ARR auto-shift, ghost piece, line-clear scoring with
back-to-back and combo, levels with a gravity curve, pause/resume, game-over
flow, line-clear effects, procedural SFX with mute, and persistent best-score
records in localStorage.

## Controls

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

## Quick start

```sh
npm ci
npm run dev      # Vite dev server (http://localhost:5173)
npm test         # Vitest suite (15 files / 139 tests)
npm run build    # tsc + vite build -> dist/
npx vite preview --port 4173  # serve dist/ for release checks
```

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

## Audit posture

`npm run audit:prod` (`npm audit --omit=dev`) is clean: the shipped bundle's
only runtime dependency (`zzfx`) has zero advisories. A bare `npm audit` still
reports dev-only Vitest-chain advisories (accepted without a major test-runner
bump, so no `npm audit fix --force` and no `overrides` pinning).
