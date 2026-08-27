import type { AgentSession } from "../../lib/sessions";

interface SessionListProps {
  sessions: AgentSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
  loading: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onArchive,
  loading,
}: SessionListProps) {
  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sessions</h2>
        <button
          type="button"
          onClick={onCreate}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className="text-xs text-gray-400 px-4 py-3">Loading…</p>}
        {!loading && sessions.length === 0 && (
          <p className="text-xs text-gray-400 px-4 py-3">No sessions yet.</p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex items-start gap-2 px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
              session.id === activeId ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
            onClick={() => onSelect(session.id)}
          >
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm truncate font-medium ${
                  session.id === activeId
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {session.title}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {session.turn_count} turn{session.turn_count !== 1 ? "s" : ""} ·{" "}
                {relativeTime(session.last_active_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-all"
              title="Archive session"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
