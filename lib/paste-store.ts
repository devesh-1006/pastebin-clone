import { neon } from "@neondatabase/serverless";
import pgMem from "pg-mem";
import { randomUUID } from "crypto";

export type PasteRecord = {
  id: string;
  content: string;
  created_at: string;
  expires_at: string | null;
  max_views: number | null;
  views: number;
};

type NeonQueryResult = Record<string, unknown>[];

type MemoryPgClient = {
  connect: () => void;
  query: (query: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

let neonSql: ReturnType<typeof neon> | null = null;
let memoryDb: ReturnType<typeof pgMem.newDb> | null = null;
let memoryClient: MemoryPgClient | null = null;
let schemaReady = false;

function resetRuntimeDatabaseState() {
  neonSql = null;
  memoryDb = null;
  memoryClient = null;
  schemaReady = false;
}

function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
}

function createMemoryDatabase(): MemoryPgClient {
  if (!memoryDb) {
    memoryDb = pgMem.newDb();
    const pgAdapter = memoryDb.adapters.createPg();
    const client = new pgAdapter.Client();
    client.connect();
    memoryClient = client;
  }

  if (!memoryClient) {
    throw new Error("In-memory PostgreSQL client unavailable.");
  }

  return memoryClient;
}

function getNeonConnection(): ReturnType<typeof neon> | null {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }

  if (!neonSql) {
    neonSql = neon(databaseUrl);
  }

  return neonSql;
}

async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  const neonConnection = getNeonConnection();
  if (neonConnection) {
    const sql = neonConnection;
    await sql`
      CREATE TABLE IF NOT EXISTS pastes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        max_views INTEGER,
        views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
        CHECK (max_views IS NULL OR max_views >= 1)
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_pastes_expires_at ON pastes (expires_at);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_pastes_max_views ON pastes (max_views);`;
    schemaReady = true;
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be configured in production.");
  }

  const client = createMemoryDatabase();
  await client.query(`
    CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      max_views INTEGER,
      views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
      CHECK (max_views IS NULL OR max_views >= 1)
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pastes_expires_at ON pastes (expires_at);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_pastes_max_views ON pastes (max_views);`);
  schemaReady = true;
}

export async function resetPasteStore() {
  resetRuntimeDatabaseState();
  await ensureSchema();

  if (getNeonConnection()) {
    const sql = getNeonConnection()!;
    await sql`DELETE FROM pastes;`;
    return;
  }

  const client = createMemoryDatabase();
  await client.query(`DELETE FROM pastes;`);
}

