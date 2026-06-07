"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowUp,
  MessageCircle,
  AlertCircle,
  List,
  RotateCcw,
  BookmarkPlus,
  Target,
  Check,
  ExternalLink,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { LessonMap } from "./LessonMap";
import { NeuronMascot, type MascotMood } from "./NeuronMascot";
import {
  fetchConceptDetail,
  pinNote,
  pinQuiz,
  streamTutor,
  triggerNoteRefresh,
} from "@/lib/api";
import { cleanTutorText, hasLessonComplete } from "@/lib/text";
import type { ChatTurn, Citation, ConceptContext, ConceptMessage } from "@/lib/types";

// A lesson is a deck of pages. Each page = one tutor "beat" plus any Q&A
// asked while on it.
interface PageData {
  id: string;
  beat: { content: string; citations?: Citation[] };
  qa: ChatTurn[]; // alternating user / tutor
}

export function ConceptView({ conceptId }: { conceptId: string }) {
  const [context, setContext] = useState<ConceptContext | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [current, setCurrent] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingKind, setStreamingKind] = useState<"beat" | "qa" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [needsRevisit, setNeedsRevisit] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const router = useRouter();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const accRef = useRef("");
  const citesRef = useRef<Citation[]>([]);
  const idRef = useRef(0);
  const startedRef = useRef(false);
  const streamPageRef = useRef(0);

  const nextId = () => `m-${idRef.current++}`;
  const lastIndex = pages.length - 1;
  const onLatest = current === lastIndex;

  const activeSlide = () =>
    trackRef.current?.children[current] as HTMLElement | undefined;

  // Reset each page to its top when you flip to it.
  useEffect(() => {
    const s = activeSlide();
    if (s) s.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Auto-grow composer
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [draft]);

  useEffect(() => {
    if (askOpen) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [askOpen]);

  const buildPages = (messages: ConceptMessage[]): PageData[] => {
    const out: PageData[] = [];
    for (const m of messages) {
      if (m.kind === "beat" && m.role === "tutor") {
        out.push({
          id: nextId(),
          beat: { content: m.content, citations: m.citations },
          qa: [],
        });
      } else {
        if (out.length === 0)
          out.push({ id: nextId(), beat: { content: "" }, qa: [] });
        out[out.length - 1].qa.push({
          id: nextId(),
          role: m.role,
          content: m.content,
          citations: m.citations,
        });
      }
    }
    return out;
  };

  const handlers = (kind: "beat" | "qa") => ({
    onDelta: (t: string) => {
      accRef.current += t;
      setStreamingText(accRef.current);
      setStatus(null);
    },
    onStatus: (t: string) => setStatus(t),
    onCitations: (items: Citation[]) => {
      citesRef.current = items;
    },
    onError: (m: string) => setStreamError(m),
    onDone: () => {
      const raw = accRef.current;
      const text = raw.trim();
      const cites = citesRef.current.length ? citesRef.current : undefined;
      if (text) {
        const i = streamPageRef.current;
        setPages((prev) => {
          const cp = [...prev];
          if (!cp[i]) return cp;
          if (kind === "beat") {
            cp[i] = { ...cp[i], beat: { content: text, citations: cites } };
          } else {
            cp[i] = {
              ...cp[i],
              qa: [
                ...cp[i].qa,
                { id: nextId(), role: "tutor", content: text, citations: cites },
              ],
            };
          }
          return cp;
        });
      }
      if (hasLessonComplete(raw)) setLessonComplete(true);
      accRef.current = "";
      citesRef.current = [];
      setStreamingText("");
      setStatus(null);
      setStreamingKind(null);
      setIsStreaming(false);
    },
  });

  // Stream a new lesson beat onto a fresh page (opening / continue / remediate).
  // baseLen is the index the new page will occupy — passed explicitly so it never
  // reads stale `pages` state (the source of the remediation page-index bug).
  const beginBeat = (path: string, baseLen: number) => {
    streamPageRef.current = baseLen;
    setStreamError(null);
    setStatus(null);
    accRef.current = "";
    citesRef.current = [];
    setStreamingText("");
    setStreamingKind("beat");
    setIsStreaming(true);
    setPages((prev) => [...prev, { id: nextId(), beat: { content: "" }, qa: [] }]);
    setCurrent(baseLen);
    void streamTutor(path, undefined, handlers("beat"));
  };

  // Load the lesson; build the deck; open or remediate as needed.
  useEffect(() => {
    let active = true;
    // Reset per-concept guards + UI — Next reuses this instance across concept navigations.
    startedRef.current = false;
    setContext(null);
    setPages([]);
    setLessonComplete(false);
    setNeedsRevisit(false);
    setAskOpen(false);
    fetchConceptDetail(conceptId)
      .then((detail) => {
        if (!active) return;
        setContext(detail.context);
        const built = buildPages(detail.messages);
        setPages(built);
        setLessonComplete(detail.lessonComplete);
        setNeedsRevisit(detail.needsRevisit);
        // Land on the page named in ?page (lesson-map deep link), else the latest.
        const pageParam = parseInt(
          new URLSearchParams(window.location.search).get("page") ?? "",
          10
        );
        const initial =
          Number.isInteger(pageParam) && pageParam >= 0 && pageParam < built.length
            ? pageParam
            : Math.max(0, built.length - 1);
        setCurrent(initial);
        if (built.length === 0 && !startedRef.current) {
          startedRef.current = true;
          beginBeat(`/concept/${conceptId}/start`, 0);
        }
      })
      .catch((e) => active && setLoadError(String(e?.message ?? e)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId]);

  const continueLesson = () => {
    if (isStreaming) return;
    setAskOpen(false);
    beginBeat(`/concept/${conceptId}/continue`, pages.length);
  };

  // Failed the quiz: relearn what was missed with the tutor, then re-quiz.
  const startRevisit = () => {
    if (isStreaming) return;
    setAskOpen(false);
    setNeedsRevisit(false);
    beginBeat(`/concept/${conceptId}/remediate`, pages.length);
  };

  // Lesson-map jump: same concept flips the deck; another concept navigates.
  const jump = (cid: string, page: number) => {
    setMapOpen(false);
    if (cid === conceptId) {
      if (!isStreaming) setCurrent(Math.min(page, pages.length - 1));
    } else {
      router.push(`/concept/${cid}?page=${page}`);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || isStreaming || !onLatest) return;
    const idx = current;
    streamPageRef.current = idx;
    setPages((prev) => {
      const cp = [...prev];
      if (cp[idx])
        cp[idx] = {
          ...cp[idx],
          qa: [...cp[idx].qa, { id: nextId(), role: "user", content: text }],
        };
      return cp;
    });
    setDraft("");
    setStreamError(null);
    setStatus(null);
    accRef.current = "";
    citesRef.current = [];
    setStreamingText("");
    setStreamingKind("qa");
    setIsStreaming(true);
    requestAnimationFrame(() =>
      activeSlide()?.scrollTo({ top: activeSlide()!.scrollHeight, behavior: "smooth" })
    );
    void streamTutor(`/concept/${conceptId}/message`, { content: text }, handlers("qa"));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const goTo = (i: number) => {
    if (i >= 0 && i <= lastIndex && !isStreaming) {
      setAskOpen(false);
      setCurrent(i);
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="label-caps" style={{ color: "var(--color-incorrect)" }}>
          Couldn&rsquo;t load this concept
        </p>
        <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          {loadError}
        </p>
        <Link href="/" className="text-[0.875rem]" style={{ color: "var(--color-accent)" }}>
          Back to Today
        </Link>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }

  const mascotMood: MascotMood = isStreaming
    ? "thinking"
    : lessonComplete && needsRevisit
    ? "sad"
    : lessonComplete
    ? "happy"
    : "idle";

  return (
    <div className="flex h-dvh flex-col">
      {/* Mascot — sits in the open left gutter beside the lesson, lower-middle, on wide screens */}
      <div className="pointer-events-none fixed bottom-[19%] left-[16%] z-30 hidden xl:block 2xl:left-[20%]">
        <NeuronMascot mood={mascotMood} size={92} />
      </div>

      {/* Header */}
      <header
        className="border-b"
        style={{
          background: "color-mix(in oklch, var(--color-surface) 88%, transparent)",
          backdropFilter: "saturate(140%) blur(12px)",
          WebkitBackdropFilter: "saturate(140%) blur(12px)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3">
          <Link
            href="/"
            aria-label="Back to Today"
            onClick={() => {
              if (pages.length > 0) triggerNoteRefresh(conceptId);
            }}
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-md"
            style={{ color: "var(--color-muted)" }}
          >
            <ChevronLeft size={20} strokeWidth={1.9} />
          </Link>
          <div className="flex min-w-0 flex-col">
            <span className="label-caps" style={{ color: "var(--color-faint)" }}>
              Day {context.dayNumber} · {context.indexInDay} of {context.totalInDay}
            </span>
            <span
              className="truncate text-[0.9375rem] font-medium tracking-[-0.005em]"
              style={{ color: "var(--color-ink)" }}
            >
              {context.conceptTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            aria-label="Lesson map"
            className="ml-auto flex h-8 items-center gap-1.5 rounded-pill px-3 transition-colors hover:bg-[var(--color-surface-sunken)]"
            style={{ border: "1px solid var(--color-line)", color: "var(--color-muted)" }}
          >
            <List size={15} strokeWidth={2} />
            <span className="text-[0.8125rem] font-medium">Map</span>
          </button>
        </div>
      </header>

      {mapOpen && (
        <LessonMap
          conceptId={conceptId}
          currentPage={current}
          onJump={jump}
          onClose={() => setMapOpen(false)}
        />
      )}

      {/* Carousel viewport */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="flex h-full"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transition: "transform 360ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {pages.map((page, i) => {
            const streamingBeat =
              isStreaming && streamingKind === "beat" && i === streamPageRef.current;
            const streamingQa =
              isStreaming && streamingKind === "qa" && i === streamPageRef.current;
            const beatContent = streamingBeat ? streamingText : page.beat.content;
            return (
              <div key={page.id} className="h-full w-full shrink-0 overflow-y-auto">
                <div className="mx-auto w-full max-w-2xl px-5 pb-10 pt-7">
                  {/* Beat */}
                  <div className="flex flex-col gap-2">
                    <span className="label-caps" style={{ color: "var(--color-accent)" }}>
                      Tutor
                    </span>
                    {streamingBeat && !beatContent ? (
                      <span className="text-[0.875rem]" style={{ color: "var(--color-muted)" }}>
                        {status ?? "Thinking…"}
                      </span>
                    ) : (
                      <Markdown source={cleanTutorText(beatContent)} streaming={streamingBeat} />
                    )}
                    <Sources items={page.beat.citations} />
                  </div>

                  {/* Q&A attached to this page */}
                  {(page.qa.length > 0 || streamingQa) && (
                    <div
                      className="mt-8 flex flex-col gap-6 border-t pt-6"
                      style={{ borderColor: "var(--color-line)" }}
                    >
                      {page.qa.map((turn) =>
                        turn.role === "user" ? (
                          <UserTurn key={turn.id} content={turn.content} />
                        ) : (
                          <QaTutorTurn
                            key={turn.id}
                            conceptId={conceptId}
                            content={turn.content}
                            citations={turn.citations}
                          />
                        )
                      )}
                      {streamingQa && (
                        <div className="flex flex-col gap-2">
                          <span className="label-caps" style={{ color: "var(--color-accent)" }}>
                            Tutor
                          </span>
                          {!streamingText ? (
                            <span
                              className="text-[0.875rem]"
                              style={{ color: "var(--color-muted)" }}
                            >
                              {status ?? "Thinking…"}
                            </span>
                          ) : (
                            <Markdown source={cleanTutorText(streamingText)} streaming />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {streamError && i === streamPageRef.current && (
                    <div
                      className="mt-5 flex items-start gap-2.5 rounded-[12px] p-3.5"
                      style={{
                        background: "color-mix(in oklch, var(--color-incorrect) 7%, transparent)",
                        border:
                          "1px solid color-mix(in oklch, var(--color-incorrect) 30%, transparent)",
                      }}
                    >
                      <AlertCircle
                        size={16}
                        strokeWidth={2}
                        style={{ color: "var(--color-incorrect)", marginTop: "1px" }}
                      />
                      <span className="text-[0.8125rem]" style={{ color: "var(--color-ink)" }}>
                        {streamError}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom controls */}
      <div
        className="border-t"
        style={{
          background: "color-mix(in oklch, var(--color-surface) 92%, transparent)",
          backdropFilter: "saturate(140%) blur(12px)",
          WebkitBackdropFilter: "saturate(140%) blur(12px)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-3">
          {/* Nav + progress */}
          {pages.length > 1 && (
            <div className="mb-3 flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Previous"
                onClick={() => goTo(current - 1)}
                disabled={current === 0 || isStreaming}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-25"
                style={{ color: "var(--color-muted)" }}
              >
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-1.5">
                {pages.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`Page ${i + 1}`}
                    onClick={() => goTo(i)}
                    disabled={isStreaming}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === current ? "18px" : "6px",
                      background:
                        i === current ? "var(--color-accent)" : "var(--color-line-strong)",
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next"
                onClick={() => goTo(current + 1)}
                disabled={current === lastIndex || isStreaming}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-25"
                style={{ color: "var(--color-muted)" }}
              >
                <ChevronRight size={18} strokeWidth={2} />
              </button>
            </div>
          )}

          {/* Primary action — only on the latest page */}
          {onLatest ? (
            isStreaming ? null : askOpen ? (
              <AskComposer
                textareaRef={textareaRef}
                draft={draft}
                setDraft={setDraft}
                onKeyDown={onKeyDown}
                send={send}
                close={() => setAskOpen(false)}
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {lessonComplete && needsRevisit ? (
                  <button type="button" onClick={startRevisit} className="group flex w-full items-center justify-center gap-1.5 rounded-[12px] px-5 py-3.5 transition-all" style={ctaStyle}>
                    <RotateCcw size={16} strokeWidth={2.2} />
                    Revisit with tutor
                  </button>
                ) : lessonComplete ? (
                  <Link href={`/quiz/${conceptId}`} className="group flex w-full items-center justify-center gap-1.5 rounded-[12px] px-5 py-3.5 transition-all" style={ctaStyle}>
                    Start quiz
                    <ArrowRight size={17} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <button type="button" onClick={continueLesson} className="group flex w-full items-center justify-center gap-1.5 rounded-[12px] px-5 py-3.5 transition-all" style={ctaStyle}>
                    Continue lesson
                    <ArrowRight size={17} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
                {lessonComplete && needsRevisit && (
                  <p className="text-center text-[0.8125rem]" style={{ color: "var(--color-muted)" }}>
                    Last quiz needs work — let&rsquo;s solidify it, then try again.
                  </p>
                )}
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setAskOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[0.8125rem] font-medium transition-colors hover:bg-[var(--color-surface-sunken)]"
                    style={{ border: "1px solid var(--color-line)", color: "var(--color-muted)" }}
                  >
                    <MessageCircle size={14} strokeWidth={1.9} />
                    Ask the tutor
                  </button>
                  {(!lessonComplete || needsRevisit) && (
                    <Link
                      href={`/quiz/${conceptId}`}
                      className="text-[0.8125rem]"
                      style={{ color: "var(--color-faint)" }}
                    >
                      {needsRevisit ? "Retake the quiz" : "Skip ahead and quiz me"}
                    </Link>
                  )}
                </div>
              </div>
            )
          ) : (
            <button
              type="button"
              onClick={() => goTo(lastIndex)}
              disabled={isStreaming}
              className="flex w-full items-center justify-center gap-1.5 rounded-[12px] px-5 py-3 text-[0.875rem] font-medium transition-colors"
              style={{ border: "1px solid var(--color-line)", color: "var(--color-muted)" }}
            >
              Jump to the latest
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ctaStyle: React.CSSProperties = {
  background: "var(--color-accent)",
  color: "var(--color-accent-ink)",
  fontSize: "0.9375rem",
  fontWeight: 600,
  transitionDuration: "var(--duration-base)",
  transitionTimingFunction: "var(--ease-out-quart)",
};

function AskComposer({
  textareaRef,
  draft,
  setDraft,
  onKeyDown,
  send,
  close,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  send: () => void;
  close: () => void;
}) {
  return (
    <>
      <div className="composer flex flex-col gap-1.5 rounded-[18px] px-4 pt-3 pb-2.5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask the tutor about this…"
          className="w-full resize-none bg-transparent outline-none"
          style={{
            color: "var(--color-ink)",
            fontSize: "var(--text-base)",
            lineHeight: "var(--leading-normal)",
            maxHeight: "160px",
          }}
        />
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-35"
            style={{
              background: draft.trim() ? "var(--color-accent)" : "var(--color-surface-sunken)",
              color: draft.trim() ? "var(--color-accent-ink)" : "var(--color-faint)",
            }}
          >
            <ArrowUp size={17} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="mt-2.5 flex justify-center">
        <button
          type="button"
          onClick={close}
          className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[0.8125rem] font-medium transition-colors hover:bg-[var(--color-surface-sunken)]"
          style={{ border: "1px solid var(--color-line)", color: "var(--color-muted)" }}
        >
          <ChevronLeft size={14} strokeWidth={2} />
          Close chat &amp; continue lesson
        </button>
      </div>
    </>
  );
}

function QaTutorTurn({
  conceptId,
  content,
  citations,
}: {
  conceptId: string;
  content: string;
  citations?: Citation[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps" style={{ color: "var(--color-accent)" }}>
        Tutor
      </span>
      <Markdown source={cleanTutorText(content)} />
      <Sources items={citations} />
      <PinActions conceptId={conceptId} content={cleanTutorText(content)} />
    </div>
  );
}

type PinState = "idle" | "saving" | "done";

// Per-answer actions: ask the librarian to save this as a note now, or flag it to be
// tested in the next quiz. Both are on top of the automatic background processing.
function PinActions({ conceptId, content }: { conceptId: string; content: string }) {
  const [note, setNote] = useState<PinState>("idle");
  const [noteRef, setNoteRef] = useState<{ id: string; title: string } | null>(null);
  const [quiz, setQuiz] = useState<PinState>("idle");

  const doNote = async () => {
    if (note !== "idle") return;
    setNote("saving");
    try {
      const res = await pinNote(conceptId, content);
      setNoteRef(res.note);
      setNote("done");
    } catch {
      setNote("idle");
    }
  };
  const doQuiz = async () => {
    if (quiz !== "idle") return;
    setQuiz("saving");
    try {
      await pinQuiz(conceptId, content);
      setQuiz("done");
    } catch {
      setQuiz("idle");
    }
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <PinButton
        state={note}
        onClick={doNote}
        idleIcon={<BookmarkPlus size={13} strokeWidth={1.9} />}
        idleLabel="Add to notes"
        savingLabel="Saving…"
        doneLabel="Added to notes"
      />
      {noteRef && (
        <Link
          href={`/notes/${noteRef.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[0.75rem] font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--color-accent)" }}
        >
          View note
          <ExternalLink size={12} strokeWidth={2} />
        </Link>
      )}
      <PinButton
        state={quiz}
        onClick={doQuiz}
        idleIcon={<Target size={13} strokeWidth={1.9} />}
        idleLabel="Quiz me on this"
        savingLabel="Saving…"
        doneLabel="Will quiz you"
      />
    </div>
  );
}

function PinButton({
  state,
  onClick,
  idleIcon,
  idleLabel,
  savingLabel,
  doneLabel,
}: {
  state: PinState;
  onClick: () => void;
  idleIcon: React.ReactNode;
  idleLabel: string;
  savingLabel: string;
  doneLabel: string;
}) {
  const done = state === "done";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== "idle"}
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[0.75rem] font-medium transition-colors disabled:cursor-default"
      style={{
        border: "1px solid var(--color-line)",
        background: done ? "var(--color-accent-tint)" : "transparent",
        color: done ? "var(--color-accent)" : "var(--color-muted)",
      }}
    >
      {state === "saving" ? (
        <span className="spinner" style={{ width: 12, height: 12 }} aria-hidden />
      ) : done ? (
        <Check size={13} strokeWidth={2.4} />
      ) : (
        idleIcon
      )}
      {state === "saving" ? savingLabel : done ? doneLabel : idleLabel}
    </button>
  );
}

function UserTurn({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-[14px] px-4 py-2.5"
        style={{
          background: "var(--color-surface-sunken)",
          border: "1px solid var(--color-line)",
          color: "var(--color-ink)",
          fontSize: "var(--text-base)",
          lineHeight: "var(--leading-normal)",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Sources({ items }: { items?: Citation[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div
      className="mt-1 flex flex-col gap-2 border-t pt-3"
      style={{ borderColor: "var(--color-line)" }}
    >
      <span className="label-caps" style={{ color: "var(--color-faint)" }}>
        Sources
      </span>
      <ol className="flex flex-col gap-1.5">
        {items.map((c, i) => (
          <li key={c.url} className="flex gap-2 text-[0.8125rem] leading-snug">
            <span className="tabular-nums pt-px" style={{ color: "var(--color-faint)" }}>
              {i + 1}
            </span>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex flex-wrap items-baseline gap-x-1.5 underline-offset-2 hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              <span>{c.title}</span>
              <span style={{ color: "var(--color-faint)" }}>{hostOf(c.url)}</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
