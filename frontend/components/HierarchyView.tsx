"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { fetchConceptHierarchy } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { ConceptNode } from "@/lib/types";

export function HierarchyView() {
  const { data, error, loading, reload } = useAsync(fetchConceptHierarchy);

  if (loading)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-5 pt-20">
        <span className="spinner" aria-label="Building" />
        <p className="text-[0.875rem]" style={{ color: "var(--color-muted)" }}>
          Building your concept map…
        </p>
      </div>
    );
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  if (data.root.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
            No concept map yet. As your notes grow, the tutor organizes them into a
            foundational-to-advanced hierarchy here.
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
        How your foundations stack — {data.root.length} core{" "}
        {data.root.length === 1 ? "pillar" : "pillars"}, rolled up from your notes.
        Foundational at the top, building to specifics below.
      </p>
      <div className="mt-5 flex flex-col gap-1">
        {data.root.map((node, i) => (
          <Node key={i} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}

function Node({ node, depth }: { node: ConceptNode; depth: number }) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(depth < 1); // top two levels open by default

  return (
    <div>
      <div
        className="flex items-start gap-2 rounded-[10px] px-2 py-2"
        style={{ background: depth === 0 ? "var(--color-surface)" : "transparent" }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((o) => !o)}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors"
          style={{
            color: hasChildren ? "var(--color-muted)" : "transparent",
            cursor: hasChildren ? "pointer" : "default",
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren &&
            (open ? (
              <ChevronDown size={15} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={15} strokeWidth={2.2} />
            ))}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className="font-medium tracking-[-0.005em]"
              style={{
                color: "var(--color-ink)",
                fontSize: depth === 0 ? "1rem" : "0.9375rem",
              }}
            >
              {node.title}
            </span>
            {node.notes.length > 0 && (
              <span className="text-[0.6875rem]" style={{ color: "var(--color-faint)" }}>
                {node.notes.length} note{node.notes.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {node.abstract && (
            <p
              className="mt-0.5 text-[0.8125rem] leading-snug"
              style={{ color: "var(--color-muted)" }}
            >
              {node.abstract}
            </p>
          )}
          {node.notes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {node.notes.map((n) => (
                <Link
                  key={n.id}
                  href={`/notes/${n.id}`}
                  className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.6875rem] font-medium transition-colors hover:bg-[var(--color-surface)]"
                  style={{
                    background: "var(--color-surface-sunken)",
                    border: "1px solid var(--color-line)",
                    color: "var(--color-muted)",
                  }}
                >
                  <FileText size={10} strokeWidth={1.8} style={{ color: "var(--color-faint)" }} />
                  {n.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasChildren && open && (
        <div
          className="ml-[0.9rem] mt-1 flex flex-col gap-1 border-l pl-2"
          style={{ borderColor: "var(--color-line)" }}
        >
          {node.children.map((ch, i) => (
            <Node key={i} node={ch} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
