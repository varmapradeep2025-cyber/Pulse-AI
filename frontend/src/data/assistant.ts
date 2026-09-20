import type { AssistantMessage } from "../types/domain";

export const SAMPLE_TRANSCRIPT = "Mujhe government hospital ke baare mein information chahiye.";

export const SAMPLE_ASSISTANT_REPLIES = [
  "I can help you find healthcare services and explain the steps in simple language.",
  "Tell me what you need — for example, a hospital, a government scheme, or which documents to carry. I can help step by step.",
  "I can help you understand healthcare information. I am not a doctor and do not give medical advice.",
];

export const initialAssistantMessages: AssistantMessage[] = [
  {
    id: "msg-init-1",
    role: "assistant",
    text: "Namaste! I can help you find healthcare services and explain the steps in simple language. What can I help you with today?",
    timestamp: "10:00",
  },
  {
    id: "msg-init-2",
    role: "user",
    text: SAMPLE_TRANSCRIPT,
    timestamp: "10:01",
  },
  {
    id: "msg-init-3",
    role: "assistant",
    text: "I can help you find healthcare services and explain the steps in simple language.",
    timestamp: "10:01",
  },
];

export const MOCK_VIDEO_HINT = "Demo content only — no real healthcare data is used.";