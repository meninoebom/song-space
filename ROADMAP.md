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

## Next Steps (in order)

### 1. Deploy as Song Space
- Create new GitHub repo (split from states-of-being)
- Update Railway project/service naming
- Design a proper landing page for the Song Space experience
- Replace the root index.html with a Song Space entry point

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

## Open Questions

- UX: what does the non-developer experience look like?
- How many curated song spaces ship in the free tier?
- Ralf integration: when does Song Space become a formal Ralf translator?
- Should Tone.js generative spaces (no song upload needed) be added as a mode?
