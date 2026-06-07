"use client";

import { BottomNav } from "@/components/BottomNav";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchQuizResults } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { relativeTime } from "@/lib/text";

const levelStyle: Record<string, { label: string; color: string }> = {
  strong: { label: "Strong", color: "var(--color-correct)" },
  partial: { label: "Partial", color: "var(--color-partial)" },
  weak: { label: "Weak", color: "var(--color-incorrect)" },
  easy: { label: "Easy", color: "var(--color-accent)" },
};

export function QuizResultsClient() {
  const { data, error, loading, reload } = useAsync(fetchQuizResults);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-6 pt-12">
        <h1
          className="text-[1.625rem] font-medium tracking-[-0.015em]"
          style={{ color: "var(--color-ink)" }}
        >
          Quiz history
        </h1>
        <p className="mt-2 text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          A record of every quiz you&rsquo;ve taken. Read-only — new quizzes come from
          the daily loop.
        </p>

        {data.length === 0 ? (
          <p className="mt-16 text-center text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
            No quizzes yet. Finish a concept with the tutor and take its quiz.
          </p>
        ) : (
          <ul className="mt-7 flex flex-col">
            {data.map((qz, i) => {
              const s = levelStyle[qz.level] ?? { label: qz.level, color: "var(--color-muted)" };
              return (
                <li
                  key={qz.id}
                  className="flex items-center gap-4 py-4"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-line)" }}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className="truncate text-[0.9375rem] font-medium tracking-[-0.005em]"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {qz.conceptTitle}
                    </span>
                    <span className="text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
                      {relativeTime(qz.takenAt)}
                    </span>
                  </div>
                  <span
                    className="tabular-nums text-[0.9375rem] font-medium"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {qz.score}/{qz.total}
                  </span>
                  <span
                    className="rounded-pill px-2.5 py-1 text-[0.75rem] font-semibold"
                    style={{
                      background: "color-mix(in oklch, " + s.color + " 13%, transparent)",
                      color: s.color,
                      minWidth: "58px",
                      textAlign: "center",
                    }}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
