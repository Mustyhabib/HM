import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  OctagonX,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api, type LiveBrokerStatus, type LiveMandateLimits, type LiveStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const RUNTIME_POLL_INTERVAL_MS = 15_000;
const RUNTIME_CLOCK_INTERVAL_MS = 1_000;

export function Runtime() {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(false);

  const loadStatus = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    activeRequestRef.current = { id: requestId, controller };

    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const next = await api.getLiveStatus(controller.signal);
      if (!mountedRef.current || !isCurrentStatusRequest(activeRequestRef.current, requestId, controller)) return;
      setStatus(next);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!mountedRef.current || !isCurrentStatusRequest(activeRequestRef.current, requestId, controller)) return;
      console.warn("Failed to load runtime status", err);
      setStatus(null);
      setError(err instanceof Error ? err.message : "Status unavailable.");
    } finally {
      // Avoid return-in-finally (no-unsafe-finally): guard with an if so
      // exceptions from try/catch survive.
      if (mountedRef.current && isCurrentStatusRequest(activeRequestRef.current, requestId, controller)) {
        activeRequestRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadStatus("initial");
    const pollTimer = window.setInterval(() => loadStatus("refresh"), RUNTIME_POLL_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNowMs(Date.now()), RUNTIME_CLOCK_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
    };
  }, [loadStatus]);

  const summary = useMemo(() => summarizeRuntime(status), [status]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* Beta notice — live trading is mandate-gated and not yet active */}
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Beta notice:</span>{" "}
          Runtime monitors live trading session status. Live execution is mandate-gated
          and not yet active — status tiles below reflect the platform's broker-safety
          state, not an active trading session.
        </div>

        <section className="flex flex-col gap-4 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Live Monitor
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Runtime</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                System status and mandate compliance for the live trading subsystem. Polls{" "}
                <span className="font-mono">/live/status</span> every 15 seconds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadStatus("refresh")}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2 text-sm font-medium transition hover:bg-muted/60 disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </section>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl border border-border/60 bg-card shadow-sm" />
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <section className="rounded-xl border border-warning/30 bg-warning/5 p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium text-warning">
              <AlertTriangle className="h-5 w-5" />
              Status unavailable
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Ensure the live trading worker is running and the API is reachable.
            </p>
          </section>
        ) : null}

        {!loading && !error && status ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <SummaryTile
                label="Global halt"
                value={status.global_halted ? "Halted" : "Clear"}
                tone={status.global_halted ? "danger" : "success"}
                icon={status.global_halted ? OctagonX : CheckCircle2}
              />
              <SummaryTile label="Brokers" value={String(summary.brokerCount)} tone="neutral" icon={Activity} />
              <SummaryTile
                label="Authorized"
                value={String(summary.authorizedCount)}
                tone={summary.authorizedCount > 0 ? "success" : "neutral"}
                icon={summary.authorizedCount > 0 ? Wifi : WifiOff}
              />
              <SummaryTile
                label="Runners"
                value={`${summary.runningCount} running`}
                tone={summary.runningCount > 0 && !status.global_halted ? "success" : "neutral"}
                icon={summary.runningCount > 0 ? Activity : Clock3}
              />
            </section>

            {status.brokers.length === 0 ? (
              <section className="rounded-xl border border-dashed border-border/60 bg-card p-5 text-center shadow-sm">
                <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="mt-3 text-sm font-semibold">No broker profiles</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  No broker profiles are configured. Mandate-gated live trading requires a configured broker profile.
                </p>
              </section>
            ) : (
              <section className="grid gap-4">
                {status.brokers.map((broker) => (
                  <BrokerRuntimeCard
                    key={broker.auth.profile_id || broker.auth.broker}
                    broker={broker}
                    globalHalted={status.global_halted}
                    nowMs={nowMs}
                    onRefresh={() => loadStatus("refresh")}
                  />
                ))}
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  value: string;
  tone: "success" | "danger" | "neutral";
  icon: typeof Activity;
}

function isCurrentStatusRequest(
  activeRequest: { id: number; controller: AbortController } | null,
  requestId: number,
  controller: AbortController,
): boolean {
  return activeRequest?.id === requestId && activeRequest.controller === controller;
}

function SummaryTile({ label, value, tone, icon: Icon }: SummaryTileProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
            tone === "neutral" && "text-muted-foreground",
          )}
        />
      </div>
      <div
        className={cn(
          "mt-3 text-2xl font-semibold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BrokerRuntimeCard({
  broker,
  globalHalted,
  nowMs,
  onRefresh,
}: {
  broker: LiveBrokerStatus;
  globalHalted: boolean;
  nowMs: number;
  onRefresh: () => Promise<void>;
}) {
  const brokerKey = broker.auth.broker;
  const runnerAlive = broker.runner?.alive ?? false;
  const halted = globalHalted || broker.halted;
  const mandate = broker.mandate ?? null;
  const risk = deriveRiskState(broker, globalHalted);
  const mandateCountdown = formatCountdown(mandate?.expires_at, nowMs);

  if (broker.auth.transport === "broker_sdk") {
    return <SdkBrokerRuntimeCard broker={broker} onRefresh={onRefresh} />;
  }

  return (
    <article className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold capitalize">{brokerKey}</h2>
            <StatusPill
              label={broker.auth.oauth_token_present ? "Auth present" : "Auth missing"}
              tone={broker.auth.oauth_token_present ? "success" : "neutral"}
            />
            <StatusPill
              label={runnerAlive ? "Runner alive" : "Runner stopped"}
              tone={runnerAlive ? "success" : "neutral"}
            />
            {halted ? <StatusPill label="Halted" tone="danger" /> : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {broker.auth.is_live_broker ? "Recognized profile" : "Unknown profile"} · Last tick{" "}
            {formatLastTick(broker.runner?.last_tick, broker.runner?.last_tick_age_seconds, nowMs)}
          </p>
        </div>
        <StatusPill label={risk.label} tone={risk.tone} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <RuntimePanel title="Authorization" icon={broker.auth.oauth_token_present ? Wifi : WifiOff}>
          <KeyValue label="OAuth token" value={broker.auth.oauth_token_present ? "Present" : "Missing"} />
          <KeyValue label="Profile type" value={broker.auth.is_live_broker ? "Recognized" : "Unknown"} />
        </RuntimePanel>

        <RuntimePanel title="Mandate" icon={mandate ? ShieldCheck : ShieldOff}>
          {mandate ? (
            <>
              <KeyValue label="Account" value={mandate.account_ref || "Unrecorded"} />
              <KeyValue label="Expiry" value={mandate.expired ? "Expired" : mandateCountdown} />
              <KeyValue label="Limits" value={summarizeLimits(mandate.limits)} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No mandate configured.</p>
          )}
        </RuntimePanel>

        <RuntimePanel title="Risk state" icon={risk.icon}>
          <p className="text-sm text-muted-foreground">{risk.description}</p>
        </RuntimePanel>
      </div>
    </article>
  );
}

function SdkBrokerRuntimeCard({ broker, onRefresh }: { broker: LiveBrokerStatus; onRefresh: () => Promise<void> }) {
  const auth = broker.auth;
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const profileId = auth.profile_id || `${auth.broker}-live-sdk-readonly`;
  const state = connectorState(auth);

  const verify = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      await api.verifyConnector(profileId);
      await onRefresh();
    } catch {
      setVerifyError("Connector verification failed.");
    } finally {
      setVerifying(false);
    }
  }, [onRefresh, profileId, verifying]);

  return (
    <article className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold capitalize">{auth.broker}</h2>
            <StatusPill label={state.label} tone={state.tone} />
          </div>
          {isReadOnlyCompatible(auth) ? (
            <p className="mt-2 text-sm text-muted-foreground">SDK connector (read-only profile)</p>
          ) : null}
        </div>
        {state.action ? (
          <button
            type="button"
            onClick={verify}
            disabled={verifying}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2 text-sm font-medium transition hover:bg-muted/60 disabled:opacity-50"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {state.action === "verify" ? "Verify connection" : "Retry"}
          </button>
        ) : null}
      </div>

      {state.kind === "not_configured" ? (
        <section className="mt-4 rounded-xl border border-dashed border-border/60 bg-muted/40 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Missing environment variables. Set the following to configure the Longbridge SDK connector:
          </p>
          <ul className="mt-2 grid gap-1 font-mono text-sm">
            <li>LONGBRIDGE_APP_KEY</li>
            <li>LONGBRIDGE_APP_SECRET</li>
            <li>LONGBRIDGE_ACCESS_TOKEN</li>
          </ul>
        </section>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <RuntimePanel title="Connection details" icon={state.kind === "connected" ? Wifi : WifiOff}>
            <KeyValue label="Credential source" value={auth.credential_source || "Unknown"} />
            <KeyValue label="SDK" value={formatSdkState(auth.sdk_installed)} />
          </RuntimePanel>
          <RuntimePanel title="Environment" icon={ShieldCheck}>
            <KeyValue label="Identity" value={formatEnvironmentIdentity(auth.environment_identity)} />
            <KeyValue label="Capabilities" value={formatCapabilities(auth)} />
          </RuntimePanel>
          <RuntimePanel title="Diagnostics" icon={state.kind === "error" ? AlertTriangle : CheckCircle2}>
            <KeyValue label="Last checked" value={auth.last_checked_at || "Never"} />
            {auth.error_code ? <KeyValue label="Error code" value={auth.error_code} /> : null}
            {state.kind === "error" ? (
              <p className="text-sm text-muted-foreground">{connectorDiagnostic(auth.error_code)}</p>
            ) : null}
          </RuntimePanel>
        </div>
      )}
      {verifyError ? <p role="alert" className="mt-3 text-sm text-danger">{verifyError}</p> : null}
    </article>
  );
}

