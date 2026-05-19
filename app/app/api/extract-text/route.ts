import { NextRequest, NextResponse } from "next/server";
import { getAgentBackendUrl } from "@/app/api/agents/_backend";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const backendUrl = getAgentBackendUrl();
  const contentType = req.headers.get("content-type") ?? "";
  const apiKey = process.env.BACKEND_API_KEY;

  // Forward multipart form directly to Python backend (with auth)
  if (backendUrl) {
    try {
      const body = await req.arrayBuffer();
      const fwdHeaders: Record<string, string> = { "content-type": contentType };
      if (apiKey) fwdHeaders["x-internal-api-key"] = apiKey;
      const res = await fetch(`${backendUrl}/api/agents/extract-text`, {
        method: "POST",
        headers: fwdHeaders,
        body,
      });
      if (res.ok) {
        return new NextResponse(res.body, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // Backend returned error — log status and fall through
      console.error("[extract-text] backend returned", res.status);
    } catch (err) {
      console.error("[extract-text] backend unreachable:", err);
    }
  }

  // Fallback: re-parse the formData (only works if body not yet consumed above,
  // i.e. backendUrl was empty). Returns unreadable stub for binary files.
  try {
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
  } catch {
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
