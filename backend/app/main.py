"""Neuro study app — FastAPI backend.

M0: read endpoints that power the Today and Syllabus screens from the DB.
The browser calls this directly (CORS open to the Next.js app on :3001).
"""

import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .db import get_conn, init_db
from .prompts import (
    CONTINUE_KICKOFF,
    LESSON_COMPLETE_MARKER,
    OPENING_KICKOFF,
    REMEDIATION_KICKOFF,
    TutorContext,
    concept_extractor_instructions,
    librarian_instructions,
    profile_updater_instructions,
    quiz_generation_instructions,
    quiz_grading_instructions,
    single_note_instructions,
    tutor_instructions,
)
from .seed import seed_if_empty
from .tutor import (
    extract_concepts,
    generate_quiz,
    generate_text,
    grade_text_answers,
    run_librarian,
    stream_events,
    write_single_note,
)
from .schemas import (
    ChatMessageOut,
    CitationOut,
    ConceptContextOut,
    ConceptDetailOut,
    ConceptOut,
    ConceptTopicOut,
    DayMapBeatOut,
    DayMapConceptOut,
    DayMapOut,
    MessageIn,
    NextConceptOut,
    GradeIn,
    GradeOut,
    GraphEdgeOut,
    GraphNodeOut,
    GraphOut,
    NoteDetailOut,
    NoteListItemOut,
    NoteRefOut,
    PinIn,
    PinNoteOut,
    ProcessResultOut,
    ReviewScheduleItemOut,
    ReviewScheduleOut,
    ProposalOut,
    ProgressOut,
    QuizAttemptOut,
    QuizGenOut,
    QuizOptionOut,
    QuizQuestionOut,
    QuizSubmitIn,
    QuizSubmitOut,
    QuestionResultOut,
    ReviewCardOut,
    SyllabusDayOut,
    TodayOut,
)

load_dotenv()

# Single-user app — the student's name, used in the greeting and the tutor prompt.
USER_NAME = os.getenv("USER_NAME", "Rahul")

# Prod password gate. When APP_PASSWORD is set, every request (except /health) must carry
# `Authorization: Bearer <APP_PASSWORD>`. Unset (local dev) means no auth — frictionless.
APP_PASSWORD = os.getenv("APP_PASSWORD")

# Allowed CORS origins, comma-separated, e.g. "https://neuro.vercel.app". Local defaults below.
_DEFAULT_ORIGINS = ["http://localhost:3001", "http://127.0.0.1:3001"]
FRONTEND_ORIGINS = [
    o.strip() for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()
] or _DEFAULT_ORIGINS

# A concept counts as "done" (day-completing) once its quiz reaches >= partial.
DONE_LEVELS = ("partial", "strong", "easy")
MASTERED_LEVELS = ("strong", "easy")

# Lesson length budget — bounds how many beats a concept can take so it converges
# instead of rambling. The tutor is told where it is; at MAX_BEATS the app forces a wrap-up.
TARGET_BEATS = 5
MAX_BEATS = 6


def _count_beats(messages: list[dict]) -> int:
    return sum(
        1 for m in messages
        if m["role"] == "assistant" and (m.get("kind") or "beat") == "beat"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_if_empty()
    yield


app = FastAPI(title="Neuro API", lifespan=lifespan)


class _AuthMiddleware(BaseHTTPMiddleware):
    """Bearer-password gate for prod. No-op when APP_PASSWORD is unset (local dev)."""

    async def dispatch(self, request, call_next):
        if (
            APP_PASSWORD
            and request.method != "OPTIONS"
            and request.url.path != "/health"
            and request.headers.get("authorization") != f"Bearer {APP_PASSWORD}"
        ):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return await call_next(request)


# Order matters: add auth FIRST so CORS (added last) wraps it and 401s still carry CORS headers.
app.add_middleware(_AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_origin_regex=r"http://.*:3001",  # Tailscale / LAN origins on the app port
    allow_methods=["*"],
    allow_headers=["*"],
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_days(conn) -> list[dict]:
    """Days in order, each with its ordered concepts."""
    days = [dict(r) for r in conn.execute("SELECT * FROM day ORDER BY number").fetchall()]
    concepts = [
        dict(r)
        for r in conn.execute("SELECT * FROM concept ORDER BY day_id, idx").fetchall()
    ]
    by_day: dict[str, list[dict]] = {}
    for c in concepts:
        by_day.setdefault(c["day_id"], []).append(c)
    for d in days:
        d["concepts"] = by_day.get(d["id"], [])
    return days


def _concept_context(conn, concept_id: str) -> dict | None:
    c = conn.execute("SELECT * FROM concept WHERE id = ?", (concept_id,)).fetchone()
    if not c:
        return None
    d = conn.execute("SELECT * FROM day WHERE id = ?", (c["day_id"],)).fetchone()
    siblings = conn.execute(
        "SELECT id, idx, title FROM concept WHERE day_id = ? ORDER BY idx", (c["day_id"],)
    ).fetchall()
    index_in_day = next(
        (i + 1 for i, s in enumerate(siblings) if s["id"] == concept_id), c["idx"]
    )
    return {
        "concept": dict(c),
        "day": dict(d),
        "index_in_day": index_in_day,
        "total_in_day": len(siblings),
        "day_concepts": [s["title"] for s in siblings],
    }


def _load_messages(conn, concept_id: str) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            "SELECT role, content, citations, kind FROM chat_message "
            "WHERE concept_id = ? ORDER BY id",
            (concept_id,),
        ).fetchall()
    ]


def _last_quiz_passed(conn, concept_id: str) -> bool | None:
    """True/False for the latest quiz attempt on this concept, or None if never attempted."""
    att = conn.execute(
        "SELECT score, total FROM quiz_attempt WHERE concept_id = ? ORDER BY id DESC LIMIT 1",
        (concept_id,),
    ).fetchone()
    if not att:
        return None
    return att["total"] > 0 and (att["score"] / att["total"]) >= 0.7


def _lesson_complete(messages: list[dict]) -> bool:
    return any(
        m["role"] == "assistant"
        and (m.get("kind") or "beat") == "beat"
        and LESSON_COMPLETE_MARKER in m["content"]
        for m in messages
    )


def _needs_revisit(conn, concept_id: str) -> bool:
    """Failed the latest quiz AND hasn't been taught a remediation beat since."""
    att = conn.execute(
        "SELECT score, total, taken_at FROM quiz_attempt WHERE concept_id = ? "
        "ORDER BY id DESC LIMIT 1",
        (concept_id,),
    ).fetchone()
    if not att or att["total"] == 0 or (att["score"] / att["total"]) >= 0.7:
        return False
    newer_beat = conn.execute(
        "SELECT 1 FROM chat_message WHERE concept_id = ? AND role = 'assistant' "
        "AND kind = 'beat' AND created_at > ? LIMIT 1",
        (concept_id, att["taken_at"]),
    ).fetchone()
    return newer_beat is None


