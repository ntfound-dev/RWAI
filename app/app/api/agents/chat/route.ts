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
      walletAddress?: string | null;
      wallet_address?: string | null;
    };

    const agentId = body.agent_id ?? body.agentId;
    if (!agentId) {
      return NextResponse.json({ error: "Missing agentId." }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const apiKey = process.env.BACKEND_API_KEY;
    if (apiKey) headers["x-internal-api-key"] = apiKey;
    const realIp = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
    if (realIp) headers["x-forwarded-for"] = realIp;

    const backend = await fetch(`${backendUrl}/api/agents/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        agent_id: agentId,
        messages: body.messages ?? [],
        wallet_address: body.wallet_address ?? body.walletAddress ?? null,
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
      model_used: data.model_used,
      fallback: data.fallback ?? false,
      on_chain_tx: data.on_chain_tx ?? "",
      onChainTx: data.on_chain_tx ?? "",
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
