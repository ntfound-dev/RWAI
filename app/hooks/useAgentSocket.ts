"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAgentWsUrl } from "@/lib/agent-ws";

export interface AgentHeartbeat {
  type: "heartbeat";
  block: number;
  agents: Record<string, { online: boolean; reputation: number; erc8004_id: number }>;
  ts: number;
}

export function useAgentSocket() {
  const [connected, setConnected] = useState(false);
  const [heartbeat, setHeartbeat] = useState<AgentHeartbeat | null>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const ws = new WebSocket(`${getAgentWsUrl()}/ws`);
      wsRef.current = ws;

      ws.onopen    = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.type === "heartbeat") setHeartbeat(data as AgentHeartbeat);
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 4000);
      };
      ws.onerror = () => ws.close();
    } catch { /* WebSocket not available (SSR) */ }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return { connected, heartbeat };
}
