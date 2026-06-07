"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchSyllabus, fetchToday } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { SyllabusDay } from "@/lib/types";

type DayStatus = "done" | "current" | "upcoming";

const load = () => Promise.all([fetchSyllabus(), fetchToday()]);

export function SyllabusClient() {
  const { data, error, loading, reload } = useAsync(load);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  const [syllabus, today] = data;
  const { daysCompleted, currentDayId } = today.progress;

  const statusOf = (day: SyllabusDay): DayStatus => {
    if (day.id === currentDayId) return "current";
    if (day.number <= daysCompleted) return "done";
    return "upcoming";
  };

  const weeks: { number: number; title: string; days: SyllabusDay[] }[] = [];
  for (const day of syllabus) {
    let wk = weeks.find((w) => w.number === day.weekNumber);
    if (!wk) {
      wk = { number: day.weekNumber, title: day.weekTitle, days: [] };
      weeks.push(wk);
    }
    wk.days.push(day);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-6 pt-12">
        <h1
          className="text-[1.625rem] font-medium tracking-[-0.015em]"
          style={{ color: "var(--color-ink)" }}
        >
          Syllabus
        </h1>
        <p className="mt-2 text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          4 weeks · 28 days · <span className="tabular-nums">{daysCompleted}</span> done
        </p>

        <div className="mt-8 flex flex-col gap-9">
          {weeks.map((wk) => (
            <section key={wk.number}>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="label-caps">Week {wk.number}</span>
                <span className="text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
                  {wk.title}
                </span>
              </div>

              <ul className="flex flex-col">
                {wk.days.map((day, i) => {
                  const status = statusOf(day);
                  const last = i === wk.days.length - 1;
                  const linkable = day.concepts.length > 0 && status !== "upcoming";
                  const inner = <DayRow day={day} status={status} last={last} />;
                  return (
                    <li key={day.id}>
                      {linkable ? (
                        <Link
                          href={`/concept/${day.concepts[0].id}`}
                          className="block rounded-[10px] transition-colors hover:bg-[var(--color-surface-sunken)]"
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function DayRow({
  day,
  status,
  last,
}: {
  day: SyllabusDay;
  status: DayStatus;
  last: boolean;
}) {
  return (
    <div className="flex gap-3.5 px-2">
      <div className="flex flex-col items-center">
        <Marker status={status} />
        {!last && (
          <span
            className="w-px flex-1"
            style={{
              minHeight: "20px",
              background:
                status === "done"
                  ? "color-mix(in oklch, var(--color-accent) 35%, var(--color-line))"
                  : "var(--color-line)",
            }}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col pb-5 pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className="label-caps"
            style={{
              color: status === "current" ? "var(--color-accent)" : "var(--color-faint)",
            }}
          >
            Day {day.number}
          </span>
          {status === "current" && (
            <span
              className="rounded-pill px-2 py-0.5 text-[0.6875rem] font-semibold"
              style={{ background: "var(--color-accent-tint)", color: "var(--color-accent)" }}
            >
              Up next
            </span>
          )}
        </div>
        <span
          className="mt-0.5 text-[0.9375rem] font-medium tracking-[-0.005em]"
          style={{
            color: status === "upcoming" ? "var(--color-muted)" : "var(--color-ink)",
          }}
        >
          {day.title}
        </span>
      </div>
    </div>
  );
}

function Marker({ status }: { status: DayStatus }) {
  if (status === "done") {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--color-accent)" }}
      >
        <Check size={12} strokeWidth={2.6} style={{ color: "var(--color-accent-ink)" }} />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--color-surface)", border: "2px solid var(--color-accent)" }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-accent)" }}
        />
      </span>
    );
  }
  return (
    <span
      className="h-5 w-5 shrink-0 rounded-full"
      style={{ background: "var(--color-surface)", border: "1.5px solid var(--color-line-strong)" }}
    />
  );
}