export function getPasteUrlBase(requestOrUrl?: Request | string): string {
  if (typeof requestOrUrl === "string") {
    return requestOrUrl.replace(/\/$/, "");
  }

  if (requestOrUrl) {
    const url = new URL(requestOrUrl.url);
    return url.origin;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  return "";
}

export function generatePasteId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function createPasteRecord(input: {
  content: string;
  ttl_seconds?: number;
  max_views?: number;
  createdAtMs?: number;
}): Promise<PasteRecord> {
  await ensureSchema();
  const createdAtMs = input.createdAtMs ?? Date.now();
  const id = generatePasteId();
  const expiresAt = input.ttl_seconds ? new Date(createdAtMs + input.ttl_seconds * 1000).toISOString() : null;

  if (getNeonConnection()) {
    const sql = getNeonConnection()!;
    await sql`
      INSERT INTO pastes (id, content, created_at, expires_at, max_views, views)
      VALUES (${id}, ${input.content}, ${new Date(createdAtMs).toISOString()}, ${expiresAt}, ${input.max_views ?? null}, 0)
    `;
    return {
      id,
      content: input.content,
      created_at: new Date(createdAtMs).toISOString(),
      expires_at: expiresAt,
      max_views: input.max_views ?? null,
      views: 0,
    };
  }

  const client = createMemoryDatabase();
  await client.query(
    `INSERT INTO pastes (id, content, created_at, expires_at, max_views, views) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.content, new Date(createdAtMs).toISOString(), expiresAt, input.max_views ?? null, 0],
  );

  return {
    id,
    content: input.content,
    created_at: new Date(createdAtMs).toISOString(),
    expires_at: expiresAt,
    max_views: input.max_views ?? null,
    views: 0,
  };
}

export async function getPasteById(id: string, nowMs: number): Promise<PasteRecord | null> {
  await ensureSchema();

  if (getNeonConnection()) {
    const sql = getNeonConnection()!;
    const rows = await sql`
      SELECT id, content, created_at, expires_at, max_views, views
      FROM pastes
      WHERE id = ${id}
    ` as unknown as NeonQueryResult;

    const row = rows[0];
    if (!row) return null;
    const expiresAt = row.expires_at as string | null | undefined;
    const maxViews = row.max_views as number | null | undefined;
    const views = Number(row.views ?? 0);
    const isExpired = expiresAt !== null && expiresAt !== undefined && new Date(expiresAt).getTime() <= nowMs;
    const pastViewLimit = maxViews !== null && maxViews !== undefined && views >= maxViews;
    if (isExpired || pastViewLimit) return null;

    return {
      id: String(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      expires_at: expiresAt ? String(expiresAt) : null,
      max_views: maxViews === null || maxViews === undefined ? null : Number(maxViews),
      views,
    };
  }

  const client = createMemoryDatabase();
  const result = await client.query(
    `SELECT id, content, created_at, expires_at, max_views, views FROM pastes WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;

  const expiresAt = row.expires_at as string | null | undefined;
  const maxViews = row.max_views as number | null | undefined;
  const views = Number(row.views ?? 0);
  const isExpired = expiresAt !== null && expiresAt !== undefined && new Date(expiresAt).getTime() <= nowMs;
  const pastViewLimit = maxViews !== null && maxViews !== undefined && views >= maxViews;
  if (isExpired || pastViewLimit) return null;

  return {
    id: String(row.id),
    content: String(row.content),
    created_at: String(row.created_at),
    expires_at: expiresAt ? String(expiresAt) : null,
    max_views: maxViews === null || maxViews === undefined ? null : Number(maxViews),
    views,
  };
}

export async function consumePasteView(id: string, nowMs: number): Promise<PasteRecord | null> {
  await ensureSchema();
  const timestamp = new Date(nowMs).toISOString();

  if (getNeonConnection()) {
    const sql = getNeonConnection()!;
    const rows = await sql`
      UPDATE pastes
      SET views = views + 1
      WHERE id = ${id}
        AND (expires_at IS NULL OR expires_at > ${timestamp})
        AND (max_views IS NULL OR views < max_views)
      RETURNING id, content, created_at, expires_at, max_views, views
    ` as unknown as NeonQueryResult;

    const row = rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      expires_at: row.expires_at ? String(row.expires_at) : null,
      max_views: row.max_views === null || row.max_views === undefined ? null : Number(row.max_views),
      views: Number(row.views ?? 0),
    };
  }

  const client = createMemoryDatabase();
  const result = await client.query(
    `UPDATE pastes SET views = views + 1 WHERE id = $1 AND (expires_at IS NULL OR expires_at > $2) AND (max_views IS NULL OR views < max_views) RETURNING id, content, created_at, expires_at, max_views, views`,
    [id, timestamp],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    content: String(row.content),
    created_at: String(row.created_at),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    max_views: row.max_views === null || row.max_views === undefined ? null : Number(row.max_views),
    views: Number(row.views ?? 0),
  };
}

export async function getStorageHealthCheck(): Promise<boolean> {
  try {
    const neonConnection = getNeonConnection();
    if (neonConnection) {
      const sql = neonConnection;
      await sql`SELECT 1 as ok`;
      return true;
    }

    if (process.env.NODE_ENV === "production") {
      return false;
    }

    const client = createMemoryDatabase();
    const result = await client.query(`SELECT 1 as ok`);
    return Array.isArray(result.rows) && result.rows.length > 0;
  } catch {
    return false;
  }
}
