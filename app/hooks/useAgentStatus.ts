"use client";

import { useEffect, useState } from "react";

export interface AgentStatus {
  online: boolean;
  reputation: number;   // 0–5 scale
  localScore: number;   // 0–100
  autonomyLevel: number;
  actionCount: number;
  erc8004_id: number;
}

export type AgentStatusMap = Record<string, AgentStatus>;

export function useAgentStatus() {
  const [data, setData]       = useState<AgentStatusMap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents/status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
