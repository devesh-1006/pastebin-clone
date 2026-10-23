import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Paste unavailable</p>
        <h1 className="mb-4 text-3xl font-bold text-slate-900">This paste was not found, expired, or has reached its view limit.</h1>
        <p className="mb-6 text-slate-600">
          Pastebin links are temporary when they have TTL or view caps. Try creating a new paste instead.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Create a new paste
        </Link>
      </div>
    </main>
  );
}
