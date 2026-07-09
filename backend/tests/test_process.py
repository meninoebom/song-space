"""Tests for the hardened /api/process endpoint (issue #52)."""

from unittest.mock import AsyncMock, MagicMock, patch

from conftest import API_KEY

PROCESS_URL = "/api/process"


def _mock_pipeline():
    """Patch every pipeline call so no Replicate/librosa work runs.

    Returns a dict of the patched mocks so tests can assert (non-)invocation.
    Structure analysis returns real sections so the librosa fallback branch is
    skipped entirely.
    """
    analyze_structure = AsyncMock(return_value={
        "segments": [{"start": 0.0, "end": 10.0, "label": "verse"}],
        "bpm": 120.0,
        "downbeats": [0.0, 2.0, 4.0],
        "beats": [0.0, 1.0, 2.0, 3.0, 4.0, 5.0],
    })
    separate_stems = AsyncMock(return_value={"drums": "/tmp/nonexistent/drums.wav"})
    chop_stem = MagicMock(return_value=[])
    categorize_loops = MagicMock(return_value={})
    auto_select = MagicMock(return_value=[
        {"file": "a.wav", "section": "verse", "category": "groove"},
    ])

    patches = {
        "app.services.song_analyzer.analyze_structure": analyze_structure,
        "app.services.stem_separator.separate_stems": separate_stems,
        "app.services.loop_chopper.chop_stem": chop_stem,
        "app.services.categorizer.categorize_loops": categorize_loops,
        "app.services.categorizer.auto_select": auto_select,
    }
    mgrs = [patch(target, mock) for target, mock in patches.items()]
    mocks = {
        "analyze_structure": analyze_structure,
        "separate_stems": separate_stems,
        "chop_stem": chop_stem,
        "auto_select": auto_select,
    }
    return mgrs, mocks


def test_missing_api_key_returns_401(client):
    resp = client.post(PROCESS_URL, files={"file": ("song.mp3", b"data", "audio/mpeg")})
    assert resp.status_code == 401


def test_wrong_api_key_returns_401(client):
    resp = client.post(
        PROCESS_URL,
        files={"file": ("song.mp3", b"data", "audio/mpeg")},
        headers={"X-API-Key": "wrong"},
    )
    assert resp.status_code == 401


def test_bad_extension_returns_400(client):
    mgrs, mocks = _mock_pipeline()
    for m in mgrs:
        m.start()
    try:
        resp = client.post(
            PROCESS_URL,
            files={"file": ("song.txt", b"data", "text/plain")},
            headers={"X-API-Key": API_KEY},
        )
    finally:
        for m in mgrs:
            m.stop()
    assert resp.status_code == 400
    mocks["analyze_structure"].assert_not_called()


def test_oversize_content_length_returns_413(client):
    """A declared Content-Length over the limit is rejected before the pipeline."""
    mgrs, mocks = _mock_pipeline()
    for m in mgrs:
        m.start()
    try:
        big = str(200 * 1024 * 1024)  # 200MB > MAX_UPLOAD_MB (100)
        resp = client.post(
            PROCESS_URL,
            files={"file": ("song.mp3", b"data", "audio/mpeg")},
            headers={"X-API-Key": API_KEY, "Content-Length": big},
        )
    finally:
        for m in mgrs:
            m.stop()
    assert resp.status_code == 413
    mocks["analyze_structure"].assert_not_called()


def test_happy_path_enters_pipeline(client):
    mgrs, mocks = _mock_pipeline()
    for m in mgrs:
        m.start()
    try:
        resp = client.post(
            PROCESS_URL,
            files={"file": ("My Song.mp3", b"data", "audio/mpeg")},
            headers={"X-API-Key": API_KEY},
        )
    finally:
        for m in mgrs:
            m.stop()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "job_id" in body
    assert body["name"] == "My Song"
    assert body["bpm"] == 120.0
    mocks["analyze_structure"].assert_awaited_once()
    mocks["separate_stems"].assert_awaited_once()