def _beat_label(content: str, n: int = 80) -> str:
    """A short, human label for a beat (its first sentence), for the lesson map."""
    t = strip_citation_markers(content).replace(LESSON_COMPLETE_MARKER, "")
    t = re.sub(r"[#>*`_\[\]]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    first = re.split(r"(?<=[.?!])\s", t, maxsplit=1)[0] if t else ""
    if not first:
        return "Untitled beat"
    return first[:n].rstrip() + ("…" if len(first) > n else "")


def _insert_message(
    conn,
    concept_id: str,
    role: str,
    content: str,
    citations: list | None = None,
    kind: str = "beat",
) -> None:
    with conn:
        conn.execute(
            "INSERT INTO chat_message(concept_id, role, content, citations, kind, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (
                concept_id,
                role,
                content,
                json.dumps(citations) if citations else None,
                kind,
                _now_iso(),
            ),
        )


def _load_profile(conn) -> str:
    r = conn.execute("SELECT content FROM learner_profile WHERE id = 1").fetchone()
    return r["content"] if r else ""


def _save_profile(conn, content: str) -> None:
    with conn:
        conn.execute(
            "INSERT INTO learner_profile(id, content, updated_at) VALUES (1, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at",
            (content, _now_iso()),
        )


def _build_memory_digest(conn) -> str:
    """A compact 'what we know about the learner' digest injected into every tutor turn."""
    profile = _load_profile(conn).strip()
    note_titles = [
        r["title"]
        for r in conn.execute(
            "SELECT title FROM note ORDER BY updated_at DESC LIMIT 80"
        ).fetchall()
    ]
    rows = conn.execute(
        "SELECT m.level, c.title FROM concept_mastery m JOIN concept c ON c.id = m.concept_id"
    ).fetchall()
    shaky = [r["title"] for r in rows if r["level"] in ("weak", "partial")]
    solid = sum(1 for r in rows if r["level"] in ("strong", "easy"))

    parts = ["Learner profile:\n" + (profile or "(still being built)")]
    parts.append(
        "Concepts he has notes on so far: "
        + ("; ".join(note_titles) if note_titles else "(none yet)")
    )
    mastery = f"{solid} concept(s) solid."
    if shaky:
        mastery += " Currently shaky (prioritize and connect to these): " + "; ".join(shaky) + "."
    parts.append("Mastery: " + mastery)
    return "\n\n".join(parts)


def _build_tutor_context(conn, cx: dict) -> TutorContext:
    total_days = conn.execute("SELECT COUNT(*) AS n FROM day").fetchone()["n"]
    # Latest quiz result for this concept, so the tutor is aware of mastery state.
    last_score = last_total = None
    last_passed = None
    missed: list[str] = []
    att = conn.execute(
        "SELECT score, total, missed FROM quiz_attempt WHERE concept_id = ? "
        "ORDER BY id DESC LIMIT 1",
        (cx["concept"]["id"],),
    ).fetchone()
    if att:
        last_score, last_total = att["score"], att["total"]
        last_passed = last_total > 0 and (last_score / last_total) >= 0.7
        if att["missed"]:
            try:
                missed = json.loads(att["missed"])
            except json.JSONDecodeError:
                missed = []
    return TutorContext(
        user_name=USER_NAME,
        day_number=cx["day"]["number"],
        day_title=cx["day"]["title"],
        week_title=cx["day"]["week_title"],
        total_days=total_days,
        concept_title=cx["concept"]["title"],
        index_in_day=cx["index_in_day"],
        total_in_day=cx["total_in_day"],
        day_concepts=cx["day_concepts"],
        last_score=last_score,
        last_total=last_total,
        last_passed=last_passed,
        missed=missed,
        memory=_build_memory_digest(conn),
    )


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


# OpenAI web-search citations arrive wrapped in private-use-area delimiters
# (U+E200 … U+E201). Strip them so stored/served text is clean.
_CITE_GROUP = re.compile("[\\s\\S]*?")
_CITE_TRAILING = re.compile("[\\s\\S]*$")
_PUA = re.compile("[-]")


def strip_citation_markers(text: str) -> str:
    text = _CITE_GROUP.sub("", text)
    text = _CITE_TRAILING.sub("", text)
    return _PUA.sub("", text)


# Consumes the tutor event stream, frames it as SSE, and persists the assembled
# assistant turn at the end. Opens its own DB connection (runs lazily during streaming).
def _event_stream(
    concept_id: str, instructions: str, input_messages: list[dict], kind: str = "beat"
):
    parts: list[str] = []
    citations: list[dict] = []
    errored = False
    for ev in stream_events(instructions, input_messages):
        if ev["type"] == "delta":
            parts.append(ev["text"])
        elif ev["type"] == "citations":
            citations = ev["items"]
        elif ev["type"] == "error":
            errored = True
        yield _sse(ev)
    text = strip_citation_markers("".join(parts)).strip()
    if text and not errored:
        conn = get_conn()
        try:
            _insert_message(conn, concept_id, "assistant", text, citations, kind)
        finally:
            conn.close()
    yield _sse({"type": "done"})


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/syllabus", response_model=list[SyllabusDayOut])
def syllabus():
    conn = get_conn()
    try:
        days = _load_days(conn)
    finally:
        conn.close()
    return [
        SyllabusDayOut(
            id=d["id"],
            number=d["number"],
            title=d["title"],
            weekNumber=d["week_number"],
            weekTitle=d["week_title"],
            concepts=[
                ConceptOut(id=c["id"], title=c["title"], dayId=c["day_id"])
                for c in d["concepts"]
            ],
        )
        for d in days
    ]


