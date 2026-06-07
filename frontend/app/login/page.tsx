"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { setToken, clearToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Validate by hitting a protected endpoint with the password as the bearer token.
      const res = await fetch(`${API_BASE}/today`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        setToken(password);
        router.replace("/");
      } else if (res.status === 401) {
        clearToken();
        setError("Incorrect password.");
      } else {
        setError(`Server error (${res.status}).`);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1
          className="text-[1.5rem] font-medium tracking-[-0.015em]"
          style={{ color: "var(--color-ink)" }}
        >
          Neuro
        </h1>
        <p className="mt-1.5 text-[0.875rem]" style={{ color: "var(--color-muted)" }}>
          Enter your password to continue.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-[12px] px-4 py-3 outline-none transition-colors"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              fontSize: "var(--text-base)",
            }}
          />
          {error && (
            <p className="text-[0.8125rem]" style={{ color: "var(--color-incorrect)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!password.trim() || busy}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-5 py-3.5 transition-all disabled:opacity-35"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-accent-ink)",
              fontSize: "0.9375rem",
              fontWeight: 600,
            }}
          >
            {busy ? (
              <span
                className="spinner"
                style={{ width: 16, height: 16, borderTopColor: "var(--color-accent-ink)" }}
              />
            ) : (
              <>
                Continue
                <ArrowRight size={17} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
