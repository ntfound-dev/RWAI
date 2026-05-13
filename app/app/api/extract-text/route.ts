import { NextRequest, NextResponse } from "next/server";
import { getAgentBackendUrl } from "@/app/api/agents/_backend";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const backendUrl = getAgentBackendUrl();

  // Forward multipart form directly to Python backend
  if (backendUrl) {
    try {
      const body = await req.arrayBuffer();
      const contentType = req.headers.get("content-type") ?? "";
      const res = await fetch(`${backendUrl}/api/agents/extract-text`, {
        method: "POST",
        headers: { "content-type": contentType },
        body,
      });
      if (res.ok) {
        return new NextResponse(res.body, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {
      // fall through to client-side fallback below
    }
  }

  // Fallback: plain text files only (PDF/DOCX will show as unreadable)
  const formData = await req.formData();
  const results: Array<{ name: string; text: string }> = [];
  for (const [, value] of Array.from(formData.entries())) {
    if (!(value instanceof File)) continue;
    const buf = Buffer.from(await value.arrayBuffer());
    const raw = buf.toString("utf-8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").trim();
    results.push({
      name: value.name,
      text: raw.length > 80 ? raw.slice(0, 12_000) : `[Agent backend offline — cannot extract ${value.name}]`,
    });
  }
  return NextResponse.json({ results });
}