@app.get("/today", response_model=TodayOut)
def today():
    conn = get_conn()
    try:
        days = _load_days(conn)
        mastery = {
            r["concept_id"]: dict(r)
            for r in conn.execute("SELECT * FROM concept_mastery").fetchall()
        }
        streak = _compute_streak(conn)
    finally:
        conn.close()

    all_concepts = [c for d in days for c in d["concepts"]]
    concepts_total = len(all_concepts)
    concepts_mastered = sum(
        1 for c in all_concepts if mastery.get(c["id"], {}).get("level") in MASTERED_LEVELS
    )

    def concept_done(cid: str) -> bool:
        return mastery.get(cid, {}).get("level") in DONE_LEVELS

    def day_done(d: dict) -> bool:
        return bool(d["concepts"]) and all(concept_done(c["id"]) for c in d["concepts"])

    days_completed = sum(1 for d in days if day_done(d))

    next_concept = None
    current_day_id = None
    for d in days:
        for c in d["concepts"]:
            if not concept_done(c["id"]):
                next_concept = NextConceptOut(
                    id=c["id"],
                    title=c["title"],
                    dayNumber=d["number"],
                    dayTitle=d["title"],
                    indexInDay=c["idx"],
                    totalInDay=len(d["concepts"]),
                )
                current_day_id = d["id"]
                break
        if next_concept:
            break

    now = _now_iso()
    # Any concept that has been quizzed and whose review date has arrived — at ANY mastery
    # level. Mastered (strong/easy) concepts SHOULD resurface; that is the whole point.
    due_concepts = [
        (c, mastery[c["id"]])
        for c in all_concepts
        if mastery.get(c["id"], {}).get("due_at")
        and mastery[c["id"]]["level"] != "untouched"
        and mastery[c["id"]]["due_at"] <= now
    ]
    due_concepts.sort(key=lambda cm: cm[1]["due_at"])  # most overdue first
    reviews = [
        ReviewCardOut(
            conceptId=c["id"],
            conceptTitle=c["title"],
            level=m["level"],
            overdue=m["due_at"] < now,
        )
        for c, m in due_concepts
    ]

    # Upcoming (scheduled but not yet due) — drives the home "next review" indicator.
    upcoming_dates = sorted(
        mastery[c["id"]]["due_at"]
        for c in all_concepts
        if mastery.get(c["id"], {}).get("due_at")
        and mastery[c["id"]]["level"] != "untouched"
        and mastery[c["id"]]["due_at"] > now
    )
    next_review_at = upcoming_dates[0] if upcoming_dates else None

    # Progress within the day you're currently working on (for a motivating ring).
    cur_day = next((d for d in days if d["id"] == current_day_id), None)
    if cur_day:
        cur_day_number = cur_day["number"]
        cur_day_total = len(cur_day["concepts"])
        cur_day_done = sum(1 for c in cur_day["concepts"] if concept_done(c["id"]))
    else:  # course complete
        cur_day_number = len(days)
        cur_day_total = cur_day_done = 1

    progress = ProgressOut(
        currentDayId=current_day_id,
        currentConceptId=None,
        daysCompleted=days_completed,
        daysTotal=len(days),
        conceptsMastered=concepts_mastered,
        conceptsTotal=concepts_total,
        currentDayNumber=cur_day_number,
        currentDayConceptsDone=cur_day_done,
        currentDayConceptsTotal=cur_day_total,
        streakDays=streak,
    )

    return TodayOut(
        userName=USER_NAME,
        progress=progress,
        reviewsDue=reviews,
        resumeConceptId=None,
        nextConcept=next_concept,
        nextReviewAt=next_review_at,
        reviewsUpcoming=len(upcoming_dates),
    )


@app.get("/reviews", response_model=ReviewScheduleOut)
def reviews():
    """Full spaced-repetition schedule: what's due now and what's coming up, with dates."""
    conn = get_conn()
    try:
        days = _load_days(conn)
        mastery = {
            r["concept_id"]: dict(r)
            for r in conn.execute("SELECT * FROM concept_mastery").fetchall()
        }
    finally:
        conn.close()
    now = _now_iso()
    items = []
    for c in (c for d in days for c in d["concepts"]):
        m = mastery.get(c["id"])
        if not m or not m.get("due_at") or m["level"] == "untouched":
            continue
        items.append((c, m))
    items.sort(key=lambda cm: cm[1]["due_at"])

    def _item(c, m):
        return ReviewScheduleItemOut(
            conceptId=c["id"], conceptTitle=c["title"], level=m["level"], dueAt=m["due_at"]
        )

    return ReviewScheduleOut(
        due=[_item(c, m) for c, m in items if m["due_at"] <= now],
        upcoming=[_item(c, m) for c, m in items if m["due_at"] > now],
    )


@app.get("/concept/{concept_id}", response_model=ConceptDetailOut)
def concept_detail(concept_id: str):
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        msgs = _load_messages(conn, concept_id)
        last_passed = _last_quiz_passed(conn, concept_id)
        needs_revisit = _needs_revisit(conn, concept_id)
    finally:
        conn.close()
    return ConceptDetailOut(
        lessonComplete=_lesson_complete(msgs),
        lastQuizPassed=last_passed,
        needsRevisit=needs_revisit,
        context=ConceptContextOut(
            conceptId=cx["concept"]["id"],
            conceptTitle=cx["concept"]["title"],
            dayNumber=cx["day"]["number"],
            dayTitle=cx["day"]["title"],
            indexInDay=cx["index_in_day"],
            totalInDay=cx["total_in_day"],
        ),
        messages=[
            ChatMessageOut(
                role="tutor" if m["role"] == "assistant" else "user",
                content=m["content"],
                kind=m.get("kind") or "beat",
                citations=[
                    CitationOut(**c) for c in json.loads(m["citations"])
                ]
                if m.get("citations")
                else [],
            )
            for m in msgs
        ],
    )


