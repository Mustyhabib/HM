/**
 * runs.ts — run lifecycle lib covering start, read, subscribe, upload, and
 * signed URL generation. Mocks the Supabase client so no network calls fire.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Supabase client mock ─────────────────────────────────────────

const rpcMock = vi.fn();
const fromSelectMock = vi.fn();
const fromMock = vi.fn();
const channelMock = vi.fn();
const removeChannelMock = vi.fn();
const storageMock = vi.fn();
const authGetUserMock = vi.fn();

// Builder pattern for chained `.select().eq().order()...` queries
function chainBuilder(terminal: () => unknown) {
  const builder: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "lte", "gt", "order", "limit", "maybeSingle"]) {
    proxy[m] = vi.fn(() => proxy);
  }
  // The terminal call returns the query result
  (proxy as { maybeSingle: unknown }).maybeSingle = vi.fn(terminal);
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpcMock(...args);
      return { data: rpcMock._returnValue, error: rpcMock._returnError };
    },
    from: (table: string) => {
      fromMock(table);
      return fromSelectMock._chain ?? {};
    },
    channel: channelMock,
    removeChannel: removeChannelMock,
    storage: {
      from: (bucket: string) => {
        storageMock(bucket);
        return storageMock._result ?? {};
      },
    },
    auth: {
      getUser: authGetUserMock,
    },
  },
}));

// Stub crypto.randomUUID
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

// Helpers to configure mock returns
function mockRpc(data: unknown, error: unknown = null) {
  rpcMock._returnValue = data;
  rpcMock._returnError = error;
}

function mockFrom(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "lte", "gt", "order", "limit", "maybeSingle"]) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal calls return the result
  chain.maybeSingle = vi.fn(() => ({ data, error }));
  // For array queries (no maybeSingle), use a direct return on the chain
  chain._result = { data, error };
  fromSelectMock._chain = chain;
  return chain;
}

async function loadRuns() {
  vi.resetModules();
  return import("../runs");
}

describe("runs.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── tierFromAllowance ──────────────────────────────────────────

  describe("tierFromAllowance", () => {
    it("maps 15+ to premium, 7–14 to pro, 3–6 to starter, <3 to unknown", async () => {
      const { tierFromAllowance } = await loadRuns();
      expect(tierFromAllowance(15)).toBe("premium");
      expect(tierFromAllowance(20)).toBe("premium");
      expect(tierFromAllowance(7)).toBe("pro");
      expect(tierFromAllowance(14)).toBe("pro");
      expect(tierFromAllowance(3)).toBe("starter");
      expect(tierFromAllowance(6)).toBe("starter");
      expect(tierFromAllowance(2)).toBe("unknown");
      expect(tierFromAllowance(0)).toBe("unknown");
    });
  });

  // ── startRun ───────────────────────────────────────────────────

  describe("startRun", () => {
    it("calls start_agent_run RPC with prompt, max_iter default, and idempotency key", async () => {
      const { startRun } = await loadRuns();
      mockRpc("run-id-abc");
      const id = await startRun("Backtest AAPL");
      expect(rpcMock).toHaveBeenCalledWith("start_agent_run", {
        p_prompt: "Backtest AAPL",
        p_max_iter: 10,
        p_idempotency_key: "test-uuid-1234",
        p_attachments: [],
      });
      expect(id).toBe("run-id-abc");
    });

    it("passes custom maxIter and attachments", async () => {
      const { startRun } = await loadRuns();
      mockRpc("run-id-xyz");
      const att = [{ name: "data.csv", path: "user/data.csv", size: 1000, kind: "csv" as const }];
      await startRun("Test", { maxIter: 25, attachments: att });
      expect(rpcMock).toHaveBeenCalledWith("start_agent_run", expect.objectContaining({
        p_max_iter: 25,
        p_attachments: att,
      }));
    });

    it("translates no_active_subscription to friendly message", async () => {
      const { startRun } = await loadRuns();
      mockRpc(null, { message: "no_active_subscription" });
      await expect(startRun("test")).rejects.toThrow("Subscribe to start running the agent.");
    });

    it("translates no_api_key to friendly message", async () => {
      const { startRun } = await loadRuns();
      mockRpc(null, { message: "no_api_key" });
      await expect(startRun("test")).rejects.toThrow(
        "Add your DeepSeek API key on the Profile page before running.",
      );
    });

    it("translates rate_limited to friendly message", async () => {
      const { startRun } = await loadRuns();
      mockRpc(null, { message: "rate_limited" });
      await expect(startRun("test")).rejects.toThrow(
        "You're running the agent too fast — wait a minute and try again.",
      );
    });

    it("translates account_suspended to friendly message", async () => {
      const { startRun } = await loadRuns();
      mockRpc(null, { message: "account_suspended" });
      await expect(startRun("test")).rejects.toThrow("Your account is suspended — contact support.");
    });

    it("passes through unknown error messages unchanged", async () => {
      const { startRun } = await loadRuns();
      mockRpc(null, { message: "something unexpected" });
      await expect(startRun("test")).rejects.toThrow("something unexpected");
    });
  });

  // ── getActiveSubscription ──────────────────────────────────────

  describe("getActiveSubscription", () => {
    it("returns planId and status for an active subscriber", async () => {
      const { getActiveSubscription } = await loadRuns();
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "limit", "maybeSingle"]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(() => ({
        data: { plan_id: "pro", status: "active" },
        error: null,
      }));
      fromSelectMock._chain = chain;

      const sub = await getActiveSubscription();
      expect(sub).toEqual({ planId: "pro", status: "active" });
      expect(fromMock).toHaveBeenCalledWith("subscriptions");
    });

    it("returns null when no active subscription exists", async () => {
      const { getActiveSubscription } = await loadRuns();
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "limit", "maybeSingle"]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(() => ({ data: null, error: null }));
      fromSelectMock._chain = chain;

      const sub = await getActiveSubscription();
      expect(sub).toBeNull();
    });

    it("throws on query error", async () => {
      const { getActiveSubscription } = await loadRuns();
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "limit", "maybeSingle"]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(() => ({ data: null, error: { message: "timeout" } }));
      fromSelectMock._chain = chain;

      await expect(getActiveSubscription()).rejects.toThrow("timeout");
    });
  });

  // ── uploadAttachment ───────────────────────────────────────────

  describe("uploadAttachment", () => {
    it("rejects files over 50 MB", async () => {
      const { uploadAttachment } = await loadRuns();
      const big = new File(["x"], "huge.csv", { type: "text/csv" });
      Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
      await expect(uploadAttachment(big)).rejects.toThrow("50 MB max");
    });

    it("rejects unsupported file types", async () => {
      const { uploadAttachment } = await loadRuns();
      const file = new File(["data"], "script.py", { type: "text/x-python" });
      await expect(uploadAttachment(file)).rejects.toThrow("Unsupported file type: .py");
    });

    it("rejects unauthenticated users", async () => {
      const { uploadAttachment } = await loadRuns();
      authGetUserMock.mockResolvedValue({ data: null, error: { message: "no user" } });
      const file = new File(["a,b"], "data.csv", { type: "text/csv" });
      await expect(uploadAttachment(file)).rejects.toThrow("Not authenticated");
    });
  });

  // ── signedArtifactUrl ──────────────────────────────────────────

  describe("signedArtifactUrl", () => {
    it("returns null on storage error", async () => {
      const { signedArtifactUrl } = await loadRuns();
      storageMock._result = {
        createSignedUrl: vi.fn(() => ({ data: null, error: { message: "oops" } })),
      };

      const url = await signedArtifactUrl("some/path.csv");
      expect(url).toBeNull();
      expect(storageMock).toHaveBeenCalledWith("agent-artifacts");
    });

    it("returns signed URL on success", async () => {
      const { signedArtifactUrl } = await loadRuns();
      storageMock._result = {
        createSignedUrl: vi.fn(() => ({
          data: { signedUrl: "https://storage.test/signed" },
          error: null,
        })),
      };

      const url = await signedArtifactUrl("path/report.html", 600);
      expect(url).toBe("https://storage.test/signed");
    });
  });

  // ── subscribeToRun ─────────────────────────────────────────────

  describe("subscribeToRun", () => {
    it("creates a channel and returns an unsubscribe function", async () => {
      const { subscribeToRun } = await loadRuns();
      const fakeChannel = {
        on: vi.fn(() => fakeChannel),
        subscribe: vi.fn(() => fakeChannel),
      };
      channelMock.mockReturnValue(fakeChannel);

      const onUpdate = vi.fn();
      const unsub = subscribeToRun("run-123", onUpdate);

      expect(channelMock).toHaveBeenCalledWith("run:run-123");
      expect(fakeChannel.on).toHaveBeenCalledWith(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: "id=eq.run-123" },
        expect.any(Function),
      );
      expect(fakeChannel.subscribe).toHaveBeenCalled();

      // Call the unsubscribe function
      unsub();
      expect(removeChannelMock).toHaveBeenCalledWith(fakeChannel);
    });

    it("fires the callback on UPDATE payload", async () => {
      const { subscribeToRun } = await loadRuns();
      let capturedCallback: (payload: { new: unknown }) => void = () => {};
      const fakeChannel = {
        on: vi.fn((_event: string, _filter: unknown, cb: typeof capturedCallback) => {
          capturedCallback = cb;
          return fakeChannel;
        }),
        subscribe: vi.fn(() => fakeChannel),
      };
      channelMock.mockReturnValue(fakeChannel);

      const onUpdate = vi.fn();
      subscribeToRun("run-456", onUpdate);

      const fakeRun = { id: "run-456", status: "completed" };
      capturedCallback({ new: fakeRun });
      expect(onUpdate).toHaveBeenCalledWith(fakeRun);
    });
  });

  // ── subscribeToArtifacts ───────────────────────────────────────

  describe("subscribeToArtifacts", () => {
    it("creates an artifact channel for INSERT events", async () => {
      const { subscribeToArtifacts } = await loadRuns();
      const fakeChannel = {
        on: vi.fn(() => fakeChannel),
        subscribe: vi.fn(() => fakeChannel),
      };
      channelMock.mockReturnValue(fakeChannel);

      const onInsert = vi.fn();
      const unsub = subscribeToArtifacts("run-789", onInsert);

      expect(channelMock).toHaveBeenCalledWith("artifacts:run-789");
      expect(fakeChannel.on).toHaveBeenCalledWith(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_artifacts", filter: "agent_run_id=eq.run-789" },
        expect.any(Function),
      );

      unsub();
      expect(removeChannelMock).toHaveBeenCalledWith(fakeChannel);
    });
  });
});
