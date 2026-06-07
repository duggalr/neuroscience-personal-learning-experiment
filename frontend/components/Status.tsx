import { BottomNav } from "./BottomNav";

export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 items-center justify-center">
        <span className="spinner" aria-label="Loading" />
      </main>
      <BottomNav />
    </div>
  );
}

export function ErrorScreen({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="label-caps" style={{ color: "var(--color-incorrect)" }}>
          Can&rsquo;t reach the backend
        </p>
        <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
          {message ??
            "Make sure the tutor backend is running on port 8000, then retry."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-[10px] px-5 py-3 transition-all"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-accent-ink)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              transitionDuration: "var(--duration-base)",
              transitionTimingFunction: "var(--ease-out-quart)",
            }}
          >
            Retry
          </button>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
