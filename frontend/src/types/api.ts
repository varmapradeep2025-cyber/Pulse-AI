export interface PingResponse {
  status: string;
  service: string;
  timestamp: string;
}

export function ping(): PingResponse {
  return {
    status: "ok",
    service: "pulse-ai-frontend",
    timestamp: new Date().toISOString(),
  };
}