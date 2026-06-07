"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Link2, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { ConceptsView } from "@/components/ConceptsView";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchNotes, fetchProposals } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { relativeTime } from "@/lib/text";
import type { NoteListItem } from "@/lib/types";

const load = () => Promise.all([fetchNotes(), fetchProposals()]);

export function NotesClient() {
  const { data, error, loading, reload } = useAsync(load);
  const [view, setView] = useState<"list" | "concepts">("list");

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  const [notes, proposals] = data;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-5 pt-12">
          <h1
            className="text-[1.625rem] font-medium tracking-[-0.015em]"
            style={{ color: "var(--color-ink)" }}
          >
            Notes
          </h1>
          <p className="mt-2 text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
            Your evergreen concept notes, written and linked by the tutor as you learn.
          </p>

          {proposals.length > 0 && (
            <Link
              href="/notes/review"
              className="group mt-5 flex items-center gap-3 rounded-[12px] px-4 py-3 transition-colors"
              style={{
                background: "var(--color-accent-tint)",
                border: "1px solid color-mix(in oklch, var(--color-accent) 22%, transparent)",
              }}
            >
              <Sparkles size={17} strokeWidth={2} style={{ color: "var(--color-accent)" }} />
              <span
                className="flex-1 text-[0.875rem] font-medium"
                style={{ color: "var(--color-accent)" }}
              >
                {proposals.length} proposed{" "}
                {proposals.length === 1 ? "change" : "changes"} to review
              </span>
              <ChevronRight
                size={17}
                strokeWidth={2}
                className="transition-transform group-hover:translate-x-0.5"
                style={{ color: "var(--color-accent)" }}
              />
            </Link>
          )}

          {/* Notes / Concepts toggle */}
          <div
            className="mt-5 inline-flex rounded-pill p-0.5"
            style={{ background: "var(--color-surface-sunken)", border: "1px solid var(--color-line)" }}
          >
            {(["list", "concepts"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="rounded-pill px-4 py-1.5 text-[0.8125rem] font-medium transition-colors"
                style={{
                  background: view === v ? "var(--color-surface)" : "transparent",
                  color: view === v ? "var(--color-ink)" : "var(--color-muted)",
                  boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                {v === "list" ? "Notes" : "Concepts"}
              </button>
            ))}
          </div>
        </div>

        {view === "list" ? (
          <div className="mx-auto w-full max-w-2xl px-5 pb-6">
            {notes.length === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-4 text-center">
                <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
                  No notes yet. As you go through lessons, the tutor writes up atomic
                  concept notes and links them into a web here.
                </p>
                <Link href="/" className="text-[0.875rem]" style={{ color: "var(--color-accent)" }}>
                  Go to Today
                </Link>
              </div>
            ) : (
              <ul className="mt-7 flex flex-col">
                {notes.map((n, i) => (
                  <NoteRow key={n.id} note={n} first={i === 0} />
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ConceptsView />
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function NoteRow({ note, first }: { note: NoteListItem; first: boolean }) {
  return (
    <li>
      <Link
        href={`/notes/${note.id}`}
        className="group -mx-2 flex items-start gap-3 rounded-[10px] px-2 py-4 transition-colors hover:bg-[var(--color-surface-sunken)]"
        style={{ borderTop: first ? "none" : "1px solid var(--color-line)" }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className="text-[0.9375rem] font-medium leading-snug tracking-[-0.005em]"
            style={{ color: "var(--color-ink)" }}
          >
            {note.title}
          </span>
          <span
            className="line-clamp-2 text-[0.8125rem] leading-snug"
            style={{ color: "var(--color-muted)" }}
          >
            {note.snippet}
          </span>
          <span
            className="mt-0.5 flex items-center gap-3 text-[0.75rem]"
            style={{ color: "var(--color-faint)" }}
          >
            {note.linkCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Link2 size={12} strokeWidth={1.8} />
                {note.linkCount}
              </span>
            )}
            <span>{relativeTime(note.updatedAt)}</span>
          </span>
        </div>
        <ChevronRight
          size={17}
          strokeWidth={1.8}
          className="mt-0.5 shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "var(--color-faint)" }}
        />
      </Link>
    </li>
  );
}
