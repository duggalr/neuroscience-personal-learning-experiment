"use client";

import Link from "next/link";
import { ChevronLeft, Link2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { Markdown } from "@/components/Markdown";
import { fetchNote } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { relativeTime } from "@/lib/text";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function NoteReader({ noteId }: { noteId: string }) {
  const { data, error, loading, reload } = useAsync(() => fetchNote(noteId));

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          background: "color-mix(in oklch, var(--color-surface) 88%, transparent)",
          backdropFilter: "saturate(140%) blur(12px)",
          WebkitBackdropFilter: "saturate(140%) blur(12px)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3">
          <Link
            href="/notes"
            aria-label="Back to Notes"
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-md"
            style={{ color: "var(--color-muted)" }}
          >
            <ChevronLeft size={20} strokeWidth={1.9} />
          </Link>
          <span
            className="flex-1 truncate text-[0.9375rem] font-medium tracking-[-0.005em]"
            style={{ color: "var(--color-ink)" }}
          >
            {data.title}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-8 pt-7">
        <p className="label-caps">Concept note · updated {relativeTime(data.updatedAt)}</p>
        <h1
          className="mt-2 text-[1.625rem] font-medium leading-snug tracking-[-0.015em]"
          style={{ color: "var(--color-ink)" }}
        >
          {data.title}
        </h1>

        <div className="mt-5">
          <Markdown source={data.body} />
        </div>

        {data.citations.length > 0 && (
          <div
            className="mt-8 flex flex-col gap-2 border-t pt-5"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span className="label-caps" style={{ color: "var(--color-faint)" }}>
              Sources
            </span>
            <ol className="flex flex-col gap-1.5">
              {data.citations.map((c, i) => (
                <li key={c.url} className="flex gap-2 text-[0.8125rem] leading-snug">
                  <span className="tabular-nums pt-px" style={{ color: "var(--color-faint)" }}>
                    {i + 1}
                  </span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-wrap items-baseline gap-x-1.5 underline-offset-2 hover:underline"
                    style={{ color: "var(--color-accent)" }}
                  >
                    <span>{c.title}</span>
                    <span style={{ color: "var(--color-faint)" }}>{hostOf(c.url)}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}

        {data.links.length > 0 && (
          <div
            className="mt-8 flex flex-col gap-3 border-t pt-5"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span className="label-caps inline-flex items-center gap-1.5">
              <Link2 size={13} strokeWidth={1.9} />
              Linked concepts
            </span>
            <div className="flex flex-wrap gap-2">
              {data.links.map((l) => (
                <Link
                  key={l.id}
                  href={`/notes/${l.id}`}
                  className="rounded-pill px-3 py-1.5 text-[0.8125rem] transition-colors hover:bg-[var(--color-accent-tint)]"
                  style={{
                    border: "1px solid var(--color-line)",
                    color: "var(--color-ink)",
                  }}
                >
                  {l.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