function connectorState(auth: LiveBrokerStatus["auth"]): {
  kind: "not_configured" | "ready" | "connected" | "error" | "unknown";
  label: string;
  tone: "success" | "danger" | "warning" | "neutral";
  action?: "verify" | "retry";
} {
  if (auth.connection_state === "connected") {
    if (isReadOnlyCompatible(auth)) {
      return { kind: "connected", label: "Connected (read-only)", tone: "success" };
    }
    return { kind: "connected", label: "Connected", tone: "neutral" };
  }
  if (auth.connection_state === "not_configured" || auth.configured === false) {
    return { kind: "not_configured", label: "Not configured", tone: "neutral" };
  }
  if (auth.connection_state === "error") {
    return { kind: "error", label: "Connection failed", tone: "danger", action: "retry" };
  }
  if (auth.connection_state === "ready") {
    return { kind: "ready", label: "Ready to verify", tone: "warning", action: "verify" };
  }
  return { kind: "unknown", label: "Status unavailable", tone: "neutral" };
}

function connectorDiagnostic(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case "credentials_partial":    return "Partial credentials — some required variables are set but others are missing.";
    case "credentials_conflict":   return "Credential conflict — both environment and vault credentials are set. Use one source only.";
    case "sdk_missing":            return "SDK not installed. Install the broker SDK package.";
    case "authentication_failed":  return "Authentication failed. Check your credentials.";
    case "network_unreachable":    return "Network unreachable. Check connectivity to the broker.";
    default:                       return "Unexpected broker error.";
  }
}

