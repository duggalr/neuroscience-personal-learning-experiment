# Neuro backend — FastAPI + SQLite, for Fly.io.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NEURO_DB_PATH=/data/neuro.db

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code only (DB, .env, venv are excluded via .dockerignore).
COPY app ./app

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
