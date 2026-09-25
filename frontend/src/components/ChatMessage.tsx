import type { AssistantMessage } from "../types/domain";

interface ChatMessageProps {
  message: AssistantMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      <span className="chat-message__avatar" aria-hidden="true">
        {isUser ? "🙂" : "🏥"}
      </span>
      <div className="chat-message__body">
        <p className="chat-message__text" style={{ whiteSpace: "pre-line" }}>
          {isUser && message.source === "voice" && (
            <span className="chat-message__voice" aria-hidden="true">
              🎤{" "}
            </span>
          )}
          {message.text}
        </p>
        <span className="chat-message__meta">{message.timestamp}</span>
      </div>
    </div>
  );
}