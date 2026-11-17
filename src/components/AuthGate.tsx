"use client";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";

type Status = "loading" | "locked" | "authed" | "unconfigured";

function LoginForm({ onSuccess, notice }: { onSuccess: () => void; notice?: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setCode("");
        onSuccess();
      } else {
        setError(data?.error || "Login failed.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">GW Research Questionnaire Builder 2026</h1>
      <p className="text-sm text-gray-600">Enter the class access code to continue.</p>
      {notice && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{notice}</p>}
      <input
        type="password"
        autoComplete="off"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Access code"
        aria-label="Access code"
        className="w-full rounded-md border px-3 py-2"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  // Keep the app mounted if the session merely expires, so unsaved work isn't lost.
  const [wasAuthed, setWasAuthed] = useState(false);
  const [expired, setExpired] = useState(false);
  const originalFetch = useRef<typeof fetch | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await res.json();
      if (!data?.configured) setStatus("unconfigured");
      else if (data.authenticated) {
        setStatus("authed");
        setWasAuthed(true);
        setExpired(false);
      } else setStatus("locked");
    } catch {
      setStatus("locked");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // If any API call comes back 401, the session expired: show the login overlay.
  useEffect(() => {
    const orig = window.fetch.bind(window);
    originalFetch.current = orig;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await orig(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].pathname : (args[0] as Request).url;
      if (res.status === 401 && url.startsWith("/api/") && !url.startsWith("/api/auth/")) {
        setExpired(true);
        setStatus("locked");
      }
      return res;
    };
    return () => {
      window.fetch = orig;
    };
  }, []);

  async function logout() {
    if (!window.confirm("Log out? Any unsaved project will be cleared from this screen — use Save Project (JSON) first.")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setWasAuthed(false);
    setExpired(false);
    setStatus("locked");
  }

  if (status === "loading") {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  if (status === "unconfigured") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="max-w-sm rounded border bg-white p-4 text-sm text-red-700">
          Access protection is not configured on the server (ACCESS_CODE is missing). Please contact the teacher.
        </p>
      </div>
    );
  }

  return (
    <>
      {wasAuthed && (
        <div className="mx-auto flex max-w-4xl justify-end px-6 pt-3">
          <button
            type="button"
            onClick={logout}
            className="rounded-md border bg-white px-3 py-1 text-xs font-medium hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      )}
      {wasAuthed && children}
      {status === "locked" && (
        <div
          className={
            wasAuthed
              ? "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
              : "flex min-h-screen items-center justify-center p-6"
          }
        >
          <LoginForm
            onSuccess={refresh}
            notice={expired ? "Your session has expired. Log in again — your work on screen is kept." : undefined}
          />
        </div>
      )}
    </>
  );
}
