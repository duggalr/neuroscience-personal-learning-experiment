"use client";

import { useEffect, useState } from "react";
import { X, Check, RotateCcw, Circle, MessageCircle, Lock } from "lucide-react";
import { fetchDayMap } from "@/lib/api";
import type { DayMap, DayMapConcept } from "@/lib/types";

// A slide-over that maps the whole day: every concept and its beats, so you can
// jump back to anything you've already covered.
export function LessonMap({
  conceptId,
  currentPage,
  onJump,
  onClose,
}: {
  conceptId: string;
  currentPage: number;
  onJump: (conceptId: string, page: number) => void;
  onClose: () => void;
}) {
  const [map, setMap] = useState<DayMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDayMap(conceptId)
      .then((m) => active && setMap(m))
      .catch((e) => active && setError(String(e?.message ?? e)));
    return () => {
      active = false;
    };
  }, [conceptId]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close lesson map"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "color-mix(in oklch, var(--color-ink) 32%, transparent)" }}
      />
      {/* Panel */}
      <div
        className="relative ml-auto flex h-full w-full max-w-sm flex-col shadow-2xl"
        style={{ background: "var(--color-surface)", animation: "slideInRight 240ms var(--ease-out-quart, ease)" }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div className="flex flex-col">
            <span className="label-caps" style={{ color: "var(--color-faint)" }}>
              {map ? `Day ${map.dayNumber}` : "Lesson map"}
            </span>
            <span
              className="text-[0.9375rem] font-medium tracking-[-0.005em]"
              style={{ color: "var(--color-ink)" }}
            >
              {map?.dayTitle ?? "Loading…"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-sunken)]"
            style={{ color: "var(--color-muted)" }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {error && (
            <p className="px-2 py-4 text-[0.875rem]" style={{ color: "var(--color-incorrect)" }}>
              {error}
            </p>
          )}
          {map?.concepts.map((c) => (
            <ConceptBlock
              key={c.id}
              concept={c}
              currentPage={currentPage}
              onJump={onJump}
            />
          ))}
        </div>
      </div>

      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}

function StatusBadge({ concept }: { concept: DayMapConcept }) {
  if (concept.lastQuizPassed === true)
    return <Check size={14} strokeWidth={2.4} style={{ color: "var(--color-accent)" }} />;
  if (concept.lastQuizPassed === false)
    return <RotateCcw size={13} strokeWidth={2.2} style={{ color: "var(--color-incorrect)" }} />;
  return (
    <Circle
      size={9}
      strokeWidth={2}
      style={{ color: concept.started ? "var(--color-accent)" : "var(--color-faint)" }}
      fill={concept.started ? "var(--color-accent)" : "none"}
    />
  );
}

function ConceptBlock({
  concept,
  currentPage,
  onJump,
}: {
  concept: DayMapConcept;
  currentPage: number;
  onJump: (conceptId: string, page: number) => void;
}) {
  // You can revisit anything you've started, plus the current concept. Concepts you
  // haven't reached yet are locked — you unlock them through the normal lesson flow.
  const locked = !concept.started && !concept.current;

  if (locked) {
    return (
      <div className="mb-1">
        <div className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <Lock size={12} strokeWidth={2} style={{ color: "var(--color-faint)" }} />
          </span>
          <span
            className="flex-1 text-[0.875rem] font-medium leading-snug"
            style={{ color: "var(--color-faint)" }}
          >
            {concept.indexInDay}. {concept.title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => onJump(concept.id, 0)}
        className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-sunken)]"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <StatusBadge concept={concept} />
        </span>
        <span
          className="flex-1 text-[0.875rem] font-medium leading-snug"
          style={{ color: concept.current ? "var(--color-accent)" : "var(--color-ink)" }}
        >
          {concept.indexInDay}. {concept.title}
        </span>
        {concept.qaCount > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-[0.75rem] tabular-nums"
            style={{ color: "var(--color-faint)" }}
            title={`${concept.qaCount} question${concept.qaCount === 1 ? "" : "s"} asked`}
          >
            <MessageCircle size={12} strokeWidth={1.9} />
            {concept.qaCount}
          </span>
        )}
      </button>

      {concept.beats.length > 0 && (
        <ul className="ml-[1.4rem] flex flex-col border-l" style={{ borderColor: "var(--color-line)" }}>
          {concept.beats.map((b) => {
            const here = concept.current && b.page === currentPage;
            return (
              <li key={b.page}>
                <button
                  type="button"
                  onClick={() => onJump(concept.id, b.page)}
                  className="-ml-px flex w-full items-start gap-2 border-l-2 py-1.5 pl-3 pr-2 text-left text-[0.8125rem] leading-snug transition-colors hover:bg-[var(--color-surface-sunken)]"
                  style={{
                    borderColor: here ? "var(--color-accent)" : "transparent",
                    color: here ? "var(--color-ink)" : "var(--color-muted)",
                    fontWeight: here ? 500 : 400,
                  }}
                >
                  {b.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
