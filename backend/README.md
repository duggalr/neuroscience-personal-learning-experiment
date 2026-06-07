# Neuro backend

FastAPI + SQLite. Single source of truth for all learning state; curriculum is
seeded once from `../../syllabus.md`.

## Setup

```bash
cd learning_app_v3/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your OPENAI_API_KEY (used from M1)
```

## Run

```bash
./run.sh           # or: uvicorn app.main:app --reload --port 8001
```

The DB (`neuro.db`) is created and seeded on first start. Delete it to reset to Day 0.

## Endpoints (M0)

- `GET /health`
- `GET /syllabus` — 28 days with concepts
- `GET /today` — progress + next concept (Day 0 on a fresh DB)
