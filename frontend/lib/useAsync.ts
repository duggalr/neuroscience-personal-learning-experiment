"use client";

import { useCallback, useEffect, useState } from "react";

type State<T> = { data: T | null; error: string | null; loading: boolean };

// Minimal data-fetch hook: runs `fn` on mount, exposes a stable `reload`.
export function useAsync<T>(fn: () => Promise<T>): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch(
        (e) =>
          active &&
          setState({ data: null, error: String(e?.message ?? e), loading: false })
      );
    return () => {
      active = false;
    };
    // fn identity is stable enough for our call sites; nonce forces re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  return { ...state, reload };
}
