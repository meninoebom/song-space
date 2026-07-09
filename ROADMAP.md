# Song Space — Roadmap

## Product Vision

A fun, widely available web experience where people explore "song spaces" using their webcam. Choose a song space — built from real songs via the Blender — and your movement drives how it blends and transforms in real time. A game-like musical experience.

**Target audience (v1):** Adults looking for a novel, playful experience
**Future direction:** Kid-oriented versions, Ralf integration

## What's Done

- [x] Song processing pipeline (Demucs stems + allin1 structure + chopping + categorization)
- [x] Backend API deployed on Railway
- [x] Library system with 4 curated song spaces (Highest, If I Had A Million, When Angels Sing, Sweet Thang)
- [x] Frontend: song picker, loop grid, Tone.js audio engine with Transport-synced loops
- [x] Webcam movement mixing: MediaPipe Pose → body qualities → readings → audio mapping
- [x] Two-body support with relational readings (synchrony, contrast)
- [x] Arc Mode: phase-driven remixing with engagement tracking
- [x] Loop sync: bar-quantized loop endpoints prevent drift

### Since 2026-03-04 (composer-framework + launch backlog)

- [x] **Composer framework / Score** — the full experience config (arc + readings + intents + mappings) as `DEFAULT_SCORE`/`PROOF_SCORE`; three-role model (composer, interaction designer, dancer). See `docs/solutions/composer-framework.md`.
- [x] **Unified RalfRuntime** (#30, #33) — consolidated the split mapping/trigger-engine/trigger-actions pipeline into one `runtime.js` brain (Readings → Resolve → Draw → Act), sharing Ralf's Scene schema; dead pipeline files deleted.
- [x] **Three interaction modes** — Gate (quantized to bar), Impulse (immediate one-shots), Continuous (per-frame effects); `PROOF_SCORE` demonstrates all 7 categories.
- [x] **Expanded body qualities** (#28) — 11 qualities in `constants.js` QUALITY_KEYS (velocity, impulse, coherence, contraction, verticality, wristSpread, armsRaised, legBend, headTilt, jump, step) + relational metrics.
- [x] **Body-state effects + bring-in/take-out** (#31) — grounded/coiled/explosive/swaying readings; per-instrument effects, quantized mute/restore, weighted draw pools.
- [x] **Quality Lab** — standalone `quality-lab.html` for testing quality computation in isolation.
- [x] **Segmented phase indicator** (#26) + stage directions overlay.
- [x] **Runtime contract cleanup** (#53) — solo restores trigger-muted members; legacy volume paths removed (fixedVolumes only); score-owned startup mix; node test harness repaired.
- [x] **Vendored frontend assets** (#51) — Tone.js + MediaPipe served locally, no CDN dependency.
- [x] **Root URL + landing page** (#49, #59) — served at the root, hardcoded Railway domain removed, share metadata, user-facing song cards.
- [x] **First-run onboarding** (#56) — camera priming, phase hints, feedback pill.
- [x] **Graceful failure paths** (#57) — capability gate, mobile interstitial, friendly errors.
- [x] **Debug-gated readings meter** (#58) — meter and skeleton hidden by default; stale skeleton cleared; step-back hint.

## Next Steps (in order)

### 1. Deploy as Song Space ✅ (done, #61)
- [x] Create new GitHub repo (split from states-of-being) — origin is `meninoebom/song-space`
- [x] Update Railway project/service naming — service + domain now `song-space` / `song-space-production.up.railway.app`; old `song-blender-api-production.up.railway.app` retired
- [x] Design a proper landing page for the Song Space experience (#59)
- [x] Replace the root index.html with a Song Space entry point (#49, #59)
- [x] Dev-surface decision (#61): `quality-lab.html` / `?debug` / `?score` accepted as unlisted dev tools (see CLAUDE.md Deployment)

### 2. UX refinement
- The grid is a developer tool — design the actual user experience
- What does a new user see? How do they understand what's happening?
- Movement-driven mode needs to feel intuitive without explanation

### 3. Tune movement-to-music mappings
- Test with real users (not just developer)
- Adjust reading configs (thresholds, weights) based on feel
- Tune relational readings with two actual dancers

### 4. Add more curated song spaces
- Process 5-10 more songs across genres via the Blender
- Run through ingestion script, commit to library/

### 5. User song upload
- Railway Volume at `/data/library` for writable persistent storage
- Upload UI calling existing `/api/process` endpoint
- Downloaded loops stored on volume, not baked into image

### 6. Premium tier
- Account system (auth, usage tracking)
- Upload limits, storage quotas
- Pricing model decision needed

## Out of Scope (v1)

- **Mobile / small-screen layout.** Song Space reads the whole body through the
  webcam and assumes a laptop or desktop with room to move. A real responsive
  mobile pass (touch-first layout, portrait framing, phone-camera pose tuning) is
  deliberately deferred past v1. For now, viewports below ~768px get a friendly
  interstitial recommending a laptop, with a "try anyway" escape hatch, and
  unsupported browsers get a capability-gate message (see #57).

## Open Questions

- UX: what does the non-developer experience look like?
- How many curated song spaces ship in the free tier?
- Ralf integration: when does Song Space become a formal Ralf translator?
- Should Tone.js generative spaces (no song upload needed) be added as a mode?
