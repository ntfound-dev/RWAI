import { NextRequest } from "next/server";
import { forwardAgentRequest } from "../_backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

async function handler(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forwardAgentRequest(req, `/api/agents/${path?.join("/") ?? ""}`);
}

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