function formatSdkState(installed: boolean | null | undefined): string {
  if (installed === true)  return "Installed";
  if (installed === false) return "Not installed";
  return "Unknown";
}

function formatEnvironmentIdentity(identity: string | null | undefined): string {
  if (identity === "config_declared" || identity === "config-declared") return "Config declared";
  return identity || "Unknown";
}

function isReadCapability(capability: string): boolean {
  return capability.endsWith(".read");
}

function isReadOnlyCompatible(auth: LiveBrokerStatus["auth"]): boolean {
  if (auth.connection_state !== "connected") return false;
  if (auth.readonly !== true) return false;
  if (!auth.profile_id?.endsWith("-readonly")) return false;
  if (!auth.capabilities?.length) return false;
  return auth.capabilities.every(isReadCapability);
}

function formatCapabilities(auth: LiveBrokerStatus["auth"]): string {
  const labels: Record<string, string> = {
    "account.read":   "Account",
    "positions.read": "Positions",
    "orders.read":    "Open orders",
    "quotes.read":    "Quotes",
    "history.read":   "History",
  };
  const readCapabilities = auth.capabilities?.filter(isReadCapability) ?? [];
  const rendered = readCapabilities.map((c) => labels[c] || c).join(", ");
  if (!isReadOnlyCompatible(auth)) {
    return rendered ? `${rendered} · Access unknown` : "Access unknown";
  }
  return `${rendered} · Read-only`;
}

