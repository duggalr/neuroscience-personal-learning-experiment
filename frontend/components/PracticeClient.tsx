"use client";

import Link from "next/link";
import { RotateCcw, ChevronRight, Clock, Check } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchReviews } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { ReviewScheduleItem } from "@/lib/types";

const LEVEL_COLOR: Record<string, string> = {
  weak: "var(--color-incorrect)",
  partial: "var(--color-partial)",
  strong: "var(--color-correct)",
  easy: "var(--color-accent)",
};

// Calendar-day-aware "when is this due" label.
function dueLabel(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  if (due.getTime() <= now.getTime()) return "Due now";
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (dayDiff <= 0) return "Later today";
  if (dayDiff === 1) return "Tomorrow";
  return `In ${dayDiff} days`;
}

export function PracticeClient() {
  const { data, error, loading, reload } = useAsync(fetchReviews);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  const empty = data.due.length === 0 && data.upcoming.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-5 pt-12">
          <h1
            className="text-[1.625rem] font-medium tracking-[-0.015em]"
            style={{ color: "var(--color-ink)" }}
          >
            Review
          </h1>
          <p className="mt-2 text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
            Spaced practice. Concepts come back on an expanding schedule (1, 3, 7, 16, 35+
            days) — the better you know one, the less often it returns.
          </p>
        </div>

        <div className="mx-auto w-full max-w-2xl px-5 pb-6">
          {empty && (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
                Nothing scheduled yet. Finish a concept&rsquo;s quiz and it&rsquo;ll start
                showing up here for spaced review.
              </p>
              <Link href="/" className="text-[0.875rem]" style={{ color: "var(--color-accent)" }}>
                Go to Today
              </Link>
            </div>
          )}

          {data.due.length > 0 && (
            <section className="mt-7 flex flex-col gap-3">
              <p className="label-caps">Due now · {data.due.length}</p>
              <ul className="flex flex-col gap-2">
                {data.due.map((r) => (
                  <DueRow key={r.conceptId} item={r} />
                ))}
              </ul>
            </section>
          )}

          {data.upcoming.length > 0 && (
            <section className="mt-8 flex flex-col gap-3">
              <p className="label-caps" style={{ color: "var(--color-faint)" }}>
                Upcoming · {data.upcoming.length}
              </p>
              <ul className="flex flex-col gap-2">
                {data.upcoming.map((r) => (
                  <UpcomingRow key={r.conceptId} item={r} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function DueRow({ item }: { item: ReviewScheduleItem }) {
  const color = LEVEL_COLOR[item.level] ?? "var(--color-muted)";
  return (
    <li>
      <Link
        href={`/quiz/${item.conceptId}?review=1`}
        className="group flex items-center gap-3 rounded-[12px] px-4 py-3 transition-colors hover:bg-[var(--color-surface-sunken)]"
        style={{ border: "1px solid var(--color-line)" }}
      >
        <RotateCcw size={15} strokeWidth={2} style={{ color }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[0.875rem] font-medium" style={{ color: "var(--color-ink)" }}>
            {item.conceptTitle}
          </span>
          <span className="text-[0.75rem]" style={{ color: "var(--color-faint)" }}>
            {dueLabel(item.dueAt)} · {item.level}
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

function UpcomingRow({ item }: { item: ReviewScheduleItem }) {
  const color = LEVEL_COLOR[item.level] ?? "var(--color-muted)";
  const mastered = item.level === "strong" || item.level === "easy";
  return (
    <li
      className="flex items-center gap-3 rounded-[12px] px-4 py-3"
      style={{ border: "1px solid var(--color-line)" }}
    >
      {mastered ? (
        <Check size={15} strokeWidth={2.2} style={{ color }} />
      ) : (
        <Clock size={15} strokeWidth={1.9} style={{ color: "var(--color-faint)" }} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.875rem] font-medium" style={{ color: "var(--color-ink)" }}>
          {item.conceptTitle}
        </span>
        <span className="text-[0.75rem]" style={{ color: "var(--color-faint)" }}>
          {item.level}
        </span>
      </div>
      <span
        className="shrink-0 rounded-pill px-2.5 py-1 text-[0.75rem] font-medium"
        style={{ background: "var(--color-surface-sunken)", color: "var(--color-muted)" }}
      >
        {dueLabel(item.dueAt)}
      </span>
    </li>
  );
}
