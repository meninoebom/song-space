"""Shared test setup.

Sets the environment BEFORE importing the app, since app.config.Settings reads
REPLICATE_API_TOKEN and PROCESS_API_KEY at import time and would otherwise fail.
"""

import os

os.environ.setdefault("REPLICATE_API_TOKEN", "test-token")
os.environ.setdefault("PROCESS_API_KEY", "test-key")

import pytest
from fastapi.testclient import TestClient

API_KEY = os.environ["PROCESS_API_KEY"]


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)
