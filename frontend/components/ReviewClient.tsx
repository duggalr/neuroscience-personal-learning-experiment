"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, X, GitMerge, PencilLine } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { LoadingScreen, ErrorScreen } from "@/components/Status";
import { Markdown } from "@/components/Markdown";
import { fetchProposals, acceptProposal, rejectProposal } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { Proposal } from "@/lib/types";

export function ReviewClient() {
  const { data, error, loading, reload } = useAsync(fetchProposals);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  const pending = data.filter((p) => !done.has(p.id));

  const act = async (p: Proposal, accept: boolean) => {
    setBusy(p.id);
    try {
      await (accept ? acceptProposal(p.id) : rejectProposal(p.id));
      setDone((s) => new Set(s).add(p.id));
    } finally {
      setBusy(null);
    }
  };

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
            className="flex-1 text-[0.9375rem] font-medium tracking-[-0.005em]"
            style={{ color: "var(--color-ink)" }}
          >
            Review changes
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-8 pt-7">
        {pending.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <Check size={28} strokeWidth={1.6} style={{ color: "var(--color-correct)" }} />
            <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
              All caught up. Nothing to review.
            </p>
            <Link href="/notes" className="text-[0.875rem]" style={{ color: "var(--color-accent)" }}>
              Back to Notes
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-[0.875rem]" style={{ color: "var(--color-muted)" }}>
              The librarian wants to change existing notes. Accept to apply, or dismiss.
            </p>
            {pending.map((p) => (
              <ProposalCard key={p.id} p={p} busy={busy === p.id} onAct={act} />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function ProposalCard({
  p,
  busy,
  onAct,
}: {
  p: Proposal;
  busy: boolean;
  onAct: (p: Proposal, accept: boolean) => void;
}) {
  const isMerge = p.kind === "merge";
  return (
    <div
      className="flex flex-col gap-3 rounded-[14px] p-4"
      style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center gap-2">
        {isMerge ? (
          <GitMerge size={15} strokeWidth={2} style={{ color: "var(--color-accent)" }} />
        ) : (
          <PencilLine size={15} strokeWidth={2} style={{ color: "var(--color-accent)" }} />
        )}
        <span className="label-caps" style={{ color: "var(--color-accent)" }}>
          {isMerge ? "Merge notes" : "Refine note"}
        </span>
      </div>

      <h2
        className="text-[1.0625rem] font-medium tracking-[-0.005em]"
        style={{ color: "var(--color-ink)" }}
      >
        {isMerge ? p.intoTitle : p.targetTitle}
      </h2>

      {p.reason && (
        <p className="text-[0.8125rem]" style={{ color: "var(--color-muted)" }}>
          {p.reason}
        </p>
      )}

      {isMerge && p.targetTitles.length > 0 && (
        <p className="text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
          Combines: {p.targetTitles.join(" · ")}
        </p>
      )}

      <div
        className="rounded-[10px] p-3"
        style={{ background: "var(--color-surface-sunken)", border: "1px solid var(--color-line)" }}
      >
        <Markdown source={(isMerge ? p.mergedBody : p.proposedBody) ?? ""} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct(p, true)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 transition-all disabled:opacity-50"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-accent-ink)",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          <Check size={15} strokeWidth={2.4} />
          Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct(p, false)}
          className="inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 transition-colors disabled:opacity-50"
          style={{
            border: "1px solid var(--color-line)",
            color: "var(--color-muted)",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          <X size={15} strokeWidth={2.4} />
          Dismiss
        </button>
      </div>
    </div>
  );
}