@app.post("/concept/{concept_id}/start")
def start_lesson(concept_id: str):
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        already_started = bool(_load_messages(conn, concept_id))
        ctx = _build_tutor_context(conn, cx)
    finally:
        conn.close()

    if already_started:
        def noop():
            yield _sse({"type": "done"})

        return StreamingResponse(noop(), media_type="text/event-stream", headers=_SSE_HEADERS)

    instructions = tutor_instructions(
        ctx, opening=True, beat_number=1, target_beats=TARGET_BEATS, max_beats=MAX_BEATS
    )
    input_messages = [{"role": "user", "content": OPENING_KICKOFF}]
    return StreamingResponse(
        _event_stream(concept_id, instructions, input_messages),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.post("/concept/{concept_id}/message")
def post_message(concept_id: str, body: MessageIn):
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "empty message")
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        _insert_message(conn, concept_id, "user", content, kind="qa")
        history = _load_messages(conn, concept_id)  # includes the new user turn
        ctx = _build_tutor_context(conn, cx)
    finally:
        conn.close()

    instructions = tutor_instructions(ctx, opening=False)
    input_messages = [{"role": m["role"], "content": m["content"]} for m in history]
    return StreamingResponse(
        _event_stream(concept_id, instructions, input_messages, kind="qa"),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.post("/concept/{concept_id}/continue")
def continue_lesson(concept_id: str):
    """Advance the guided lesson by one beat (hidden 'continue' kickoff, not stored)."""
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        history = _load_messages(conn, concept_id)
        ctx = _build_tutor_context(conn, cx)
    finally:
        conn.close()

    next_beat = _count_beats(history) + 1
    force_final = next_beat >= MAX_BEATS
    instructions = tutor_instructions(
        ctx,
        beat_number=next_beat,
        target_beats=TARGET_BEATS,
        max_beats=MAX_BEATS,
        force_final=force_final,
    )
    input_messages = [{"role": m["role"], "content": m["content"]} for m in history]
    input_messages.append({"role": "user", "content": CONTINUE_KICKOFF})
    return StreamingResponse(
        _event_stream(concept_id, instructions, input_messages),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.post("/concept/{concept_id}/remediate")
def remediate(concept_id: str):
    """Open a remediation turn after a failed quiz (tutor briefed on what was missed)."""
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        history = _load_messages(conn, concept_id)
        ctx = _build_tutor_context(conn, cx)
    finally:
        conn.close()

    # Only truly remediate if the latest quiz was a fail; otherwise just continue.
    do_remediate = ctx.last_passed is False
    instructions = tutor_instructions(ctx, remediation=do_remediate)
    kickoff = REMEDIATION_KICKOFF if do_remediate else CONTINUE_KICKOFF
    input_messages = [{"role": m["role"], "content": m["content"]} for m in history]
    input_messages.append({"role": "user", "content": kickoff})
    return StreamingResponse(
        _event_stream(concept_id, instructions, input_messages),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.get("/day-map/{concept_id}", response_model=DayMapOut)
def day_map(concept_id: str):
    """The whole day as a navigable map: each concept and its beats (for the lesson drawer)."""
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        day = cx["day"]
        sibs = conn.execute(
            "SELECT id, idx, title FROM concept WHERE day_id = ? ORDER BY idx", (day["id"],)
        ).fetchall()
        out_concepts = []
        for i, s in enumerate(sibs):
            msgs = _load_messages(conn, s["id"])
            beats = [
                m for m in msgs
                if m["role"] == "assistant" and (m.get("kind") or "beat") == "beat"
            ]
            qa_count = sum(
                1 for m in msgs if m.get("kind") == "qa" and m["role"] == "user"
            )
            out_concepts.append(
                DayMapConceptOut(
                    id=s["id"],
                    title=s["title"],
                    indexInDay=i + 1,
                    current=s["id"] == concept_id,
                    started=bool(msgs),
                    lessonComplete=_lesson_complete(msgs),
                    lastQuizPassed=_last_quiz_passed(conn, s["id"]),
                    qaCount=qa_count,
                    beats=[
                        DayMapBeatOut(page=bi, label=_beat_label(b["content"]))
                        for bi, b in enumerate(beats)
                    ],
                )
            )
    finally:
        conn.close()
    return DayMapOut(
        dayNumber=day["number"], dayTitle=day["title"], concepts=out_concepts
    )


# ---------- Notes (evergreen, librarian-built) ----------

def _slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower().strip()).strip("-")
    return s or "note"


def _snippet(body: str, n: int = 150) -> str:
    text = re.sub(r"[#>*`_]", " ", body)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:n] + ("…" if len(text) > n else "")


def _list_note_rows(conn) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            "SELECT id, title, body, updated_at FROM note ORDER BY updated_at DESC"
        ).fetchall()
    ]


def _get_note_row(conn, note_id: str) -> dict | None:
    r = conn.execute(
        "SELECT id, title, body, citations, updated_at FROM note WHERE id = ?", (note_id,)
    ).fetchone()
    return dict(r) if r else None


def _merge_citations(existing_json: str | None, new_list: list) -> list[dict]:
    """Union of existing note citations and new ones, deduped by URL, order preserved."""
    out: list[dict] = []
    seen: set[str] = set()
    base = json.loads(existing_json) if existing_json else []
    for src in base + (new_list or []):
        url = src.get("url")
        if url and url not in seen:
            seen.add(url)
            out.append({"url": url, "title": src.get("title") or url})
    return out


def _note_id_by_title(conn, title: str) -> str | None:
    if not title:
        return None
    r = conn.execute(
        "SELECT id FROM note WHERE lower(title) = lower(?)", (title,)
    ).fetchone()
    if r:
        return r["id"]
    r = conn.execute("SELECT id FROM note WHERE id = ?", (_slugify(title),)).fetchone()
    return r["id"] if r else None


def _unique_slug(conn, base: str) -> str:
    slug, i = base, 2
    while conn.execute("SELECT 1 FROM note WHERE id = ?", (slug,)).fetchone():
        slug, i = f"{base}-{i}", i + 1
    return slug


def _note_links(conn, note_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT n.id, n.title FROM note_link l JOIN note n ON n.id = l.to_id WHERE l.from_id = ? "
        "UNION SELECT n.id, n.title FROM note_link l JOIN note n ON n.id = l.from_id WHERE l.to_id = ?",
        (note_id, note_id),
    ).fetchall()
    return [dict(r) for r in rows]


@app.post("/concept/{concept_id}/pin-note", response_model=PinNoteOut)
def pin_note(concept_id: str, body: PinIn):
    """Learner flagged a tutor answer: write it up as an evergreen note right now."""
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "empty content")
    conn = get_conn()
    try:
        if not _concept_context(conn, concept_id):
            raise HTTPException(404, "concept not found")
        existing = [r["title"] for r in _list_note_rows(conn)]
    finally:
        conn.close()

    ask = (
        "A passage from the tutoring conversation that the learner flagged as important. "
        "REFERENCE ONLY; do not continue any conversation.\n\n"
        f"=== PASSAGE ===\n{content}\n=== END PASSAGE ===\n\n"
        "Now output ONLY the note JSON."
    )
    note = write_single_note(single_note_instructions(USER_NAME, existing), [{"role": "user", "content": ask}])
    if not note:
        raise HTTPException(502, "Couldn't write the note — please try again.")

    title, body_md, links = note["title"], note["body"], note["links"]
    new_cites = [{"url": c.url, "title": c.title} for c in body.citations]
    now = _now_iso()
    conn = get_conn()
    try:
        with conn:
            nid = _note_id_by_title(conn, title)
            if nid:
                existing = conn.execute(
                    "SELECT citations FROM note WHERE id = ?", (nid,)
                ).fetchone()
                merged = _merge_citations(existing["citations"] if existing else None, new_cites)
                conn.execute(
                    "UPDATE note SET body = ?, citations = ?, updated_at = ? WHERE id = ?",
                    (body_md, json.dumps(merged) if merged else None, now, nid),
                )
            else:
                nid = _unique_slug(conn, _slugify(title))
                conn.execute(
                    "INSERT INTO note(id, title, body, citations, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?)",
                    (nid, title, body_md, json.dumps(new_cites) if new_cites else None, now, now),
                )
            conn.execute(
                "INSERT OR IGNORE INTO note_source(note_id, lesson_concept_id, created_at) VALUES (?,?,?)",
                (nid, concept_id, now),
            )
            for lt in links:
                tid = _note_id_by_title(conn, lt)
                if tid and tid != nid:
                    conn.execute(
                        "INSERT OR IGNORE INTO note_link(from_id, to_id, relation) VALUES (?,?,NULL)",
                        (nid, tid),
                    )
            conn.execute(
                "INSERT INTO user_pin(concept_id, kind, content, note_id, created_at) VALUES (?,?,?,?,?)",
                (concept_id, "note", content, nid, now),
            )
    finally:
        conn.close()
    return PinNoteOut(note=NoteRefOut(id=nid, title=title))


