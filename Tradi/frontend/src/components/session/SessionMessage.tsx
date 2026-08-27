import { Link } from "react-router";
import type { SessionMessage as SessionMessageType } from "../../lib/sessions";
import { ToolActivityLine } from "./ToolActivityLine";

interface SessionMessageProps {
  message: SessionMessageType;
  /** Progress text for the pending turn (shown below last assistant bubble) */
  progressText?: string | null;
  /** True when this is the most recent message and a run is in flight */
  isPending?: boolean;
}

export function SessionMessageItem({ message, progressText, isPending }: SessionMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

        {!isUser && message.tool_trail.length > 0 && (
          <ToolActivityLine entries={message.tool_trail} />
        )}

        {isPending && progressText && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic animate-pulse">
            {progressText}
          </p>
        )}

        {!isUser && message.run_id && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <Link
              to={`/run/${message.run_id}`}
              className="text-xs text-blue-500 hover:underline"
            >
              Full run →
            </Link>
          </div>
        )}

        <p className={`mt-1 text-[10px] ${isUser ? "text-blue-200" : "text-gray-400"}`}>
          {new Date(message.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