function RuntimePanel({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-muted/40 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value || "-"}</div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "danger" | "warning" | "neutral" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        tone === "success" && "bg-success/10 text-success",
        tone === "danger"  && "bg-danger/10 text-danger",
        tone === "warning" && "bg-warning/10 text-warning",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function summarizeRuntime(status: LiveStatus | null) {
  const brokers = status?.brokers || [];
  return {
    brokerCount: brokers.length,
    authorizedCount: brokers.filter(
      (b) => b.auth.oauth_token_present || b.auth.connection_state === "connected",
    ).length,
    runningCount: brokers.filter((b) => b.runner?.alive).length,
  };
}

function deriveRiskState(broker: LiveBrokerStatus, globalHalted: boolean): {
  label: string;
  tone: "success" | "danger" | "warning" | "neutral";
  icon: typeof Activity;
  description: string;
} {
  if (globalHalted || broker.halted) {
    return {
      label: "Halted",
      tone: "danger",
      icon: OctagonX,
      description: "A global or broker-level halt is active. All new orders are blocked.",
    };
  }
  if (broker.runner?.alive && broker.mandate && !broker.mandate.expired) {
    return {
      label: "Active",
      tone: "success",
      icon: Activity,
      description: "Runner alive, mandate valid. Orders are permitted within mandate limits.",
    };
  }
  if (broker.auth.oauth_token_present && broker.mandate && !broker.mandate.expired) {
    return {
      label: "Idle",
      tone: "warning",
      icon: Clock3,
      description: "Auth present and mandate valid, but runner is not alive.",
    };
  }
  return {
    label: "Dormant",
    tone: "neutral",
    icon: ShieldOff,
    description: "No active auth or mandate. The broker is not ready for live execution.",
  };
}

function summarizeLimits(limits: LiveMandateLimits | undefined): string {
  if (!limits) return "Unavailable";
  const parts: string[] = [];
  if (typeof limits.max_order_notional_usd === "number") parts.push(`${formatUsd(limits.max_order_notional_usd)}/order`);
  if (typeof limits.max_total_exposure_usd === "number")  parts.push(`${formatUsd(limits.max_total_exposure_usd)} exposure`);
  if (typeof limits.max_trades_per_day === "number")      parts.push(`${limits.max_trades_per_day}/day`);
  if (typeof limits.max_leverage === "number")            parts.push(`${limits.max_leverage}× leverage`);
  if (limits.allowed_instruments?.length)                 parts.push(limits.allowed_instruments.join(", "));
  return parts.join(" · ") || "Unavailable";
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatCountdown(iso: string | undefined, nowMs: number): string {
  if (!iso) return "Unknown";
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "Unknown";
  const deltaSec = Math.round((target - nowMs) / 1000);
  if (deltaSec <= 0) return "Expired";
  const days = Math.floor(deltaSec / 86_400);
  const hours = Math.floor((deltaSec % 86_400) / 3600);
  if (days > 0)      return `${days}d ${hours}h`;
  if (hours > 0)     return `${hours}h`;
  if (deltaSec < 60) return `${deltaSec}s`;
  return `${Math.floor(deltaSec / 60)}m`;
}

function formatLastTick(
  value: string | number | null | undefined,
  ageSeconds: number | null | undefined,
  nowMs: number,
): string {
  if (typeof ageSeconds === "number" && Number.isFinite(ageSeconds)) {
    if (ageSeconds < 60)   return `${Math.round(ageSeconds)}s ago`;
    if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
    return `${Math.floor(ageSeconds / 3600)}h ago`;
  }
  if (value == null || value === "") return "Never";
  const timestamp = typeof value === "number" ? normalizeEpochMs(value) : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const deltaSec = Math.round((nowMs - timestamp) / 1000);
  if (deltaSec < 60)   return `${Math.max(0, deltaSec)}s ago`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  return `${Math.floor(deltaSec / 3600)}h ago`;
}

function normalizeEpochMs(value: number): number {
  if (value >= 1_000_000_000_000)                          return value;
  if (value >= 946_684_800 && value <= 4_102_444_800)      return value * 1000;
  return Number.NaN;
}
