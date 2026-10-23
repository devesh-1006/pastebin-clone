import { NextResponse } from "next/server";
import { consumePasteView } from "@/lib/paste-store";
import { getEffectiveNowMs } from "@/lib/time";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const { id } = await Promise.resolve(context.params);
    const nowMs = getEffectiveNowMs(request);
    const paste = await consumePasteView(id, nowMs);

    if (!paste) {
      return NextResponse.json({ error: "Paste not found, expired, or view limit reached." }, { status: 404 });
    }

    const remainingViews = paste.max_views === null ? null : Math.max(0, paste.max_views - paste.views);

    return NextResponse.json(
      {
        content: paste.content,
        remaining_views: remainingViews,
        expires_at: paste.expires_at,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
