"use client";

import { ArrowRight, Flame, RotateCcw, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ProgressRing } from "@/components/ProgressRing";
import { BottomNav } from "@/components/BottomNav";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchToday } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { ReviewCardSummary } from "@/lib/types";

const LEVEL_COLOR: Record<string, string> = {
  weak: "var(--color-incorrect)",
  partial: "var(--color-partial)",
  strong: "var(--color-correct)",
  easy: "var(--color-accent)",
};

export function TodayClient() {
  const { data, error, loading, reload } = useAsync(fetchToday);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  const { userName, progress, reviewsDue, resumeConceptId, nextConcept } = data;

  // Forward-looking "next review" label for the home indicator.
  const nextReviewLabel = (() => {
    if (!data.nextReviewAt) return null;
    const due = new Date(data.nextReviewAt);
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
    if (dayDiff <= 0) return "later today";
    if (dayDiff === 1) return "tomorrow";
    return `in ${dayDiff} days`;
  })();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-12">
        <h1
          className="text-[1.625rem] font-medium tracking-[-0.015em]"
          style={{ color: "var(--color-ink)" }}
        >
          Welcome back, {userName}.
        </h1>

        <div className="mt-12 flex flex-col items-center gap-3">
          <ProgressRing
            ratio={
              progress.currentDayConceptsTotal
                ? progress.currentDayConceptsDone / progress.currentDayConceptsTotal
                : 0
            }
            centerValue={progress.currentDayConceptsDone}
            centerLabel={`of ${progress.currentDayConceptsTotal} · Day ${progress.currentDayNumber}`}
          />
          <p className="text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
            <span className="tabular-nums">{progress.daysCompleted}</span> of{" "}
            <span className="tabular-nums">{progress.daysTotal}</span> days complete
          </p>
          {progress.streakDays > 0 && (
            <p
              className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              <Flame size={14} strokeWidth={2} />
              {progress.streakDays} day{progress.streakDays === 1 ? "" : "s"} streak
            </p>
          )}
        </div>

        <div
          className="mt-12 h-px w-full"
          style={{ background: "var(--color-line)" }}
        />

        {reviewsDue.length > 0 ? (
          <section className="mt-8 flex flex-col gap-3">
            <Link href="/review" className="label-caps inline-flex items-center gap-1">
              Due for review · {reviewsDue.length}
              <ChevronRight size={13} strokeWidth={2.2} />
            </Link>
            <ul className="flex flex-col gap-2">
              {reviewsDue.map((r) => (
                <ReviewCard key={r.conceptId} review={r} />
              ))}
            </ul>
          </section>
        ) : (
          nextReviewLabel && (
            <Link
              href="/review"
              className="group mt-8 flex items-center gap-3 rounded-[12px] px-4 py-3 transition-colors hover:bg-[var(--color-surface-sunken)]"
              style={{ border: "1px solid var(--color-line)" }}
            >
              <RotateCcw size={15} strokeWidth={2} style={{ color: "var(--color-accent)" }} />
              <span className="flex-1 text-[0.875rem]" style={{ color: "var(--color-ink)" }}>
                Next review {nextReviewLabel}
                <span style={{ color: "var(--color-faint)" }}>
                  {" "}· {data.reviewsUpcoming} concept{data.reviewsUpcoming === 1 ? "" : "s"} scheduled
                </span>
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: "var(--color-faint)" }}
              />
            </Link>
          )
        )}

        {nextConcept ? (
          <section className="mt-8 flex flex-col gap-2">
            <p className="label-caps">
              {resumeConceptId ? "Resume" : "Up next"} · Day {nextConcept.dayNumber} ·{" "}
              {nextConcept.indexInDay} of {nextConcept.totalInDay}
            </p>
            <h2
              className="text-[1.3125rem] font-medium leading-snug tracking-[-0.01em]"
              style={{ color: "var(--color-ink)" }}
            >
              {nextConcept.title}
            </h2>
            <p className="text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
              {nextConcept.dayTitle}
            </p>
          </section>
        ) : (
          <section className="mt-8 flex flex-col gap-2">
            <p className="label-caps">Course complete</p>
            <h2
              className="text-[1.3125rem] font-medium tracking-[-0.01em]"
              style={{ color: "var(--color-ink)" }}
            >
              All 28 days done. 🎉
            </h2>
          </section>
        )}

        <div className="flex-1 min-h-8" />

        {nextConcept && (
          <Link
            href={`/concept/${nextConcept.id}`}
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
            <span>
              {progress.conceptsMastered > 0 ||
              progress.currentDayConceptsDone > 0 ||
              resumeConceptId
                ? "Continue learning"
                : "Start learning"}
            </span>
            <ArrowRight
              size={18}
              strokeWidth={2}
              className="transition-transform group-hover:translate-x-0.5"
              style={{
                transitionDuration: "var(--duration-base)",
                transitionTimingFunction: "var(--ease-out-quart)",
              }}
            />
          </Link>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewCardSummary }) {
  const color = LEVEL_COLOR[review.level] ?? "var(--color-muted)";
  return (
    <li>
      <Link
        href={`/quiz/${review.conceptId}?review=1`}
        className="group flex items-center gap-3 rounded-[12px] px-4 py-3 transition-colors hover:bg-[var(--color-surface-sunken)]"
        style={{ border: "1px solid var(--color-line)" }}
      >
        <RotateCcw size={15} strokeWidth={2} style={{ color }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate text-[0.875rem] font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            {review.conceptTitle}
          </span>
          <span className="text-[0.75rem]" style={{ color: "var(--color-faint)" }}>
            {review.overdue ? "Overdue" : "Due today"} · {review.level}
          </span>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={2}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "var(--color-faint)" }}
        />
      </Link>
    </li>
  );
}