@app.post("/concept/{concept_id}/pin-quiz")
def pin_quiz(concept_id: str, body: PinIn):
    """Learner flagged a tutor answer to be tested: store it as a must-cover quiz point."""
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "empty content")
    conn = get_conn()
    try:
        if not _concept_context(conn, concept_id):
            raise HTTPException(404, "concept not found")
        with conn:
            conn.execute(
                "INSERT INTO user_pin(concept_id, kind, content, created_at) VALUES (?,?,?,?)",
                (concept_id, "quiz", content, _now_iso()),
            )
    finally:
        conn.close()
    return {"ok": True}


@app.post("/concept/{concept_id}/notes/process", response_model=ProcessResultOut)
def process_notes(concept_id: str):
    """Run the librarian over this concept's conversation: create/link auto, refine/merge proposed."""
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        msgs = _load_messages(conn, concept_id)
        if not msgs:
            raise HTTPException(400, "no conversation to take notes from yet")
        existing = _list_note_rows(conn)
        ctx = _build_tutor_context(conn, cx)
    finally:
        conn.close()

    instructions = librarian_instructions(ctx, existing)
    # Pass the conversation as a REFERENCE TRANSCRIPT, not a live dialogue — otherwise the
    # model "continues" the lesson instead of producing the operations JSON.
    transcript = "\n\n".join(
        f"{'TUTOR' if m['role'] == 'assistant' else 'STUDENT'}: {m['content']}" for m in msgs
    )
    librarian_ask = (
        "Below is a tutoring conversation, for REFERENCE ONLY. Do NOT continue it. Extract and "
        "maintain the evergreen notes per your instructions.\n\n"
        f"=== CONVERSATION ===\n{transcript}\n=== END CONVERSATION ===\n\n"
        "Now output ONLY the operations JSON."
    )
    result = run_librarian(instructions, [{"role": "user", "content": librarian_ask}])
    if result is None:
        raise HTTPException(503, "Librarian unavailable (missing OPENAI_API_KEY?)")
    ops = result.get("operations", [])

    created: list[str] = []
    linked = 0
    proposals = 0
    pending_links: list[tuple] = []

    conn = get_conn()
    try:
        with conn:
            now = _now_iso()
            for op in ops:
                kind = op.get("op")
                if kind == "create":
                    title = (op.get("title") or "").strip()
                    body = strip_citation_markers(op.get("body") or "").strip()
                    if not title or not body:
                        continue
                    existing_id = _note_id_by_title(conn, title)
                    if existing_id:
                        # Concept already exists: propose a refine rather than overwrite.
                        conn.execute(
                            "INSERT INTO note_proposal(kind, payload, status, created_at) "
                            "VALUES ('refine', ?, 'pending', ?)",
                            (
                                json.dumps({
                                    "target_id": existing_id,
                                    "target_title": title,
                                    "body": body,
                                    "reason": "New material for an existing note",
                                }),
                                now,
                            ),
                        )
                        proposals += 1
                    else:
                        slug = _unique_slug(conn, _slugify(title))
                        conn.execute(
                            "INSERT INTO note(id, title, body, created_at, updated_at) VALUES (?,?,?,?,?)",
                            (slug, title, body, now, now),
                        )
                        conn.execute(
                            "INSERT OR IGNORE INTO note_source(note_id, lesson_concept_id, created_at) VALUES (?,?,?)",
                            (slug, concept_id, now),
                        )
                        created.append(title)
                    for lk in op.get("links") or []:
                        pending_links.append((title, lk, None))
                elif kind == "link":
                    pending_links.append((op.get("from"), op.get("to"), op.get("relation")))
                elif kind == "refine":
                    tgt = op.get("target")
                    tid = _note_id_by_title(conn, tgt) if tgt else None
                    body = strip_citation_markers(op.get("body") or "").strip()
                    if tid and body:
                        conn.execute(
                            "INSERT INTO note_proposal(kind, payload, status, created_at) "
                            "VALUES ('refine', ?, 'pending', ?)",
                            (
                                json.dumps({
                                    "target_id": tid,
                                    "target_title": tgt,
                                    "body": body,
                                    "reason": op.get("reason", ""),
                                }),
                                now,
                            ),
                        )
                        proposals += 1
                elif kind == "merge":
                    targets = op.get("targets") or []
                    tids = [t for t in (_note_id_by_title(conn, x) for x in targets) if t]
                    body = strip_citation_markers(op.get("body") or "").strip()
                    if len(tids) >= 2 and body:
                        conn.execute(
                            "INSERT INTO note_proposal(kind, payload, status, created_at) "
                            "VALUES ('merge', ?, 'pending', ?)",
                            (
                                json.dumps({
                                    "target_ids": tids,
                                    "target_titles": targets,
                                    "into_title": op.get("into_title") or targets[0],
                                    "body": body,
                                    "reason": op.get("reason", ""),
                                }),
                                now,
                            ),
                        )
                        proposals += 1

            # Pass 2: resolve links (titles -> ids; only between notes that exist now).
            for a, b, rel in pending_links:
                ida, idb = _note_id_by_title(conn, a), _note_id_by_title(conn, b)
                if ida and idb and ida != idb:
                    cur = conn.execute(
                        "INSERT OR IGNORE INTO note_link(from_id, to_id, relation) VALUES (?,?,?)",
                        (ida, idb, rel),
                    )
                    if cur.rowcount > 0:
                        linked += 1
    finally:
        conn.close()

    # Roll all notes up into high-level concept topics (the "lay of the land").
    conn = get_conn()
    try:
        all_notes = [
            dict(r) for r in conn.execute("SELECT id, title, body FROM note").fetchall()
        ]
    finally:
        conn.close()
    if all_notes:
        notes_block = "\n\n".join(
            f'- "{n["title"]}": {n["body"][:300]}' for n in all_notes
        )
        ask = (
            "Here are the notes, for REFERENCE ONLY. Do NOT continue any conversation. "
            "Roll them up into concepts.\n\n"
            f"=== NOTES ===\n{notes_block}\n=== END ===\n\n"
            "Now output ONLY the concepts JSON."
        )
        concepts = extract_concepts(
            concept_extractor_instructions(USER_NAME), [{"role": "user", "content": ask}]
        )
        if concepts:
            title_to_id = {n["title"].lower(): n["id"] for n in all_notes}
            conn = get_conn()
            try:
                with conn:
                    conn.execute("DELETE FROM concept_topic")
                    now2 = _now_iso()
                    for i, c in enumerate(concepts):
                        title = (c.get("title") or "").strip()
                        if not title:
                            continue
                        nids = [
                            title_to_id[t.lower()]
                            for t in (c.get("notes") or [])
                            if t.lower() in title_to_id
                        ]
                        conn.execute(
                            "INSERT INTO concept_topic(title, description, note_ids, ord, updated_at) "
                            "VALUES (?,?,?,?,?)",
                            (title, (c.get("description") or "").strip(), json.dumps(nids), i, now2),
                        )
            finally:
                conn.close()

    # Evolve the learner profile from this lesson + the latest quiz result.
    conn = get_conn()
    try:
        profile = _load_profile(conn)
        att = conn.execute(
            "SELECT score, total, missed FROM quiz_attempt WHERE concept_id = ? "
            "ORDER BY id DESC LIMIT 1",
            (concept_id,),
        ).fetchone()
    finally:
        conn.close()
    transcript = "\n\n".join(
        f"{'TUTOR' if m['role'] == 'assistant' else 'STUDENT'}: {m['content']}" for m in msgs
    )
    quiz_note = ""
    if att:
        miss = json.loads(att["missed"]) if att["missed"] else []
        quiz_note = (
            f"\n\nQuiz result on this concept: {att['score']}/{att['total']}. "
            f"Missed: {('; '.join(miss)) or 'none'}."
        )
    upd_input = [
        {
            "role": "user",
            "content": (
                f"Concept just covered: {cx['concept']['title']}.\n\n"
                f"=== LESSON CONVERSATION ===\n{transcript}\n=== END ==={quiz_note}"
            ),
        }
    ]
    updated = generate_text(profile_updater_instructions(USER_NAME, profile), upd_input)
    if updated and updated.strip():
        conn = get_conn()
        try:
            _save_profile(conn, strip_citation_markers(updated).strip())
        finally:
            conn.close()

    return ProcessResultOut(created=created, linked=linked, proposals=proposals)


