export type AgentChatMessage = {
  role: string;
  body: string;
};

export type AgentChatResponse = {
  reply: string;
  modelUsed?: string;
  model_used?: string;
  fallback?: boolean;
};

export class AgentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
}

export async function agentApi<T>(path: string, init?: RequestInit): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`/api/agents${normalized}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.detail === "string"
          ? data.detail
          : `Agent API request failed with status ${response.status}`;
    throw new AgentApiError(message, response.status);
  }

  return data as T;
}
