export type PasteCreateInput = {
  content: string;
  ttl_seconds?: number;
  max_views?: number;
};

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function parsePasteCreateInput(body: unknown): PasteCreateInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const record = body as Record<string, unknown>;

  if (typeof record.content !== "string") {
    throw new Error("content must be a string.");
  }

  if (record.content.length === 0) {
    throw new Error("content cannot be empty.");
  }

  if (record.ttl_seconds !== undefined && record.ttl_seconds !== null) {
    if (!isPositiveInteger(record.ttl_seconds)) {
      throw new Error("ttl_seconds must be an integer greater than or equal to 1.");
    }
  }

  if (record.max_views !== undefined && record.max_views !== null) {
    if (!isPositiveInteger(record.max_views)) {
      throw new Error("max_views must be an integer greater than or equal to 1.");
    }
  }

  return {
    content: record.content,
    ttl_seconds: record.ttl_seconds as number | undefined,
    max_views: record.max_views as number | undefined,
  };
}
