"use client";

import Link from "next/link";
import { ErrorScreen } from "@/components/Status";
import { QuizRunner } from "@/components/QuizRunner";
import { generateQuiz } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";

export function QuizClient({
  conceptId,
  review = false,
}: {
  conceptId: string;
  review?: boolean;
}) {
  const { data, error, loading, reload } = useAsync(() =>
    generateQuiz(conceptId, review)
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="spinner" aria-label="Loading" />
        <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          {review ? "Writing your review…" : "Writing your quiz…"}
        </p>
        <Link href="/" className="text-[0.8125rem]" style={{ color: "var(--color-faint)" }}>
          Cancel
        </Link>
      </div>
    );
  }
  if (error || !data) return <ErrorScreen message={error ?? undefined} onRetry={reload} />;

  return <QuizRunner quiz={data} review={review} />;
}
