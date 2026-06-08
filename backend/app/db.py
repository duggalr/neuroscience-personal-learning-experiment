"""SQLite data layer.

Stdlib sqlite3 — no ORM. The schema is small and the app is local/personal, so a
thin connection helper plus CREATE TABLE IF NOT EXISTS is all we need. SQLite is the
single source of truth for all learning state (mastery, schedule, chat, quizzes,
notes, concept graph); the curriculum is seeded once from syllabus.md.
"""

import os
import sqlite3
from pathlib import Path

# Prod sets NEURO_DB_PATH to the persistent-volume path (e.g. /data/neuro.db). Local default
# keeps the DB next to the backend package.
DB_PATH = Path(os.getenv("NEURO_DB_PATH") or Path(__file__).resolve().parent.parent / "neuro.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS day (
  id           TEXT PRIMARY KEY,
  number       INTEGER NOT NULL,
  title        TEXT NOT NULL,
  week_number  INTEGER NOT NULL,
  week_title   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS concept (
  id      TEXT PRIMARY KEY,
  day_id  TEXT NOT NULL REFERENCES day(id),
  idx     INTEGER NOT NULL,
  title   TEXT NOT NULL
);

-- Volatile learning state. A concept with no row here is 'untouched'.
CREATE TABLE IF NOT EXISTS concept_mastery (
  concept_id        TEXT PRIMARY KEY REFERENCES concept(id),
  level             TEXT NOT NULL DEFAULT 'untouched',  -- untouched|weak|partial|strong|easy
  interval_days     INTEGER,
  due_at            TEXT,   -- ISO 8601 UTC
  last_reviewed_at  TEXT,
  total_attempts    INTEGER NOT NULL DEFAULT 0,
  total_correct     INTEGER NOT NULL DEFAULT 0,
  reps              INTEGER NOT NULL DEFAULT 0  -- consecutive passes; drives expanding interval
);

-- Tutor conversation, one row per turn. role is OpenAI-native: 'user' | 'assistant'.
-- kind: 'beat' = a lesson beat (opening/continue/remediate) → a deck page;
--       'qa'   = a question/answer attached to the current beat-page.
CREATE TABLE IF NOT EXISTS chat_message (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id  TEXT NOT NULL REFERENCES concept(id),
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'beat',
  citations   TEXT,   -- JSON array of {url, title} for assistant turns w/ web search
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_concept ON chat_message(concept_id, id);

-- Evergreen concept notes (atomic, concept-oriented), built by the librarian.
CREATE TABLE IF NOT EXISTS note (
  id          TEXT PRIMARY KEY,   -- stable slug from the title
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  citations   TEXT,   -- JSON array of {url, title}: source links carried over from a pinned answer
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Associative web: directed-ish links between notes (the concept graph edges).
CREATE TABLE IF NOT EXISTS note_link (
  from_id    TEXT NOT NULL REFERENCES note(id),
  to_id      TEXT NOT NULL REFERENCES note(id),
  relation   TEXT,
  PRIMARY KEY (from_id, to_id)
);

-- Provenance: which lesson/concept conversations contributed to a note.
CREATE TABLE IF NOT EXISTS note_source (
  note_id            TEXT NOT NULL REFERENCES note(id),
  lesson_concept_id  TEXT NOT NULL REFERENCES concept(id),
  created_at         TEXT NOT NULL,
  PRIMARY KEY (note_id, lesson_concept_id)
);

-- Higher-level concept topics rolled up from the notes (the "lay of the land").
-- Regenerated wholesale each time the notes change.
CREATE TABLE IF NOT EXISTS concept_topic (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  note_ids     TEXT NOT NULL,   -- JSON array of note ids under this concept
  ord          INTEGER NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Learner-flagged content from a lesson: "add this to my notes" / "quiz me on this".
-- A 'note' pin records the note that was written from it; a 'quiz' pin is a must-cover
-- point injected into the next quiz for that concept.
CREATE TABLE IF NOT EXISTS user_pin (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id  TEXT NOT NULL REFERENCES concept(id),
  kind        TEXT NOT NULL,    -- 'note' | 'quiz'
  content     TEXT NOT NULL,    -- the flagged tutor passage
  note_id     TEXT,             -- created note (kind='note')
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pin_concept ON user_pin(concept_id, kind);

-- Evolving learner profile (singleton): what the student knows, where they struggle.
CREATE TABLE IF NOT EXISTS learner_profile (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  content     TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Pending librarian operations that touch existing notes (refine/merge), awaiting approval.
CREATE TABLE IF NOT EXISTS note_proposal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,    -- 'refine' | 'merge'
  payload     TEXT NOT NULL,    -- JSON
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at  TEXT NOT NULL
);

-- A generated quiz for a concept (tutor-authored, mixed question types).
CREATE TABLE IF NOT EXISTS quiz (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id  TEXT NOT NULL REFERENCES concept(id),
  questions   TEXT NOT NULL,    -- JSON array
  created_at  TEXT NOT NULL
);

-- A graded attempt at a quiz; drives the SRS update.
CREATE TABLE IF NOT EXISTS quiz_attempt (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id     INTEGER REFERENCES quiz(id),
  concept_id  TEXT NOT NULL REFERENCES concept(id),
  score       INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  level       TEXT NOT NULL,
  missed      TEXT,   -- JSON list of missed question prompts
  taken_at    TEXT NOT NULL
);
"""


def _premigrate(conn) -> None:
    """Drop incompatible old tables BEFORE the schema runs (CREATE IF NOT EXISTS won't replace them).

    DESTRUCTIVE — it can drop the note table. Disabled unless NEURO_ALLOW_DESTRUCTIVE=1, so a
    deploy can never silently wipe real notes. The note schema is already migrated everywhere,
    so this is a no-op in practice; the guard is a safety net for prod.
    """
    if os.getenv("NEURO_ALLOW_DESTRUCTIVE") != "1":
        return
    note_cols = {r["name"] for r in conn.execute("PRAGMA table_info(note)")}
    # Old note schema was keyed by concept_id with a 'content' column; the new one is the
    # evergreen-notes model. Old notes are disposable, so drop and rebuild.
    if "concept_id" in note_cols or "content" in note_cols:
        conn.execute("DROP TABLE IF EXISTS note")


def _migrate(conn) -> None:
    """Tiny additive migrations for already-created DBs (SQLite has no ADD COLUMN IF NOT EXISTS)."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(chat_message)")}
    if "citations" not in cols:
        conn.execute("ALTER TABLE chat_message ADD COLUMN citations TEXT")
    if "kind" not in cols:
        conn.execute("ALTER TABLE chat_message ADD COLUMN kind TEXT NOT NULL DEFAULT 'beat'")
    qa_cols = {r["name"] for r in conn.execute("PRAGMA table_info(quiz_attempt)")}
    if qa_cols and "missed" not in qa_cols:
        conn.execute("ALTER TABLE quiz_attempt ADD COLUMN missed TEXT")
    cm_cols = {r["name"] for r in conn.execute("PRAGMA table_info(concept_mastery)")}
    if cm_cols and "reps" not in cm_cols:
        # Consecutive successful reviews — drives the expanding SRS interval.
        conn.execute("ALTER TABLE concept_mastery ADD COLUMN reps INTEGER NOT NULL DEFAULT 0")
    note_cols = {r["name"] for r in conn.execute("PRAGMA table_info(note)")}
    if note_cols and "citations" not in note_cols:
        conn.execute("ALTER TABLE note ADD COLUMN citations TEXT")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_conn()
    try:
        with conn:
            _premigrate(conn)
            conn.executescript(SCHEMA)
            _migrate(conn)
    finally:
        conn.close()
