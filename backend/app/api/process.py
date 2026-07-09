"""Main processing endpoint — orchestrates the song space creation pipeline."""

import asyncio
import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile

from app.config import settings
from app.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}

# Serialize the Replicate calls across concurrent requests. With low account
# credit Replicate's burst limit is a single in-flight request, so two
# overlapping uploads would otherwise 429. start.py runs a single uvicorn
# process, so a module-level semaphore is sufficient to queue them.
_replicate_semaphore = asyncio.Semaphore(1)


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Auth gate for the paid processing endpoint.

    This is the single seam where auth lives. To later swap the shared-secret
    gate for per-user quotas, replace only this function's body (e.g. look up
    the key's owner and check their remaining quota) — the route wiring and
    every caller stay unchanged.

    Fails CLOSED: if PROCESS_API_KEY is unset we reject everything (503), since
    this endpoint costs real money per call. A present-but-wrong or missing key
    is a 401.
    """
    expected = settings.PROCESS_API_KEY
    if not expected:
        raise HTTPException(503, "Processing endpoint is not configured")
    if x_api_key != expected:
        raise HTTPException(401, "Invalid or missing API key")


@router.post("/process", dependencies=[Depends(require_api_key)])
@limiter.limit("5/hour")
async def process_song(request: Request, file: UploadFile):
    """Upload a song and get back categorized, choppable loops.

    Pipeline: upload -> [parallel: structure analysis + stem separation] -> per-stem chop -> categorize -> select
    """
    if not file.filename:
        raise HTTPException(400, "Filename is required")
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024

    # Reject oversize uploads via the declared Content-Length BEFORE buffering
    # the whole body into memory with file.read(). Clients can omit or lie about
    # this header, so the post-read check below stays as a backstop.
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > max_bytes:
                raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")
        except ValueError:
            pass

    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

    from app.main import TEMP_DIR

    job_id = uuid.uuid4().hex[:8]
    job_dir = Path(TEMP_DIR) / job_id
    job_dir.mkdir(parents=True)

    try:
        input_path = job_dir / f"input{ext}"
        input_path.write_bytes(contents)

        from app.services.song_analyzer import analyze_structure
        from app.services.stem_separator import separate_stems
        from app.services.loop_chopper import chop_stem
        from app.services.categorizer import auto_select, categorize_loops

        # 1. Run structure analysis first, then stem separation
        # (Sequential to avoid Replicate rate limits with low credit)
        # The semaphore also serializes these Replicate calls across concurrent
        # requests so overlapping uploads queue instead of 429ing.
        async with _replicate_semaphore:
            structure = await analyze_structure(str(input_path))
            stems = await separate_stems(str(input_path), str(job_dir))

        # Extract data from structure analysis
        sections = structure.get("segments", [])
        bpm = structure.get("bpm", 120.0)
        downbeats = structure.get("downbeats", [])
        beats = structure.get("beats", [])

        # Fallback: if structure analysis failed, create one big section
        if not sections:
            logger.warning("No song structure detected, using single section fallback")
            from app.services.beat_analyzer import analyze_beats
            beat_grid = await asyncio.to_thread(analyze_beats, str(input_path))
            bpm = beat_grid.bpm
            downbeats = beat_grid.downbeats
            beats = beat_grid.beats
            # Estimate duration from the audio file
            import librosa
            duration = float(await asyncio.to_thread(librosa.get_duration, path=str(input_path)))
            sections = [{"start": 0.0, "end": duration, "label": "full"}]

        # Derive time signature from beats/downbeats
        time_signature = 4
        if len(downbeats) >= 2 and len(beats) >= 2:
            beats_per_bar = []
            for i in range(len(downbeats) - 1):
                count = sum(1 for b in beats if downbeats[i] <= b < downbeats[i + 1])
                beats_per_bar.append(count)
            if beats_per_bar:
                import numpy as np
                time_signature = int(np.median(beats_per_bar))

        # 2. Chop each stem using song sections
        loops_by_stem: dict[str, list] = {}
        for stem_name, stem_path in stems.items():
            loops = await asyncio.to_thread(
                chop_stem,
                stem_path=stem_path,
                sections=sections,
                output_dir=str(job_dir),
                stem_name=stem_name,
                downbeats=downbeats,
            )
            loops_by_stem[stem_name] = loops

        # 3. Categorize and auto-select (2 per category per section)
        categorized = categorize_loops(loops_by_stem)
        all_tracks = auto_select(categorized)

        song_name = Path(file.filename).stem.replace("_", " ").replace("-", " ").title()
        for track in all_tracks:
            track["url"] = f"/clips/{job_id}/{track['file']}"

        # Filter sections to only include non-trivial ones in response
        response_sections = [
            {"label": s["label"], "start": s["start"], "end": s["end"]}
            for s in sections
            if s.get("label") not in ("start", "end")
        ]

        return {
            "job_id": job_id,
            "name": song_name,
            "bpm": bpm,
            "time_signature": time_signature,
            "sections": response_sections,
            "total_loops": len(all_tracks),
            "tracks": all_tracks,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Processing failed for job %s", job_id)
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, "Processing failed — please try again or use a different file")
