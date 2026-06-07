"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchConcepts } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { ConceptTopic } from "@/lib/types";

export function ConceptsView() {
  const { data, error, loading, reload } = useAsync(fetchConcepts);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  if (data.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
            No concepts yet. As your notes grow, the tutor rolls them up into the
            high-level topics you have covered so far.
          </p>
          <Link href="/" className="text-[0.875rem]" style={{ color: "var(--color-accent)" }}>
            Go to Today
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-6">
      <p className="mt-7 text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
        The lay of the land — {data.length} core{" "}
        {data.length === 1 ? "topic" : "topics"} you have touched so far, rolled up
        from your notes.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {data.map((c, i) => (
          <ConceptCard key={i} concept={c} index={i} />
        ))}
      </ul>
    </div>
  );
}

function ConceptCard({ concept, index }: { concept: ConceptTopic; index: number }) {
  return (
    <li
      className="rounded-[14px] p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[0.8125rem] font-semibold"
          style={{ background: "var(--color-accent-tint)", color: "var(--color-accent)" }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="text-[1.0625rem] font-medium leading-snug tracking-[-0.01em]"
            style={{ color: "var(--color-ink)" }}
          >
            {concept.title}
          </h2>
          <p
            className="mt-1.5 text-[0.875rem] leading-relaxed"
            style={{ color: "var(--color-muted)" }}
          >
            {concept.description}
          </p>

          {concept.notes.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {concept.notes.map((n) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[0.75rem] font-medium transition-colors hover:bg-[var(--color-surface)]"
                  style={{
                    background: "var(--color-surface-sunken)",
                    border: "1px solid var(--color-line)",
                    color: "var(--color-ink-soft, var(--color-muted))",
                  }}
                >
                  <Layers size={11} strokeWidth={1.8} style={{ color: "var(--color-faint)" }} />
                  {n.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
