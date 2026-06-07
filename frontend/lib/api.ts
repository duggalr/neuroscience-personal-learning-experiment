/*
  Browser → FastAPI client. The app talks to the backend directly (option B),
  no Next.js proxy. Base URL is overridable for Tailscale/LAN access.
*/

import type {
  AnswerInput,
  Citation,
  ConceptDetail,
  ConceptTopic,
  DayMap,
  EvergreenNote,
  NoteRef,
  GradeResult,
  GraphData,
  NoteListItem,
  Proposal,
  QuizAttempt,
  QuizGen,
  QuizSubmitResult,
  SyllabusDay,
  TodayState,
} from "./types";

import { getToken, clearToken } from "./auth";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001";

// Merge the bearer token (if any) into request headers. No token locally → no header.
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { ...(extra ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// On a 401 (prod, missing/expired password), drop the token and bounce to the login page.
function handleUnauthorized(): void {
  clearToken();
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    window.location.href = "/login";
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchToday = () => getJSON<TodayState>("/today");
export const fetchSyllabus = () => getJSON<SyllabusDay[]>("/syllabus");
export const fetchConceptDetail = (id: string) =>
  getJSON<ConceptDetail>(`/concept/${id}`);
export const fetchNotes = () => getJSON<NoteListItem[]>("/notes");
export const fetchConcepts = () => getJSON<ConceptTopic[]>("/concepts");
export const fetchDayMap = (conceptId: string) =>
  getJSON<DayMap>(`/day-map/${conceptId}`);
export const fetchGraph = () => getJSON<GraphData>("/graph");
export const fetchNote = (id: string) => getJSON<EvergreenNote>(`/note/${id}`);
export const fetchProposals = () => getJSON<Proposal[]>("/proposals");

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function postOk(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
}
export const acceptProposal = (id: number) => postOk(`/proposals/${id}/accept`);
export const rejectProposal = (id: number) => postOk(`/proposals/${id}/reject`);

export const generateQuiz = (conceptId: string, review = false) =>
  postJSON<QuizGen>(`/concept/${conceptId}/quiz${review ? "?review=1" : ""}`);
export const gradeTextAnswer = (quizId: number, questionId: string, answer: string) =>
  postJSON<GradeResult>(`/quiz/${quizId}/grade`, { questionId, answer });
export const submitQuiz = (quizId: number, answers: AnswerInput[]) =>
  postJSON<QuizSubmitResult>(`/quiz/${quizId}/submit`, { answers });
export const fetchQuizResults = () => getJSON<QuizAttempt[]>("/quiz-results");

// Learner-flagged content from a lesson.
export const pinNote = (conceptId: string, content: string) =>
  postJSON<{ note: NoteRef }>(`/concept/${conceptId}/pin-note`, { content });
export const pinQuiz = (conceptId: string, content: string) =>
  postJSON<{ ok: boolean }>(`/concept/${conceptId}/pin-quiz`, { content });

// Fire-and-forget: run the librarian over a concept's conversation on leaving it.
// keepalive lets the request finish even as the page navigates away.
export function triggerNoteRefresh(conceptId: string): void {
  try {
    void fetch(`${API_BASE}/concept/${conceptId}/notes/process`, {
      method: "POST",
      headers: authHeaders(),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

export interface StreamHandlers {
  onDelta?: (text: string) => void;
  onStatus?: (text: string) => void;
  onCitations?: (items: Citation[]) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

// POST a request and consume the server's SSE stream of tutor events.
export async function streamTutor(
  path: string,
  body: unknown | undefined,
  h: StreamHandlers
): Promise<void> {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    h.onDone?.();
  };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: authHeaders(body ? { "Content-Type": "application/json" } : undefined),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      handleUnauthorized();
      h.onError?.("unauthorized");
      finish();
      return;
    }
    if (!res.ok || !res.body) {
      h.onError?.(`${path} → ${res.status}`);
      finish();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, i).trim();
        buf = buf.slice(i + 2);
        if (!frame.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(frame.slice(5).trim());
          if (ev.type === "delta") h.onDelta?.(ev.text);
          else if (ev.type === "status") h.onStatus?.(ev.text);
          else if (ev.type === "citations") h.onCitations?.(ev.items);
          else if (ev.type === "error") h.onError?.(ev.message);
          else if (ev.type === "done") finish();
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  } catch (e) {
    h.onError?.(String(e instanceof Error ? e.message : e));
  } finally {
    finish();
  }
}
