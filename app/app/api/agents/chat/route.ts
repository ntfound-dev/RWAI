import { NextRequest, NextResponse } from "next/server";
import { backendNotConfigured, getAgentBackendUrl } from "../_backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const backendUrl = getAgentBackendUrl();
  if (!backendUrl) return backendNotConfigured();

  try {
    const body = await req.json() as {
      agentId?: string;
      agent_id?: string;
      messages?: Array<{ role: string; body: string }>;
    };

    const agentId = body.agent_id ?? body.agentId;
    if (!agentId) {
      return NextResponse.json({ error: "Missing agentId." }, { status: 400 });
    }

    const backend = await fetch(`${backendUrl}/api/agents/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        messages: body.messages ?? [],
      }),
      cache: "no-store",
    });

    const data = await backend.json().catch(() => ({}));
    if (!backend.ok) {
      return NextResponse.json(
        {
          error: data?.detail ?? data?.error ?? "Agent backend rejected the chat request.",
        },
        { status: backend.status },
      );
    }

    return NextResponse.json({
      reply: data.reply ?? "No response.",
      modelUsed: data.model_used,
      fallback: data.fallback ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Agent chat failed.",
        detail: error instanceof Error ? error.message : "Unknown chat error.",
      },
      { status: 502 },
    );
  }
}
