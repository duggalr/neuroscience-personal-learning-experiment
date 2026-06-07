/*
  Tiny client-side auth token store. In prod the backend gates every API call behind a
  shared password (sent as `Authorization: Bearer <token>`). Locally the backend has no
  password set, so there's no token and nothing here ever fires — fully frictionless.
*/

const TOKEN_KEY = "neuro_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
