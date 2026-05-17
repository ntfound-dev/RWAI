export function getAgentWsUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8001";
  // http → ws, https → wss
  return base.replace(/^http/, "ws").replace(/\/$/, "");
}
