import { NextRequest, NextResponse } from "next/server";

const DEV_AGENT_API_URL = "http://localhost:8001";

export function getAgentBackendUrl() {
  const configured = process.env.AGENT_API_URL ?? process.env.NEXT_PUBLIC_AGENT_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return DEV_AGENT_API_URL;
  return "";
}

export function backendNotConfigured() {
  return NextResponse.json(
    {
      error: "Agent backend is not configured.",
      hint: "Set AGENT_API_URL to your FastAPI production URL.",
    },
    { status: 503 },
  );
}

export async function forwardAgentRequest(req: NextRequest, backendPath: string) {
  const backendUrl = getAgentBackendUrl();
  if (!backendUrl) return backendNotConfigured();

  const incomingUrl = new URL(req.url);
  const targetUrl = new URL(`${backendUrl}${backendPath.startsWith("/") ? backendPath : `/${backendPath}`}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", req.headers.get("accept") ?? "application/json");

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const backend = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const responseType = backend.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);

    return new NextResponse(backend.body, {
      status: backend.status,
      statusText: backend.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Agent backend unreachable.",
        detail: error instanceof Error ? error.message : "Unknown backend connection error.",
      },
      { status: 502 },
    );
  }
}
