"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, X, Minus, ArrowRight } from "lucide-react";
import { Markdown } from "./Markdown";
import { submitQuiz, triggerNoteRefresh } from "@/lib/api";
import type { AnswerInput, QuizGen, QuizSubmitResult } from "@/lib/types";

type Outcome = "correct" | "incorrect";

interface Response {
  questionId: string;
  choice?: string;
  text?: string;
  outcome: Outcome;
}

// Deterministic fill-in-the-blank match, mirrored from the backend (instant feedback).
function normAns(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(
        Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0))
      );
    }
    prev = cur;
  }
  return prev[b.length];
}
function matchBlank(text: string, accept: string[]): boolean {
  const t = normAns(text);
  if (!t) return false;
  return (accept ?? []).some((raw) => {
    const na = normAns(raw);
    if (!na) return false;
    if (t === na) return true;
    const thr = na.length <= 6 ? 1 : 2;
    if (editDistance(t, na) <= thr) return true;
    const toks = na.split(" ");
    return toks.length >= 2 && toks.every((tok) => t.split(" ").includes(tok));
  });
}

const accentBtn: React.CSSProperties = {
  background: "var(--color-accent)",
  color: "var(--color-accent-ink)",
  fontSize: "0.9375rem",
  fontWeight: 600,
  letterSpacing: "0.005em",
  transitionDuration: "var(--duration-base)",
  transitionTimingFunction: "var(--ease-out-quart)",
};

function masteryDisplay(level: string, intervalDays: number) {
  const map: Record<string, [string, string]> = {
    strong: ["Strong", "var(--color-correct)"],
    easy: ["Easy", "var(--color-accent)"],
    partial: ["Partial", "var(--color-partial)"],
    weak: ["Weak", "var(--color-incorrect)"],
  };
  const [label, color] = map[level] ?? ["—", "var(--color-muted)"];
  return {
    label,
    color,
    interval: `Review in ${intervalDays} day${intervalDays > 1 ? "s" : ""}`,
  };
}

