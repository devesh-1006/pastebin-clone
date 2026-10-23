"use client";

import { FormEvent, useState } from "react";

export default function HomePage() {
  const [content, setContent] = useState("Hello world\nThis is a sample paste.");
  const [ttlSeconds, setTtlSeconds] = useState("");
  const [maxViews, setMaxViews] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setLink("");

    try {
      const payload: Record<string, string | number> = { content };

      if (ttlSeconds.trim() !== "") {
        payload.ttl_seconds = Number(ttlSeconds);
      }

      if (maxViews.trim() !== "") {
        payload.max_views = Number(maxViews);
      }

      const response = await fetch("/api/pastes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Paste creation failed.");
      }

      setLink(data.url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Pastebin</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Share text instantly</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Store notes, code snippets, or logs and share a secure link. Optional TTL and view limits keep the paste from lingering forever.
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <label htmlFor="paste-content" className="mb-2 block text-sm font-medium text-slate-700">
            Paste content
          </label>
          <textarea
            id="paste-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={16}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-4 font-mono text-sm text-slate-800 shadow-inner outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            placeholder="Paste or type any text here..."
            aria-label="Paste content"
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ttl-seconds" className="mb-2 block text-sm font-medium text-slate-700">
                TTL in seconds (optional)
              </label>
              <input
                id="ttl-seconds"
                type="number"
                min={1}
                value={ttlSeconds}
                onChange={(event) => setTtlSeconds(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder="60"
              />
            </div>

            <div>
              <label htmlFor="max-views" className="mb-2 block text-sm font-medium text-slate-700">
                Max views (optional)
              </label>
              <input
                id="max-views"
                type="number"
                min={1}
                value={maxViews}
                onChange={(event) => setMaxViews(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder="5"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading || content.trim().length === 0}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Creating paste..." : "Create Paste"}
          </button>
        </form>

        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">Share link</h2>
          <p className="mt-3 text-sm text-slate-600">A paste is ready to share as soon as it is created.</p>

          {link ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 break-all">{link}</div>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Copy link
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              Your paste URL will appear here after creation.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
