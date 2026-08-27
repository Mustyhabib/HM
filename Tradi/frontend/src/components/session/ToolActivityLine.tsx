import { useState } from "react";
import type { ToolTrailEntry } from "../../lib/sessions";

interface ToolActivityLineProps {
  entries: ToolTrailEntry[];
}

const TOOL_ICONS: Record<string, string> = {
  backtest: "📊",
  get_market_data: "📈",
  web_search: "🌐",
  alpha_zoo: "🦁",
  get_stock_news: "📰",
  screen_market: "🔍",
  technical_indicators: "📉",
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? "🔧";
}

function formatMs(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ToolActivityLine({ entries }: ToolActivityLineProps) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const preview = entries.slice(0, 3);
  const rest = entries.length - 3;

  return (
    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <span>
          {preview.map((e) => toolIcon(e.tool)).join(" ")}
          {" "}
          {preview.map((e) => e.tool).join(", ")}
          {rest > 0 && ` (+${rest} more)`}
        </span>
        <span className="ml-1">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-1 pl-2 border-l border-gray-200 dark:border-gray-700">
          {entries.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <span>{toolIcon(e.tool)}</span>
              <div className="flex-1 min-w-0">
                <span className={`font-medium ${e.status === "error" ? "text-red-500" : ""}`}>
                  {e.tool}
                </span>
                {e.elapsed_ms !== null && (
                  <span className="ml-1 text-gray-400">({formatMs(e.elapsed_ms)})</span>
                )}
                {e.preview && (
                  <p className="mt-0.5 text-gray-400 truncate">{e.preview}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