@app.get("/notes", response_model=list[NoteListItemOut])
def list_notes():
    conn = get_conn()
    try:
        rows = _list_note_rows(conn)
        out = []
        for r in rows:
            lc = conn.execute(
                "SELECT COUNT(*) AS n FROM note_link WHERE from_id = ? OR to_id = ?",
                (r["id"], r["id"]),
            ).fetchone()["n"]
            out.append(
                NoteListItemOut(
                    id=r["id"],
                    title=r["title"],
                    snippet=_snippet(r["body"]),
                    updatedAt=r["updated_at"],
                    linkCount=lc,
                )
            )
    finally:
        conn.close()
    return out


@app.get("/graph", response_model=GraphOut)
def graph():
    conn = get_conn()
    try:
        notes = [dict(r) for r in conn.execute("SELECT id, title FROM note").fetchall()]
        edges = [
            dict(r)
            for r in conn.execute("SELECT from_id, to_id FROM note_link").fetchall()
        ]
    finally:
        conn.close()
    counts: dict[str, int] = {}
    for e in edges:
        counts[e["from_id"]] = counts.get(e["from_id"], 0) + 1
        counts[e["to_id"]] = counts.get(e["to_id"], 0) + 1
    return GraphOut(
        nodes=[
            GraphNodeOut(id=n["id"], title=n["title"], links=counts.get(n["id"], 0))
            for n in notes
        ],
        edges=[GraphEdgeOut(source=e["from_id"], target=e["to_id"]) for e in edges],
    )


@app.get("/concepts", response_model=list[ConceptTopicOut])
def list_concepts():
    conn = get_conn()
    try:
        topics = [
            dict(r)
            for r in conn.execute(
                "SELECT title, description, note_ids FROM concept_topic ORDER BY ord"
            ).fetchall()
        ]
        note_titles = {
            r["id"]: r["title"] for r in conn.execute("SELECT id, title FROM note").fetchall()
        }
    finally:
        conn.close()
    out = []
    for t in topics:
        nids = json.loads(t["note_ids"]) if t["note_ids"] else []
        refs = [NoteRefOut(id=i, title=note_titles[i]) for i in nids if i in note_titles]
        out.append(
            ConceptTopicOut(title=t["title"], description=t["description"], notes=refs)
        )
    return out


@app.get("/note/{note_id}", response_model=NoteDetailOut)
def get_note(note_id: str):
    conn = get_conn()
    try:
        r = _get_note_row(conn, note_id)
        if not r:
            raise HTTPException(404, "note not found")
        links = _note_links(conn, note_id)
    finally:
        conn.close()
    cites = json.loads(r["citations"]) if r.get("citations") else []
    return NoteDetailOut(
        id=r["id"],
        title=r["title"],
        body=r["body"],
        updatedAt=r["updated_at"],
        links=[NoteRefOut(**lk) for lk in links],
        citations=[CitationOut(**c) for c in cites],
    )


@app.get("/proposals", response_model=list[ProposalOut])
def list_proposals():
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, kind, payload FROM note_proposal WHERE status = 'pending' ORDER BY id DESC"
        ).fetchall()
        notes = {r["id"]: dict(r) for r in conn.execute("SELECT id, title, body FROM note").fetchall()}
    finally:
        conn.close()
    out = []
    for r in rows:
        p = json.loads(r["payload"])
        if r["kind"] == "refine":
            cur = notes.get(p.get("target_id"), {})
            out.append(
                ProposalOut(
                    id=r["id"],
                    kind="refine",
                    reason=p.get("reason", ""),
                    targetId=p.get("target_id"),
                    targetTitle=p.get("target_title") or cur.get("title"),
                    currentBody=cur.get("body"),
                    proposedBody=p.get("body"),
                )
            )
        else:
            out.append(
                ProposalOut(
                    id=r["id"],
                    kind="merge",
                    reason=p.get("reason", ""),
                    targetTitles=p.get("target_titles", []),
                    intoTitle=p.get("into_title"),
                    mergedBody=p.get("body"),
                )
            )
    return out


@app.post("/proposals/{pid}/accept")
def accept_proposal(pid: int):
    conn = get_conn()
    try:
        r = conn.execute(
            "SELECT kind, payload, status FROM note_proposal WHERE id = ?", (pid,)
        ).fetchone()
        if not r:
            raise HTTPException(404, "proposal not found")
        if r["status"] != "pending":
            return {"ok": True}
        p = json.loads(r["payload"])
        now = _now_iso()
        with conn:
            if r["kind"] == "refine":
                conn.execute(
                    "UPDATE note SET body = ?, updated_at = ? WHERE id = ?",
                    (p["body"], now, p["target_id"]),
                )
            elif r["kind"] == "merge":
                tids = p["target_ids"]
                canonical = tids[0]
                conn.execute(
                    "UPDATE note SET title = ?, body = ?, updated_at = ? WHERE id = ?",
                    (p["into_title"], p["body"], now, canonical),
                )
                for other in tids[1:]:
                    conn.execute(
                        "DELETE FROM note_link WHERE from_id = ? OR to_id = ?", (other, other)
                    )
                    conn.execute("DELETE FROM note_source WHERE note_id = ?", (other,))
                    conn.execute("DELETE FROM note WHERE id = ?", (other,))
            conn.execute("UPDATE note_proposal SET status = 'accepted' WHERE id = ?", (pid,))
    finally:
        conn.close()
    return {"ok": True}


@app.post("/proposals/{pid}/reject")
def reject_proposal(pid: int):
    conn = get_conn()
    try:
        with conn:
            conn.execute("UPDATE note_proposal SET status = 'rejected' WHERE id = ?", (pid,))
    finally:
        conn.close()
    return {"ok": True}


