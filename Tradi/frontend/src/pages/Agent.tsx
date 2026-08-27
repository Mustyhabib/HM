import { useEffect, useRef, useState, useCallback } from "react";
import { BETA_MODE } from "../lib/beta";
import { getSubscriptionStatus } from "../lib/billing";
import { getSelectedProvider } from "../lib/apikeys";
import { subscribeToRun } from "../lib/runs";
import {
  createSession,
  listSessions,
  getSessionMessages,
  startSessionTurn,
  archiveSession,
  subscribeToSessionMessages,
  type AgentSession,
  type SessionMessage,
} from "../lib/sessions";
import { SessionList } from "../components/session/SessionList";
import { SessionMessageItem } from "../components/session/SessionMessage";

export function Agent() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [pendingProgress, setPendingProgress] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<boolean | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const blocked = !BETA_MODE && (subscription === null || subscription === false || apiKeyConfigured === false);

  useEffect(() => {
    if (BETA_MODE) return;
    getSubscriptionStatus()
      .then((s) => setSubscription(s.isActive))
      .catch(() => setSubscription(false));
    getSelectedProvider()
      .then((r) => setApiKeyConfigured(r?.configured ?? false))
      .catch(() => setApiKeyConfigured(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setSessionsLoading(true);
      const list = await listSessions();
      if (cancelled) return;
      setSessions(list);
      setSessionsLoading(false);
      if (list.length > 0) {
        setActiveSessionId(list[0].id);
      } else {
        const id = await createSession();
        if (cancelled) return;
        setActiveSessionId(id);
        setSessions([
          {
            id,
            title: "New Research Session",
            status: "active",
            last_active_at: new Date().toISOString(),
            turn_count: 0,
          },
        ]);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    setMessages([]);
    let cancelled = false;
    getSessionMessages(activeSessionId).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });
    const unsub = subscribeToSessionMessages(activeSessionId, (msg) => {
      if (cancelled) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.role === "assistant") {
        setPendingRunId(null);
        setPendingProgress(null);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!pendingRunId) return;
    const unsub = subscribeToRun(pendingRunId, (run) => {
      setPendingProgress((run as { progress_message?: string | null }).progress_message ?? null);
    });
    return unsub;
  }, [pendingRunId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingProgress]);

  const handleNewSession = useCallback(async () => {
    const id = await createSession();
    const newSession: AgentSession = {
      id,
      title: "New Research Session",
      status: "active",
      last_active_at: new Date().toISOString(),
      turn_count: 0,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
  }, []);

  const handleArchive = useCallback(
    async (sessionId: string) => {
      await archiveSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          await handleNewSession();
        }
      }
    },
    [activeSessionId, sessions, handleNewSession],
  );

  const handleSubmit = useCallback(async () => {
    const content = input.trim();
    if (!content || !activeSessionId || submitting || blocked) return;
    setSubmitting(true);
    setError(null);
    setInput("");

    const tempId = `temp-${Date.now()}`;
    const optimistic: SessionMessage = {
      id: tempId,
      session_id: activeSessionId,
      run_id: null,
      role: "user",
      content,
      tool_trail: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { run_id } = await startSessionTurn(
        activeSessionId,
        content,
        `${activeSessionId}-${Date.now()}`,
      );
      setPendingRunId(run_id);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, turn_count: s.turn_count + 1, last_active_at: new Date().toISOString() }
            : s,
        ),
      );
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      const message =
        code === "no_api_key"
          ? "No API key configured. Add one in Settings → Credentials."
          : code === "rate_limited"
            ? "Rate limit reached (30/hr). Try again shortly."
            : code === "session_not_found"
              ? "This session is no longer available."
              : "Failed to send message. Please try again.";
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  }, [input, activeSessionId, submitting, blocked]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <SessionList
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={(id) => setActiveSessionId(id)}
        onCreate={handleNewSession}
        onArchive={handleArchive}
        loading={sessionsLoading}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && !sessionsLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-4xl mb-4">📊</p>
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Start a research session
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                Ask the trading agent to research a strategy, backtest a hypothesis, or analyze
                market data. Each session remembers your conversation.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1;
            return (
              <SessionMessageItem
                key={msg.id}
                message={msg}
                isPending={isLastAssistant && pendingRunId !== null}
                progressText={isLastAssistant ? pendingProgress : null}
              />
            );
          })}

          {pendingRunId && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start mb-4">
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 bg-gray-100 dark:bg-gray-800">
                {pendingProgress ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic animate-pulse">
                    {pendingProgress}
                  </p>
                ) : (
                  <div className="flex gap-1 items-center py-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mx-6 mb-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {blocked && (
          <div className="mx-6 mb-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
            {apiKeyConfigured === false
              ? "Add an API key in Settings → Credentials to start."
              : "An active subscription is required to use the agent."}
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                blocked
                  ? "Configure your API key to start…"
                  : "Research a strategy, analyze a market, backtest a hypothesis…"
              }
              disabled={blocked || submitting}
              rows={3}
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!input.trim() || blocked || submitting}
              className="flex-shrink-0 px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "…" : "Send"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </div>
  );
}
