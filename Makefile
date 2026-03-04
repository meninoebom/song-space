.PHONY: dev setup

setup:
	cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt

dev:
	cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
