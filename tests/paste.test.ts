import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PastePage from "@/app/p/[id]/page";
import { GET as getHealth } from "@/app/api/healthz/route";
import { POST as createPaste } from "@/app/api/pastes/route";
import { GET as getPaste } from "@/app/api/pastes/[id]/route";
import { resetPasteStore } from "@/lib/paste-store";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

async function createPasteRequest(body: unknown) {
  return createPaste(
    new Request("https://pastebin.test/api/pastes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function fetchPasteRequest(id: string, nowMs = Date.now()) {
  return getPaste(
    new Request(`https://pastebin.test/api/pastes/${id}`, {
      headers: { "x-test-now-ms": String(nowMs) },
    }),
    { params: { id } },
  );
}

describe("pastebin app", () => {
  beforeEach(async () => {
    process.env.TEST_MODE = "1";
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.NEON_DATABASE_URL;
    await resetPasteStore();
  });

  it("returns healthy JSON and the correct content type", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("does not report in-memory storage as healthy in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      const response = await getHealth();
      expect(response.status).toBe(503);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns unhealthy JSON when the persistence layer is unavailable", async () => {
    process.env.DATABASE_URL = "invalid";

    const response = await getHealth();
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("creates a paste and returns its ID and absolute share URL", async () => {
    const response = await createPasteRequest({
      content: "Hello world\nSecond line",
      ttl_seconds: 60,
      max_views: 2,
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.json();
    expect(body.id).toMatch(/^[0-9a-f]{16}$/);
    expect(body.url).toBe(`https://pastebin.test/p/${body.id}`);
  });

  it("rejects malformed JSON and invalid content, TTL, and max-view values", async () => {
    const malformed = await createPaste(
      new Request("https://pastebin.test/api/pastes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("Content-Type")).toContain("application/json");
    await expect(malformed.json()).resolves.toHaveProperty("error");

    for (const body of [
      null,
      {},
      { content: "" },
      { content: 42 },
      { content: "text", ttl_seconds: 0 },
      { content: "text", ttl_seconds: -1 },
      { content: "text", ttl_seconds: 1.5 },
      { content: "text", ttl_seconds: "10" },
      { content: "text", max_views: 0 },
      { content: "text", max_views: -1 },
      { content: "text", max_views: 1.5 },
      { content: "text", max_views: "2" },
    ]) {
      const response = await createPasteRequest(body);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      await expect(response.json()).resolves.toHaveProperty("error");
    }
  });

  it("returns original content and nullable metadata from the fetch API", async () => {
    const content = '<script>alert("hi")</script>\n"quoted" & unicode → café';
    const created = await createPasteRequest({ content, max_views: 3 });
    const { id } = await created.json();

    const response = await fetchPasteRequest(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      content,
      remaining_views: 2,
      expires_at: null,
    });
  });

  it("returns JSON 404 responses for missing and expired pastes", async () => {
    const missing = await fetchPasteRequest("missing");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Type")).toContain("application/json");
    await expect(missing.json()).resolves.toHaveProperty("error");

    const created = await createPasteRequest({ content: "expired", ttl_seconds: 1 });
    const { id } = await created.json();
    const expired = await fetchPasteRequest(id, Date.now() + 1000);
    expect(expired.status).toBe(404);
    expect(expired.headers.get("Content-Type")).toContain("application/json");
  });

  it("allows unlimited views when max_views is not specified", async () => {
    const created = await createPasteRequest({ content: "unlimited" });
    const { id } = await created.json();

    for (let index = 0; index < 3; index += 1) {
      const response = await fetchPasteRequest(id);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ remaining_views: null });
    }
  });

  it("enforces max_views equal to one", async () => {
    const created = await createPasteRequest({ content: "one view", max_views: 1 });
    const { id } = await created.json();

    expect((await fetchPasteRequest(id)).status).toBe(200);
    expect((await fetchPasteRequest(id)).status).toBe(404);
  });

  it("enforces max_views equal to two without negative remaining views", async () => {
    const created = await createPasteRequest({ content: "two views", max_views: 2 });
    const { id } = await created.json();

    const first = await fetchPasteRequest(id);
    const second = await fetchPasteRequest(id);
    const third = await fetchPasteRequest(id);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ remaining_views: 1 });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ remaining_views: 0 });
    expect(third.status).toBe(404);
  });

  it("applies TTL and max_views constraints together", async () => {
    const created = await createPasteRequest({ content: "combined", ttl_seconds: 10, max_views: 2 });
    const { id } = await created.json();
    const baseNow = Date.now();

    expect((await fetchPasteRequest(id, baseNow + 1000)).status).toBe(200);
    expect((await fetchPasteRequest(id, baseNow + 2000)).status).toBe(200);
    expect((await fetchPasteRequest(id, baseNow + 3000)).status).toBe(404);
  });

  it("does not exceed max_views under concurrent requests", async () => {
    const created = await createPasteRequest({ content: "concurrent", max_views: 2 });
    const { id } = await created.json();
    const responses = await Promise.all(Array.from({ length: 12 }, () => fetchPasteRequest(id)));

    expect(responses.filter((response) => response.status === 200)).toHaveLength(2);
    expect(responses.filter((response) => response.status === 404)).toHaveLength(10);
  });

  it("renders HTML text safely and counts the viewer as a successful view", async () => {
    const content = '<script>alert("xss")</script> & safe text';
    const created = await createPasteRequest({ content, max_views: 1 });
    const { id } = await created.json();

    const page = await PastePage({ params: Promise.resolve({ id }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; safe text");
    expect(html).not.toContain("<script>");
    expect((await fetchPasteRequest(id)).status).toBe(404);
  });

  it("returns a not-found result from the HTML viewer for unavailable pastes", async () => {
    await expect(PastePage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });

  it("uses simulated time for expiry and ignores it when test mode is disabled", async () => {
    const created = await createPasteRequest({ content: "expiring", ttl_seconds: 10 });
    const { id } = await created.json();
    const baseNow = Date.now();

    expect((await fetchPasteRequest(id, baseNow + 5000)).status).toBe(200);
    expect((await fetchPasteRequest(id, baseNow + 10000)).status).toBe(404);
    expect((await fetchPasteRequest(id, baseNow + 20000)).status).toBe(404);

    process.env.TEST_MODE = "0";
    const unexpired = await createPasteRequest({ content: "normal", ttl_seconds: 60 });
    const unexpiredId = (await unexpired.json()).id as string;
    const ignoredOverride = await getPaste(
      new Request(`https://pastebin.test/api/pastes/${unexpiredId}`, {
        headers: { "x-test-now-ms": "0" },
      }),
      { params: { id: unexpiredId } },
    );
    expect(ignoredOverride.status).toBe(200);
  });

  it("completes the health check within five seconds", async () => {
    const startedAt = Date.now();
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  }, 10000);
});
