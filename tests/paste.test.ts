import { beforeEach, describe, expect, it } from "vitest";
import { GET as getHealth } from "@/app/api/healthz/route";
import { POST as createPaste } from "@/app/api/pastes/route";
import { GET as getPaste } from "@/app/api/pastes/[id]/route";
import { resetPasteStore } from "@/lib/paste-store";

async function createPasteRequest(body: Record<string, unknown>) {
  const response = await createPaste(
    new Request("http://localhost/api/pastes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  return response;
}

describe("pastebin app", () => {
  beforeEach(async () => {
    process.env.TEST_MODE = "1";
    await resetPasteStore();
  });

  it("returns a healthy response when the database is reachable", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true });
  });

  it("returns a non-200 response when the persistence layer is unavailable", async () => {
    const originalUrl = process.env.DATABASE_URL;
    const originalNeon = process.env.NEON_DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://bad:bad@localhost:5432/fake";
    delete process.env.NEON_DATABASE_URL;

    try {
      const response = await getHealth();
      expect(response.status).toBeGreaterThanOrEqual(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
      if (originalNeon === undefined) delete process.env.NEON_DATABASE_URL;
      else process.env.NEON_DATABASE_URL = originalNeon;
    }
  });

  it("creates a valid paste and returns a shareable URL", async () => {
    const response = await createPasteRequest({
      content: "Hello world\nSecond line",
      ttl_seconds: 60,
      max_views: 2,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTruthy();
    expect(body.url).toContain("/p/");
  });

  it("rejects empty content and invalid TTL values", async () => {
    const emptyResponse = await createPasteRequest({ content: "" });
    expect(emptyResponse.status).toBe(400);

    const ttlResponse = await createPasteRequest({ content: "abc", ttl_seconds: 0 });
    expect(ttlResponse.status).toBe(400);

    const viewResponse = await createPasteRequest({ content: "abc", max_views: 0 });
    expect(viewResponse.status).toBe(400);
  });

  it("preserves content safely and returns original payload on retrieval", async () => {
    const createResponse = await createPasteRequest({
      content: '<script>alert("hi")</script>\n"quoted" & unicode → café',
      max_views: 3,
    });

    const createData = await createResponse.json();

    const fetchResponse = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(Date.now()) },
      }),
      { params: { id: createData.id } },
    );

    expect(fetchResponse.status).toBe(200);
    const body = await fetchResponse.json();
    expect(body.content).toContain("<script>");
    expect(body.content).toContain("unicode → café");
    expect(body.remaining_views).toBe(2);
  });

  it("returns 404 for unknown paste ids", async () => {
    const response = await getPaste(
      new Request("http://localhost/api/pastes/missing", {
        headers: { "x-test-now-ms": String(Date.now()) },
      }),
      { params: { id: "missing" } },
    );

    expect(response.status).toBe(404);
  });

  it("applies view-limit enforcement and prevents negative remaining counts", async () => {
    const createResponse = await createPasteRequest({ content: "limit", max_views: 2 });
    const createData = await createResponse.json();

    const first = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(Date.now()) },
      }),
      { params: { id: createData.id } },
    );
    expect(first.status).toBe(200);

    const second = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(Date.now()) },
      }),
      { params: { id: createData.id } },
    );
    expect(second.status).toBe(200);

    const third = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(Date.now()) },
      }),
      { params: { id: createData.id } },
    );
    expect(third.status).toBe(404);

    const body = await second.json();
    expect(body.remaining_views).toBe(0);
  });

  it("handles TTL expiry exactly at and after expiry time using test mode overrides", async () => {
    const createResponse = await createPasteRequest({ content: "expiring", ttl_seconds: 10 });
    const createData = await createResponse.json();
    const baseNow = Date.now();

    const beforeExpiry = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(baseNow + 5000) },
      }),
      { params: { id: createData.id } },
    );
    expect(beforeExpiry.status).toBe(200);

    const exactExpiry = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(baseNow + 10000) },
      }),
      { params: { id: createData.id } },
    );
    expect(exactExpiry.status).toBe(404);

    const afterExpiry = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": String(baseNow + 20000) },
      }),
      { params: { id: createData.id } },
    );
    expect(afterExpiry.status).toBe(404);
  });

  it("ignores x-test-now-ms when test mode is disabled", async () => {
    process.env.TEST_MODE = "0";

    const createResponse = await createPasteRequest({ content: "normal", ttl_seconds: 1 });
    const createData = await createResponse.json();

    const response = await getPaste(
      new Request(`http://localhost/api/pastes/${createData.id}`, {
        headers: { "x-test-now-ms": "0" },
      }),
      { params: { id: createData.id } },
    );

    expect(response.status).toBe(200);
  });
});