# ---------- Quiz + SRS ----------

# Expanding review ladder (days). Each consecutive pass moves one rung further out, so
# well-known concepts come back less and less often. A perfect score skips a rung.
_SRS_LADDER = [1, 3, 7, 16, 35, 75, 150]


def _compute_streak(conn) -> int:
    """Consecutive days (UTC) with at least one quiz attempt, ending today or yesterday."""
    rows = conn.execute("SELECT taken_at FROM quiz_attempt").fetchall()
    active: set = set()
    for r in rows:
        try:
            active.add(datetime.fromisoformat(r["taken_at"]).date())
        except (ValueError, TypeError):
            pass
    if not active:
        return 0
    today_d = datetime.now(timezone.utc).date()
    start = today_d if today_d in active else today_d - timedelta(days=1)
    if start not in active:
        return 0
    streak = 0
    cur = start
    while cur in active:
        streak += 1
        cur -= timedelta(days=1)
    return streak


def _quiz_difficulty(conn, limit: int = 6) -> str:
    """Scale quiz difficulty to the learner's recent quiz performance overall."""
    rows = conn.execute(
        "SELECT score, total FROM quiz_attempt ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    ratios = [r["score"] / r["total"] for r in rows if r["total"]]
    if not ratios:
        return "standard"
    avg = sum(ratios) / len(ratios)
    if avg >= 0.85:
        return "hard"
    if avg >= 0.6:
        return "standard"
    return "supportive"


def _next_srs(
    prev_level: str | None, prev_reps: int, score: int, total: int
) -> tuple[str, int, int]:
    """Return (level, interval_days, reps) using an expanding-interval schedule.

    level is the displayed mastery; reps is the count of consecutive passes that drives
    how far out the next review lands. A fail resets reps to 0 (back to 1 day).
    """
    pct = (score / total) if total else 0.0
    perfect = bool(total) and score == total
    passed = pct >= 0.7

    if perfect:
        level = "easy" if prev_level in ("strong", "easy") else "strong"
    elif passed:
        level = "partial"
    else:
        level = "weak"

    if not passed:
        return level, _SRS_LADDER[0], 0
    # Pass advances one rung; a perfect score advances two (graduates faster).
    reps = (prev_reps or 0) + (2 if perfect else 1)
    interval = _SRS_LADDER[min(reps - 1, len(_SRS_LADDER) - 1)]
    return level, interval, reps


_ANTI_LENGTH_TELL = (
    "\n\nREDO — IMPORTANT: in your previous attempt the correct answer was the LONGEST option in "
    "most questions, which is a dead giveaway. Rewrite the ENTIRE quiz so that in EVERY "
    "multiple-choice question all four options are similar in length, and at least one DISTRACTOR "
    "is as long as or longer than the correct answer. The correct option must never be the longest."
)


def _correct_is_longest_fraction(questions: list) -> float:
    """Fraction of MC questions where the correct option is the single longest — the 'tell'."""
    mc = [q for q in questions if q.get("interaction") == "choice" and q.get("options")]
    if not mc:
        return 0.0
    tells = 0
    for q in mc:
        opts = q["options"]
        correct = next((o for o in opts if o.get("id") == q.get("correctOptionId")), None)
        if not correct:
            continue
        clen = len(correct.get("label", ""))
        others = [len(o.get("label", "")) for o in opts if o.get("id") != correct.get("id")]
        if others and clen > max(others):
            tells += 1
    return tells / len(mc)


@app.post("/concept/{concept_id}/quiz", response_model=QuizGenOut)
def make_quiz(concept_id: str, review: bool = False):
    conn = get_conn()
    try:
        cx = _concept_context(conn, concept_id)
        if not cx:
            raise HTTPException(404, "concept not found")
        msgs = _load_messages(conn, concept_id)
        ctx = _build_tutor_context(conn, cx)
        focus = [
            r["content"]
            for r in conn.execute(
                "SELECT content FROM user_pin WHERE concept_id = ? AND kind = 'quiz' ORDER BY id",
                (concept_id,),
            ).fetchall()
        ]
        difficulty = _quiz_difficulty(conn)
    finally:
        conn.close()

    instructions = quiz_generation_instructions(
        ctx,
        focus_points=focus or None,
        difficulty=difficulty,
        count=5,
        review=review,
    )
    # Pass the conversation as a REFERENCE TRANSCRIPT in one message, not as a live
    # dialogue — otherwise the model "continues" the lesson instead of writing the quiz.
    if msgs:
        transcript = "\n\n".join(
            f"{'TUTOR' if m['role'] == 'assistant' else 'STUDENT'}: {m['content']}"
            for m in msgs
        )
        ask = (
            "Below is the tutoring conversation for this concept, for REFERENCE ONLY "
            "(what was taught). Do NOT continue the conversation.\n\n"
            f"=== CONVERSATION ===\n{transcript}\n=== END CONVERSATION ===\n\n"
            "Now output ONLY the quiz JSON in the exact shape specified."
        )
    else:
        ask = (
            f"Write the quiz for the concept: {cx['concept']['title']}. "
            "Output ONLY the quiz JSON in the exact shape specified."
        )
    questions = generate_quiz(instructions, [{"role": "user", "content": ask}])
    if questions is None:
        raise HTTPException(503, "Quiz generation unavailable (missing OPENAI_API_KEY?)")
    if not questions:
        raise HTTPException(502, "Quiz generation failed — please try again.")

    # Safety net: if the correct answer is the longest option in half+ of the MC questions
    # (a guessable 'tell'), regenerate once with a stronger instruction.
    if _correct_is_longest_fraction(questions) >= 0.5:
        retry = generate_quiz(
            instructions + _ANTI_LENGTH_TELL, [{"role": "user", "content": ask}]
        )
        if retry:
            questions = retry

    norm = []
    for i, q in enumerate(questions):
        norm.append({
            "id": f"q{i + 1}",
            "label": q.get("label", "Question"),
            "interaction": q.get("interaction", "choice"),
            "prompt": strip_citation_markers(q.get("prompt", "")).strip(),
            "options": q.get("options", []) or [],
            "correctOptionId": q.get("correctOptionId"),
            "requireExplanation": bool(q.get("requireExplanation")),
            "modelAnswer": q.get("modelAnswer"),
            "rubric": q.get("rubric"),
            "explanation": q.get("explanation", ""),
        })

    now = _now_iso()
    conn = get_conn()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO quiz(concept_id, questions, created_at) VALUES (?,?,?)",
                (concept_id, json.dumps(norm), now),
            )
            quiz_id = cur.lastrowid
    finally:
        conn.close()

    return QuizGenOut(
        quizId=quiz_id,
        conceptId=concept_id,
        conceptTitle=cx["concept"]["title"],
        dayNumber=cx["day"]["number"],
        questions=[
            QuizQuestionOut(
                id=q["id"],
                label=q["label"],
                interaction=q["interaction"],
                prompt=q["prompt"],
                options=[QuizOptionOut(**o) for o in q["options"] if "id" in o and "label" in o],
                correctOptionId=q["correctOptionId"],
                requireExplanation=q["requireExplanation"],
                modelAnswer=q["modelAnswer"],
                explanation=q["explanation"],
            )
            for q in norm
        ],
    )


