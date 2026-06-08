"""Pydantic response models. Field names are camelCase to match the frontend types
in lib/types.ts exactly, so the client needs no remapping."""

from pydantic import BaseModel


class ConceptOut(BaseModel):
    id: str
    title: str
    dayId: str


class SyllabusDayOut(BaseModel):
    id: str
    number: int
    title: str
    weekNumber: int
    weekTitle: str
    concepts: list[ConceptOut]


class ProgressOut(BaseModel):
    currentDayId: str | None
    currentConceptId: str | None
    daysCompleted: int
    daysTotal: int
    conceptsMastered: int
    conceptsTotal: int
    currentDayNumber: int
    currentDayConceptsDone: int
    currentDayConceptsTotal: int
    streakDays: int


class NextConceptOut(BaseModel):
    id: str
    title: str
    dayNumber: int
    dayTitle: str
    indexInDay: int
    totalInDay: int


class ReviewCardOut(BaseModel):
    conceptId: str
    conceptTitle: str
    level: str
    overdue: bool


class TodayOut(BaseModel):
    userName: str
    progress: ProgressOut
    reviewsDue: list[ReviewCardOut]
    resumeConceptId: str | None
    nextConcept: NextConceptOut | None
    nextReviewAt: str | None = None  # soonest upcoming (not-yet-due) review
    reviewsUpcoming: int = 0  # count of scheduled-but-not-yet-due concepts


class ReviewScheduleItemOut(BaseModel):
    conceptId: str
    conceptTitle: str
    level: str
    dueAt: str


class ReviewScheduleOut(BaseModel):
    due: list[ReviewScheduleItemOut]
    upcoming: list[ReviewScheduleItemOut]


class CitationOut(BaseModel):
    url: str
    title: str


class ChatMessageOut(BaseModel):
    role: str  # 'tutor' | 'user' (frontend-facing)
    content: str
    kind: str = "beat"  # 'beat' | 'qa'
    citations: list[CitationOut] = []


class ConceptContextOut(BaseModel):
    conceptId: str
    conceptTitle: str
    dayNumber: int
    dayTitle: str
    indexInDay: int
    totalInDay: int


class ConceptDetailOut(BaseModel):
    context: ConceptContextOut
    messages: list[ChatMessageOut]
    lessonComplete: bool = False
    lastQuizPassed: bool | None = None  # None = no attempt yet
    needsRevisit: bool = False  # failed last quiz, not yet remediated


class MessageIn(BaseModel):
    content: str


class NoteRefOut(BaseModel):
    id: str
    title: str


class NoteListItemOut(BaseModel):
    id: str
    title: str
    snippet: str
    updatedAt: str
    linkCount: int


class PinIn(BaseModel):
    content: str
    citations: list[CitationOut] = []


class PinNoteOut(BaseModel):
    note: NoteRefOut


class DayMapBeatOut(BaseModel):
    page: int
    label: str


class DayMapConceptOut(BaseModel):
    id: str
    title: str
    indexInDay: int
    current: bool
    started: bool
    lessonComplete: bool
    lastQuizPassed: bool | None = None
    qaCount: int = 0  # questions the learner asked the tutor in this concept
    beats: list[DayMapBeatOut] = []


class DayMapOut(BaseModel):
    dayNumber: int
    dayTitle: str
    concepts: list[DayMapConceptOut]


class ConceptTopicOut(BaseModel):
    title: str
    description: str
    notes: list[NoteRefOut]


class NoteDetailOut(BaseModel):
    id: str
    title: str
    body: str
    updatedAt: str
    links: list[NoteRefOut] = []
    citations: list[CitationOut] = []


class GraphNodeOut(BaseModel):
    id: str
    title: str
    links: int


class GraphEdgeOut(BaseModel):
    source: str
    target: str


class GraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class ProposalOut(BaseModel):
    id: int
    kind: str  # 'refine' | 'merge'
    reason: str = ""
    # refine
    targetId: str | None = None
    targetTitle: str | None = None
    currentBody: str | None = None
    proposedBody: str | None = None
    # merge
    targetTitles: list[str] = []
    intoTitle: str | None = None
    mergedBody: str | None = None


class ProcessResultOut(BaseModel):
    created: list[str] = []
    linked: int = 0
    proposals: int = 0


# ---- Quiz ----

class QuizOptionOut(BaseModel):
    id: str
    label: str


class QuizQuestionOut(BaseModel):
    id: str
    label: str
    interaction: str  # 'choice' | 'true-false' | 'text'
    prompt: str
    options: list[QuizOptionOut] = []
    correctOptionId: str | None = None
    requireExplanation: bool = False
    modelAnswer: str | None = None
    explanation: str = ""


class QuizGenOut(BaseModel):
    quizId: int
    conceptId: str
    conceptTitle: str
    dayNumber: int
    questions: list[QuizQuestionOut]


class AnswerIn(BaseModel):
    questionId: str
    choice: str | None = None
    text: str | None = None
    outcome: str | None = None  # 'correct'|'incorrect' for text (graded per-question)


class GradeIn(BaseModel):
    questionId: str
    answer: str


class GradeOut(BaseModel):
    correct: bool
    feedback: str


class QuizSubmitIn(BaseModel):
    answers: list[AnswerIn]


class QuestionResultOut(BaseModel):
    questionId: str
    outcome: str  # 'correct' | 'incorrect'
    feedback: str = ""


class QuizSubmitOut(BaseModel):
    score: int
    total: int
    level: str
    intervalDays: int
    passed: bool
    conceptTitle: str
    dayNumber: int
    dayComplete: bool
    nextConceptId: str | None = None
    nextConceptTitle: str | None = None
    results: list[QuestionResultOut]


class QuizAttemptOut(BaseModel):
    id: int
    conceptId: str
    conceptTitle: str
    score: int
    total: int
    level: str
    takenAt: str
