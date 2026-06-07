#!/usr/bin/env bash
# Start the Neuro backend on :8001 with reload.
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
exec uvicorn app.main:app --reload --port 8001
