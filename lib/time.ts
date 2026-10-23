export function getEffectiveNowMs(request?: Request): number {
  const modeEnabled = process.env.TEST_MODE === "1" || process.env.TEST_MODE === "true";

  if (!request || !modeEnabled) {
    return Date.now();
  }

  const headerValue = request.headers.get("x-test-now-ms");

  if (!headerValue) {
    return Date.now();
  }

  const numericValue = Number(headerValue);
  if (!Number.isInteger(numericValue)) {
    throw new Error("Invalid x-test-now-ms timestamp.");
  }

  return numericValue;
}

export function toIsoUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function toExpiryIso(nowMs: number, ttlSeconds?: number): string | null {
  if (ttlSeconds === undefined || ttlSeconds === null) {
    return null;
  }

  return toIsoUtc(nowMs + ttlSeconds * 1000);
}
