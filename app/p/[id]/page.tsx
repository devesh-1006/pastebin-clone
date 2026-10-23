import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { consumePasteView } from "@/lib/paste-store";
import { getEffectiveNowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function PastePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const currentRequest = new Request("http://localhost", {
    headers: requestHeaders,
  });
  const nowMs = getEffectiveNowMs(currentRequest);
  const paste = await consumePasteView(id, nowMs);

  if (!paste) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Paste</p>
          <h1 className="text-2xl font-bold text-slate-900">Shared paste</h1>
        </div>
        <Link href="/" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          New paste
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>ID: {paste.id}</span>
          {paste.max_views !== null ? <span>Views left: {Math.max(0, paste.max_views - paste.views)}</span> : <span>Unlimited views</span>}
          {paste.expires_at ? <span>Expires: {new Date(paste.expires_at).toISOString()}</span> : <span>No expiry</span>}
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-sm leading-7 text-slate-100">
          {paste.content}
        </pre>
      </section>
    </main>
  );
}