export function QuizRunner({ quiz, review = false }: { quiz: QuizGen; review?: boolean }) {
  const questions = quiz.questions;
  const total = questions.length;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"answering" | "feedback">("answering");
  const [responses, setResponses] = useState<Response[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const processedRef = useRef(false);

  // When the quiz finishes, run the librarian (build notes + evolve the learner
  // profile) for this concept — covers the quiz → next-concept path that skips the
  // concept's back button.
  useEffect(() => {
    if (result && !processedRef.current) {
      processedRef.current = true;
      triggerNoteRefresh(quiz.conceptId);
    }
  }, [result, quiz.conceptId]);

  const q = questions[index];
  const isLast = index === total - 1;
  const current = responses.find((r) => r.questionId === q?.id);

  // Defensive: an empty/failed quiz must never crash the screen.
  if (!q && !submitting && !result) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          This quiz came back empty. Head back and try again.
        </p>
        <Link href="/" className="text-[0.875rem]" style={{ color: "var(--color-accent)" }}>
          Back to Today
        </Link>
      </div>
    );
  }

  const isBlank = q?.interaction === "blank";
  const canSubmit = isBlank ? text.trim().length > 0 : choice !== null;

  const checkAnswer = () => {
    if (isBlank) {
      const outcome: Outcome = matchBlank(text, q.accept) ? "correct" : "incorrect";
      setResponses((prev) => [...prev, { questionId: q.id, text, outcome }]);
    } else {
      const outcome: Outcome = choice === q.correctOptionId ? "correct" : "incorrect";
      setResponses((prev) => [
        ...prev,
        { questionId: q.id, choice: choice ?? undefined, outcome },
      ]);
    }
    setPhase("feedback");
  };

  const next = async () => {
    if (!isLast) {
      setIndex((i) => i + 1);
      setPhase("answering");
      setChoice(null);
      setText("");
      return;
    }
    // Last question → finalize: score, SRS, next-step.
    setSubmitting(true);
    setSubmitError(null);
    const answers: AnswerInput[] = responses.map((r) => ({
      questionId: r.questionId,
      choice: r.choice,
      text: r.text,
      outcome: r.outcome,
    }));
    try {
      setResult(await submitQuiz(quiz.quizId, answers));
    } catch (e) {
      setSubmitError(String(e instanceof Error ? e.message : e));
    } finally {
      setSubmitting(false);
    }
  };

  // ===== Grading state =====
  if (submitting) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <span className="spinner" aria-label="Grading" />
        <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          Grading your answers…
        </p>
      </div>
    );
  }

  // ===== Results =====
  if (result) {
    const mastery = masteryDisplay(result.level, result.intervalDays);
    const outcomeOf = (qid: string) =>
      result.results.find((r) => r.questionId === qid)?.outcome ?? "incorrect";
    return (
      <div className="flex min-h-dvh flex-col">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-14">
          <p
            className="label-caps"
            style={{
              color: result.passed ? "var(--color-correct)" : "var(--color-incorrect)",
            }}
          >
            {review
              ? result.passed
                ? "Review complete ✓"
                : "Worth another look"
              : result.passed
              ? result.dayComplete
                ? `Day ${result.dayNumber} complete 🎉`
                : "Concept complete"
              : "Let's solidify this"}
          </p>
          <h1
            className="mt-2 text-[1.625rem] font-medium leading-snug tracking-[-0.015em]"
            style={{ color: "var(--color-ink)" }}
          >
            {quiz.conceptTitle}
          </h1>

          <div
            className="mt-7 flex items-center justify-between rounded-[14px] px-5 py-5"
            style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-line)" }}
          >
            <div className="flex flex-col">
              <span className="label-caps" style={{ color: "var(--color-faint)" }}>
                Score
              </span>
              <span
                className="tabular-nums text-[2.0625rem] font-medium leading-none"
                style={{ color: "var(--color-ink)" }}
              >
                {result.score}
                <span style={{ color: "var(--color-faint)" }}> / {result.total}</span>
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span
                className="rounded-pill px-3 py-1 text-[0.8125rem] font-semibold"
                style={{
                  background: "color-mix(in oklch, " + mastery.color + " 14%, transparent)",
                  color: mastery.color,
                }}
              >
                {mastery.label}
              </span>
              <span className="text-[0.8125rem]" style={{ color: "var(--color-muted)" }}>
                {mastery.interval}
              </span>
            </div>
          </div>

          <ul className="mt-6 flex flex-col">
            {questions.map((qq, i) => {
              const outcome = outcomeOf(qq.id);
              return (
                <li
                  key={qq.id}
                  className="flex items-center gap-3 py-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-line)" }}
                >
                  <OutcomeIcon outcome={outcome} />
                  <span className="flex-1 text-[0.875rem]" style={{ color: "var(--color-ink)" }}>
                    {qq.label}
                  </span>
                  <span className="label-caps" style={{ color: "var(--color-faint)" }}>
                    {outcome === "correct" ? "Correct" : "Missed"}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex-1 min-h-8" />

          {review ? (
            <div className="mt-8 flex flex-col gap-2.5">
              <p className="text-center text-[0.875rem]" style={{ color: "var(--color-muted)" }}>
                {result.passed
                  ? `Nicely retained. Next review in ${result.intervalDays} day${result.intervalDays > 1 ? "s" : ""}.`
                  : "We'll bring this back tomorrow to lock it in."}
              </p>
              <Link href="/" className="inline-flex w-full items-center justify-center rounded-[10px] px-5 py-4" style={accentBtn}>
                Back to Today
              </Link>
              {!result.passed && (
                <Link
                  href={`/concept/${quiz.conceptId}`}
                  className="py-2 text-center text-[0.8125rem]"
                  style={{ color: "var(--color-muted)" }}
                >
                  Revisit with the tutor
                </Link>
              )}
            </div>
          ) : result.passed ? (
            <div className="mt-8 flex flex-col gap-2.5">
              {result.nextConceptId ? (
                <Link
                  href={`/concept/${result.nextConceptId}`}
                  className="group inline-flex w-full items-center justify-between rounded-[10px] px-5 py-4 transition-all"
                  style={accentBtn}
                >
                  <span className="flex flex-col text-left">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] opacity-75">
                      Next concept
                    </span>
                    <span className="truncate">{result.nextConceptTitle}</span>
                  </span>
                  <ArrowRight size={18} strokeWidth={2} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <Link href="/" className="inline-flex w-full items-center justify-center rounded-[10px] px-5 py-4" style={accentBtn}>
                  Course complete 🎉 — Back to Today
                </Link>
              )}
              {result.nextConceptId && (
                <Link href="/" className="py-2 text-center text-[0.8125rem]" style={{ color: "var(--color-muted)" }}>
                  Back to Today
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-2.5">
              <Link
                href={`/concept/${quiz.conceptId}`}
                className="group inline-flex w-full items-center justify-between rounded-[10px] px-5 py-4 transition-all"
                style={accentBtn}
              >
                <span>Revisit with the tutor</span>
                <ArrowRight size={18} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/" className="py-2 text-center text-[0.8125rem]" style={{ color: "var(--color-muted)" }}>
                Review later · Back to Today
              </Link>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ===== Question / feedback =====
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-md px-5 pt-12">
        <div className="flex items-center justify-between">
          <p className="label-caps">{review ? "Review" : "Quiz"} · Day {quiz.dayNumber}</p>
          <p className="label-caps tabular-nums" style={{ color: "var(--color-faint)" }}>
            {index + 1} / {total}
          </p>
        </div>
        <div className="mt-3 flex gap-1.5">
          {questions.map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                background:
                  i < index || (i === index && phase === "feedback")
                    ? "var(--color-accent)"
                    : i === index
                    ? "color-mix(in oklch, var(--color-accent) 45%, var(--color-line))"
                    : "var(--color-line)",
                transitionDuration: "var(--duration-base)",
              }}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-8">
        <p className="label-caps" style={{ color: "var(--color-accent)" }}>
          {q.label}
        </p>
        <div className="mt-3">
          {isBlank ? (
            <p
              className="text-[1.0625rem] leading-relaxed"
              style={{ color: "var(--color-ink)" }}
            >
              {q.prompt}
            </p>
          ) : (
            <Markdown source={q.prompt} size="lg" />
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {isBlank ? (
            <input
              type="text"
              value={current ? current.text ?? "" : text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase === "feedback"}
              autoFocus
              autoComplete="off"
              placeholder="Type the missing term…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit && phase === "answering") checkAnswer();
              }}
              className="w-full rounded-[12px] px-4 py-3.5 outline-none transition-colors disabled:opacity-100"
              style={{
                background: "var(--color-surface-raised)",
                border:
                  phase === "feedback"
                    ? `1px solid color-mix(in oklch, var(--color-${current?.outcome === "correct" ? "correct" : "incorrect"}) 50%, transparent)`
                    : "1px solid var(--color-line)",
                color: "var(--color-ink)",
                fontSize: "var(--text-base)",
              }}
            />
          ) : (
            (q.options ?? []).map((opt) => {
              const selected = (current ? current.choice : choice) === opt.id;
              const isCorrect = opt.id === q.correctOptionId;
              const reveal = phase === "feedback";
              let border = "var(--color-line)";
              let bg = "var(--color-surface-raised)";
              let mark: "correct" | "incorrect" | null = null;
              if (reveal && isCorrect) {
                border = "color-mix(in oklch, var(--color-correct) 50%, transparent)";
                bg = "color-mix(in oklch, var(--color-correct) 9%, transparent)";
                mark = "correct";
              } else if (reveal && selected && !isCorrect) {
                border = "color-mix(in oklch, var(--color-incorrect) 50%, transparent)";
                bg = "color-mix(in oklch, var(--color-incorrect) 8%, transparent)";
                mark = "incorrect";
              } else if (!reveal && selected) {
                border = "var(--color-accent)";
                bg = "var(--color-accent-tint)";
              }
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={reveal}
                  onClick={() => setChoice(opt.id)}
                  className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3.5 text-left transition-all"
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    color: "var(--color-ink)",
                    fontSize: "var(--text-base)",
                    transitionDuration: "var(--duration-fast)",
                    transitionTimingFunction: "var(--ease-out-quart)",
                  }}
                >
                  <span>{opt.label}</span>
                  {mark === "correct" && <Check size={17} strokeWidth={2.2} style={{ color: "var(--color-correct)" }} />}
                  {mark === "incorrect" && <X size={17} strokeWidth={2.2} style={{ color: "var(--color-incorrect)" }} />}
                </button>
              );
            })
          )}
        </div>

        {phase === "feedback" && current && (
          <div
            className="mt-5 flex flex-col gap-3 rounded-[14px] p-4"
            style={{ background: "var(--color-surface-sunken)", border: "1px solid var(--color-line)" }}
          >
            <div className="flex items-center gap-2">
              <OutcomeIcon outcome={current.outcome} />
              <span
                className="text-[0.875rem] font-semibold"
                style={{
                  color:
                    current.outcome === "correct"
                      ? "var(--color-correct)"
                      : "var(--color-incorrect)",
                }}
              >
                {current.outcome === "correct" ? "Correct" : "Not quite"}
              </span>
            </div>
            {isBlank && q.accept.length > 0 && (
              <p className="text-[0.875rem]" style={{ color: "var(--color-ink)" }}>
                Answer:{" "}
                <span className="font-semibold" style={{ color: "var(--color-correct)" }}>
                  {q.accept[0]}
                </span>
              </p>
            )}
            {q.explanation && <Markdown source={q.explanation} />}
          </div>
        )}

        {submitError && (
          <p className="mt-4 text-[0.8125rem]" style={{ color: "var(--color-incorrect)" }}>
            {submitError}
          </p>
        )}

        <div className="flex-1 min-h-8" />

        {phase === "answering" ? (
          <button
            type="button"
            onClick={checkAnswer}
            disabled={!canSubmit}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-5 py-4 transition-all disabled:opacity-35"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-accent-ink)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              letterSpacing: "0.005em",
              transitionDuration: "var(--duration-base)",
              transitionTimingFunction: "var(--ease-out-quart)",
            }}
          >
            Check answer
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            className="group mt-8 inline-flex w-full items-center justify-between rounded-[10px] px-5 py-4 transition-all"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-accent-ink)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              letterSpacing: "0.005em",
              transitionDuration: "var(--duration-base)",
              transitionTimingFunction: "var(--ease-out-quart)",
            }}
          >
            <span>{isLast ? "See results" : "Next question"}</span>
            <ArrowRight size={18} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </main>
    </div>
  );
}

function OutcomeIcon({ outcome }: { outcome: Outcome }) {
  const map = {
    correct: { Icon: Check, color: "var(--color-correct)" },
    incorrect: { Icon: X, color: "var(--color-incorrect)" },
    recorded: { Icon: Minus, color: "var(--color-accent)" },
  } as const;
  const { Icon, color } = map[outcome];
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: "color-mix(in oklch, " + color + " 14%, transparent)" }}
    >
      <Icon size={13} strokeWidth={2.4} style={{ color }} />
    </span>
  );
}