@app.post("/quiz/{quiz_id}/grade", response_model=GradeOut)
def grade_text_question(quiz_id: int, body: GradeIn):
    """Grade a single free-text answer immediately (for per-question feedback)."""
    conn = get_conn()
    try:
        row = conn.execute("SELECT questions FROM quiz WHERE id = ?", (quiz_id,)).fetchone()
        if not row:
            raise HTTPException(404, "quiz not found")
        questions = json.loads(row["questions"])
    finally:
        conn.close()

    q = next((x for x in questions if x["id"] == body.questionId), None)
    if not q or q.get("interaction") != "text":
        raise HTTPException(400, "not a text question")

    item = {
        "id": q["id"],
        "question": q["prompt"],
        "rubric": q.get("rubric") or q.get("modelAnswer") or "",
        "model_answer": q.get("modelAnswer") or "",
        "answer": body.answer or "",
    }
    grades = grade_text_answers(
        quiz_grading_instructions(USER_NAME), json.dumps({"items": [item]})
    )
    g = grades.get(q["id"], {"correct": False, "feedback": ""})
    return GradeOut(correct=bool(g["correct"]), feedback=g.get("feedback", ""))


@app.post("/quiz/{quiz_id}/submit", response_model=QuizSubmitOut)
def submit_quiz(quiz_id: int, body: QuizSubmitIn):
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT concept_id, questions FROM quiz WHERE id = ?", (quiz_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "quiz not found")
        concept_id = row["concept_id"]
        questions = json.loads(row["questions"])
        prev = conn.execute(
            "SELECT level, reps FROM concept_mastery WHERE concept_id = ?", (concept_id,)
        ).fetchone()
        prev_level = prev["level"] if prev else None
        prev_reps = prev["reps"] if prev else 0
    finally:
        conn.close()

    answers = {a.questionId: a for a in body.answers}
    results: dict[str, dict] = {}
    text_items = []
    for q in questions:
        qid = q["id"]
        a = answers.get(qid)
        if q["interaction"] == "text":
            # Prefer the per-question grade the client already got; else grade in batch.
            if a and a.outcome in ("correct", "incorrect"):
                results[qid] = {"outcome": a.outcome, "feedback": ""}
            else:
                text_items.append({
                    "id": qid,
                    "question": q["prompt"],
                    "rubric": q.get("rubric") or q.get("modelAnswer") or "",
                    "model_answer": q.get("modelAnswer") or "",
                    "answer": (a.text if a else "") or "",
                })
        else:
            chosen = a.choice if a else None
            correct = chosen is not None and chosen == q.get("correctOptionId")
            results[qid] = {
                "outcome": "correct" if correct else "incorrect",
                "feedback": q.get("explanation", ""),
            }

    if text_items:
        grades = grade_text_answers(
            quiz_grading_instructions(USER_NAME), json.dumps({"items": text_items})
        )
        for it in text_items:
            g = grades.get(it["id"], {"correct": False, "feedback": ""})
            results[it["id"]] = {
                "outcome": "correct" if g["correct"] else "incorrect",
                "feedback": g.get("feedback", ""),
            }

    total = len(questions)
    score = sum(1 for r in results.values() if r["outcome"] == "correct")
    missed_prompts = [
        q["prompt"]
        for q in questions
        if results.get(q["id"], {}).get("outcome") == "incorrect"
    ]
    level, interval, reps = _next_srs(prev_level, prev_reps, score, total)
    passed = total > 0 and (score / total) >= 0.7
    now = _now_iso()
    due = (datetime.now(timezone.utc) + timedelta(days=interval)).isoformat()

    conn = get_conn()
    try:
        with conn:
            conn.execute(
                "INSERT INTO concept_mastery(concept_id, level, interval_days, due_at, "
                "last_reviewed_at, total_attempts, total_correct, reps) VALUES (?,?,?,?,?,1,?,?) "
                "ON CONFLICT(concept_id) DO UPDATE SET level=excluded.level, "
                "interval_days=excluded.interval_days, due_at=excluded.due_at, "
                "last_reviewed_at=excluded.last_reviewed_at, "
                "total_attempts=concept_mastery.total_attempts+1, "
                "total_correct=concept_mastery.total_correct+excluded.total_correct, "
                "reps=excluded.reps",
                (concept_id, level, interval, due, now, score, reps),
            )
            conn.execute(
                "INSERT INTO quiz_attempt(quiz_id, concept_id, score, total, level, missed, taken_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (quiz_id, concept_id, score, total, level, json.dumps(missed_prompts), now),
            )
        # Recompute progress to find the next concept and whether the day is now complete.
        days = _load_days(conn)
        mastery = {
            r["concept_id"]: dict(r)
            for r in conn.execute("SELECT * FROM concept_mastery").fetchall()
        }
        cx = _concept_context(conn, concept_id)
    finally:
        conn.close()

    def _done(cid: str) -> bool:
        return mastery.get(cid, {}).get("level") in DONE_LEVELS

    next_id = next_title = None
    for d in days:
        for c in d["concepts"]:
            if not _done(c["id"]):
                next_id, next_title = c["id"], c["title"]
                break
        if next_id:
            break

    cur_day = cx["day"]
    day_concepts = [c for d in days if d["id"] == cur_day["id"] for c in d["concepts"]]
    day_complete = bool(day_concepts) and all(_done(c["id"]) for c in day_concepts)

    return QuizSubmitOut(
        score=score,
        total=total,
        level=level,
        intervalDays=interval,
        passed=passed,
        conceptTitle=cx["concept"]["title"],
        dayNumber=cur_day["number"],
        dayComplete=day_complete,
        nextConceptId=next_id,
        nextConceptTitle=next_title,
        results=[
            QuestionResultOut(questionId=qid, outcome=r["outcome"], feedback=r["feedback"])
            for qid, r in results.items()
        ],
    )


@app.get("/quiz-results", response_model=list[QuizAttemptOut])
def quiz_results():
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT a.id, a.concept_id, a.score, a.total, a.level, a.taken_at, c.title "
            "FROM quiz_attempt a JOIN concept c ON c.id = a.concept_id ORDER BY a.id DESC"
        ).fetchall()
    finally:
        conn.close()
    return [
        QuizAttemptOut(
            id=r["id"],
            conceptId=r["concept_id"],
            conceptTitle=r["title"],
            score=r["score"],
            total=r["total"],
            level=r["level"],
            takenAt=r["taken_at"],
        )
        for r in rows
    ]
