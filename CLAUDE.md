# Song Space

A browser-based musical experience where dancers explore "song spaces" — interactive soundscapes built from blended songs. Choose from curated default spaces, or upload your own song to create a new one. Movement drives how the music blends and transforms in real time.

## Architecture

### Backend (`backend/`)

FastAPI service that processes songs into categorized, section-aware loops ("song spaces").

```
Upload song → [sequential: allin1 structure + Demucs stems] → chop → filter → categorize → select
```

- **Demucs** (Replicate, `ryan5453/demucs`) — Separates song into 4 stems: drums, bass, vocals, other (~$0.035/song)
- **allin1** (Replicate, `sakemin/all-in-one-music-structure-analyzer`) — Detects song sections: intro/verse/chorus/bridge/solo/outro (~$0.10/song)
- **Post-processing** — Chopping, energy filtering, vocal phrase extraction, categorization, selection

### Key Backend Files

| File | Purpose |
|------|---------|
| `backend/app/api/process.py` | `/api/process` endpoint — orchestrates the pipeline |
| `backend/app/services/song_analyzer.py` | Calls allin1 on Replicate for song structure |
| `backend/app/services/stem_separator.py` | Calls Demucs on Replicate for stem separation |
| `backend/app/services/loop_chopper.py` | Chops stems into loops — section-based for instruments, VAD phrase extraction for vocals |
| `backend/app/services/categorizer.py` | Categorizes loops (groove, foundation, bass, hook, accent, harmonic_bed, texture) and auto-selects best per section |
| `backend/app/services/beat_analyzer.py` | Fallback beat detection via librosa (used when allin1 fails) |
| `backend/app/main.py` | FastAPI app setup, temp dir, CORS |
| `backend/app/config.py` | Settings (MAX_UPLOAD_MB=100, Replicate token) |
| `docs/LEARNINGS.md` | Pipeline refinement log — accumulated taste decisions from listening sessions |

### Frontend (`frontend/`)

Vanilla JS app served by the API at `/app`. No build step.

| File | Purpose |
|------|---------|
| `frontend/js/app.js` | Main orchestration — song loading, play/stop, webcam init, detection loop, two-body auto-detect |
| `frontend/js/audio-engine.js` | Tone.js Transport-synced loop players, category volume control |
| `frontend/js/movement.js` | MediaPipe landmarks → 8 body qualities (velocity, jerkiness, coherence, etc.) + relational metrics |
| `frontend/js/readings.js` | ReadingConfig: weighted quality combos with hysteresis gating |
| `frontend/js/mapping.js` | Readings → audio category volume targets (the taste layer) |
| `frontend/js/score.js` | DEFAULT_SCORE — the complete experience config (arc, readings, mappings, triggers) |
| `frontend/js/trigger-engine.js` | Declarative edge trigger evaluation — rising/falling edges, sustain timers, arc-aware |
| `frontend/js/trigger-actions.js` | Translates trigger actions into AudioEngine calls (mute/solo/restore) |
| `frontend/js/loop-grid.js` | Developer loop grid UI |
| `frontend/js/song-picker.js` | Song catalog cards |
| `frontend/js/arc.js` | Phase-driven remixing with engagement tracking |

### Score — the Composer Framework

A **score** is the complete definition of an interactive musical experience. It bundles everything the system needs to run a Song Space session. See `docs/solutions/composer-framework.md` for the full concept.

**Three layers, three roles:**
- **Composer** provides loops (organized by category × section) + an arc (temporal journey)
- **Interaction designer** provides readings, mappings (continuous), and triggers (edge-triggered moments)
- **Dancer** provides movement

**The score config** bundles: arc + readings + mappings + triggers. Defined as `DEFAULT_SCORE` in `frontend/js/score.js`. Future: JSON that composers and interaction designers can author independently.

**Categories** are the 7 functional roles a loop can fill: texture, harmonic_bed, bass, foundation, groove, hook, accent. **Sections** are the 5 emotional phases: intro, verse, chorus, bridge, outro. The **arc** defines which categories are available in each phase and for how long.

This framework is designed to transfer into Ralf's scene system. The arc is the new concept Ralf doesn't have yet — temporal composition on top of reactive interaction.

### Reading Behavior Patterns

Readings support three composable temporal behaviors — Ralf's vocabulary for expressing how body states shape music over time:

| Pattern | Config | Behavior | Good for |
|---------|--------|----------|----------|
| **Instantaneous** | (default) | Value snaps to weighted mix when gate opens | Reactive states: energy, arms_up, wide, compact |
| **Accumulating** | `rampSeconds: N` | Value grows 0→full over N seconds, resets on gate close | States where time deepens meaning: stillness (3s), suspended (2s), melting (4s) |
| **Edge-triggered** | `intents: [{ after: N }]` | Fires one-time action after sustained activation | Dramatic moments: drums_drop (2s), strip_down (5s) |

