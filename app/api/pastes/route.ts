import { NextResponse } from "next/server";
import { createPasteRecord, getPasteUrlBase } from "@/lib/paste-store";
import { parsePasteCreateInput } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parsePasteCreateInput(body);

    const paste = await createPasteRecord({
      content: input.content,
      ttl_seconds: input.ttl_seconds,
      max_views: input.max_views,
      createdAtMs: Date.now(),
    });

    const baseUrl = getPasteUrlBase(request);

    return NextResponse.json(
      {
        id: paste.id,
        url: `${baseUrl}/p/${paste.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
