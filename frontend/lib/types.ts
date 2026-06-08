/*
  Domain types for the neuroscience study app.
  Concepts are syllabus bullets, keyed by stable IDs.
  Mastery state is volatile (in real app: SQLite); knowledge content is in markdown.
*/

export type MasteryLevel = "untouched" | "weak" | "partial" | "strong" | "easy";

export interface SyllabusConcept {
  id: string;
  title: string;
  dayId: string;
}

export interface SyllabusDay {
  id: string;
  number: number;
  title: string;
  weekNumber: number;
  weekTitle: string;
  concepts: SyllabusConcept[];
}

export interface ConceptMastery {
  conceptId: string;
  level: MasteryLevel;
  intervalDays: number;
  dueAt: string | null; // ISO; null when not scheduled
  lastReviewedAt: string | null;
  totalAttempts: number;
  totalCorrect: number;
}

export interface ReviewCardSummary {
  conceptId: string;
  conceptTitle: string;
  level: MasteryLevel;
  overdue: boolean;
}

export interface ProgressState {
  currentDayId: string;
  currentConceptId: string | null; // null = no concept in progress; pick next from syllabus
  daysCompleted: number;
  daysTotal: number;
  conceptsMastered: number;
  conceptsTotal: number;
  currentDayNumber: number;
  currentDayConceptsDone: number;
  currentDayConceptsTotal: number;
  streakDays: number; // shown subtly if at all
}

export type ChatRole = "tutor" | "user";

export interface Citation {
  url: string;
  title: string;
}

export interface ChatTurn {
  id: string;
  role: ChatRole;
  content: string;
  citations?: Citation[];
}

export interface ConceptContext {
  conceptId: string;
  conceptTitle: string;
  dayNumber: number;
  dayTitle: string;
  indexInDay: number;
  totalInDay: number;
}

export interface ConceptMessage {
  role: ChatRole;
  content: string;
  kind: "beat" | "qa";
  citations?: Citation[];
}

export interface ConceptDetail {
  context: ConceptContext;
  messages: ConceptMessage[];
  lessonComplete: boolean;
  lastQuizPassed: boolean | null;
  needsRevisit: boolean;
}

export interface DayMapBeat {
  page: number;
  label: string;
}

export interface DayMapConcept {
  id: string;
  title: string;
  indexInDay: number;
  current: boolean;
  started: boolean;
  lessonComplete: boolean;
  lastQuizPassed: boolean | null;
  qaCount: number;
  beats: DayMapBeat[];
}

export interface DayMap {
  dayNumber: number;
  dayTitle: string;
  concepts: DayMapConcept[];
}

export interface NoteRef {
  id: string;
  title: string;
}

export interface NoteListItem {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  linkCount: number;
}

export interface ConceptTopic {
  title: string;
  description: string;
  notes: NoteRef[];
}

export interface GraphNode {
  id: string;
  title: string;
  links: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EvergreenNote {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  links: NoteRef[];
  citations: Citation[];
}

export interface ReviewScheduleItem {
  conceptId: string;
  conceptTitle: string;
  level: MasteryLevel;
  dueAt: string;
}

export interface ReviewSchedule {
  due: ReviewScheduleItem[];
  upcoming: ReviewScheduleItem[];
}

export interface Proposal {
  id: number;
  kind: "refine" | "merge";
  reason: string;
  // refine
  targetId?: string | null;
  targetTitle?: string | null;
  currentBody?: string | null;
  proposedBody?: string | null;
  // merge
  targetTitles: string[];
  intoTitle?: string | null;
  mergedBody?: string | null;
}

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  label: string;
  interaction: "choice" | "true-false" | "text";
  prompt: string;
  options: QuizOption[];
  correctOptionId?: string | null;
  requireExplanation?: boolean;
  modelAnswer?: string | null;
  explanation: string;
}

export interface QuizGen {
  quizId: number;
  conceptId: string;
  conceptTitle: string;
  dayNumber: number;
  questions: QuizQuestion[];
}

export interface AnswerInput {
  questionId: string;
  choice?: string;
  text?: string;
  outcome?: "correct" | "incorrect";
}

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

export interface QuestionResult {
  questionId: string;
  outcome: "correct" | "incorrect";
  feedback: string;
}

export interface QuizSubmitResult {
  score: number;
  total: number;
  level: string;
  intervalDays: number;
  passed: boolean;
  conceptTitle: string;
  dayNumber: number;
  dayComplete: boolean;
  nextConceptId: string | null;
  nextConceptTitle: string | null;
  results: QuestionResult[];
}

export interface QuizAttempt {
  id: number;
  conceptId: string;
  conceptTitle: string;
  score: number;
  total: number;
  level: string;
  takenAt: string;
}

export interface NextConcept {
  id: string;
  title: string;
  dayNumber: number;
  dayTitle: string;
  indexInDay: number;
  totalInDay: number;
}

export interface TodayState {
  userName: string;
  progress: ProgressState;
  reviewsDue: ReviewCardSummary[];
  resumeConceptId: string | null;
  nextConcept: NextConcept | null; // null only when the whole course is complete
  nextReviewAt: string | null;
  reviewsUpcoming: number;
  pendingProposals: number;
}