These compose freely: stillness is both accumulating AND edge-triggered. Implemented in `frontend/js/readings.js` via `activeTime` tracking per reading.

### AdaptiveRange Pinning

Qualities with absolute bounds (velocity min=0, coherence min=0) need their AdaptiveRange pinned to prevent decay-driven collapse. Pin both before AND after normalize. The max floor must satisfy: `noise_floor / max_pin < gate_threshold - HYSTERESIS_BAND`. For velocity: `0.002 / 0.05 = 0.04 < 0.07`.

### Song Spaces (Library)

Pre-processed curated songs live in `library/`. Each song space has a `metadata.json` and `loops/` directory with MP3 files.

The standalone [Blender](https://github.com/meninoebom/blender) CLI tool creates song spaces from any audio file. The backend uses the same pipeline via Replicate cloud APIs.

## Critical Technical Decisions

### Vocal chopping: VAD, not section boundaries
Vocals are sparse — silence between phrases is the signal. RMS-based Voice Activity Detection: 20ms frames, 100ms rolling avg, threshold 0.008, merge gaps < 300ms. Each phrase > 1s becomes its own loop.

### Directional snap-to-silence
End cuts search forward (let the phrase finish). Start cuts search backward (find quiet before phrase starts). Window: 0.8s.

### Energy thresholds are per-stem
drums: 0.005, bass: 0.003, vocals: 0.005, other: 0.003. Use `<=` (not `<`).

### Front-loaded energy filter
If first 20% of a vocal loop has >75% of total energy, skip it — word fragment + dead air.

### Replicate rate limits
With < $5 credit, burst limit is 1 request. allin1 and Demucs run sequentially to avoid 429s.

### Replicate SDK FileOutput objects
SDK v1.0+ returns FileOutput objects, not strings. Always use `str(v)` to normalize URLs.

## Deployment (Railway)

- **Service:** `song-blender-api` in Railway project (to be renamed to `song-space`)
- **Domain:** `song-blender-api-production.up.railway.app` (to be updated)
- **Frontend:** served at `/app/`
- **Deploy:** `cd /path/to/song-space && railway up --detach` (from repo root, NOT backend/)
- **Logs:** `railway logs` (runtime), `railway logs --build <deployment-id>` (build)
- **Env vars:** `REPLICATE_API_TOKEN` (required)
- **Health check:** `GET /health`

### Deploy context: repo root, not backend/

**Critical:** Deploy from the **repo root**. The app serves `frontend/` at `/app` and `library/` at `/library` — sibling directories to `backend/`. Deploying from `backend/` makes them invisible (404).

Config files at repo root:
- `railway.toml` — start command: `cd backend && python start.py`
- `nixpacks.toml` — `providers = ["python"]` (forces Python over Node; root `package.json` confuses auto-detect)
- `requirements.txt` — contains `-r backend/requirements.txt` (so nixpacks finds deps at root level)

### Library path resolution

`main.py` and `library.py` check `settings.LIBRARY_DIR` (`/data/library`) first, then fall back to git-committed `library/`. Supports both baked-in library and future Railway Volume for user uploads.

### Gotchas

- **nixpacks + package.json:** Root `package.json` makes nixpacks think it's Node.js. `nixpacks.toml` with `providers = ["python"]` overrides.
- **`railway link` is per-directory:** Run from repo root.
- **Loop sync drift:** File durations aren't exact bar multiples. Fix: `player.loopEnd = Math.round(duration / barDuration) * barDuration`.
- **Tone.Transport sync:** All players must use `player.sync().start(0)` for shared clock.
- **AdaptiveRange normalizer:** Expands instantly on new extremes, contracts slowly (decayRate 0.998). First few seconds recalibrate — expected, not a bug.

## Local Development

```bash
make setup   # one-time: creates venv + installs deps
make dev     # runs uvicorn with --reload on localhost:8000
```

Frontend: http://localhost:8000/app/ (served by FastAPI, no separate process)

**Note:** Create `backend/.env` with `REPLICATE_API_TOKEN=...` if processing new songs. Library songs work without it.

## API

```
POST /api/process  (multipart file upload)
GET  /health
GET  /api/library  (list curated song spaces)
GET  /api/library/{slug}  (song space metadata + tracks)
GET  /clips/{job_id}/{filename}  (serve generated loop files)
```

## Development Workflow

Use judgment to plan appropriately for the task:
- Simple changes: just implement directly.
- Larger changes: think through the approach before coding.
- Always create a feature branch, commit with descriptive messages, and create a PR.

## After Completing Work

Before wrapping up a non-trivial PR, self-assess:
- What was the hardest decision or trickiest problem?
- Did anything surprise you or require a workaround?
- Would a future session benefit from knowing this?
If yes, update CLAUDE.md with the pattern or gotcha.
