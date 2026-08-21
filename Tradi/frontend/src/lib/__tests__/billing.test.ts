/**
 * billing.ts — Paystack subscription checkout, status query, and polling.
 * Mocks the Supabase client so no network calls fire.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Supabase mock ────────────────────────────────────────────────

const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
    from: (table: string) => {
      fromMock(table);
      return fromMock._chain ?? {};
    },
  },
}));

function mockFrom(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "in", "order", "limit", "maybeSingle"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => ({ data, error }));
  fromMock._chain = chain;
  return chain;
}

async function loadBilling() {
  vi.resetModules();
  return import("../billing");
}

describe("billing.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub window.location for redirect tests
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initiateSubscription ───────────────────────────────────────

  describe("initiateSubscription", () => {
    it("calls paystack-init edge function with planId and redirects on success", async () => {
      const { initiateSubscription } = await loadBilling();
      invokeMock.mockResolvedValue({
        data: {
          authorization_url: "https://paystack.com/pay/abc123",
          reference: "ref-123",
        },
        error: null,
      });

      const result = await initiateSubscription("pro");

      expect(invokeMock).toHaveBeenCalledWith("paystack-init", {
        body: { planId: "pro" },
      });
      expect(result).toBeNull(); // null = success (redirect took over)
      expect(window.location.href).toBe("https://paystack.com/pay/abc123");
    });

    it("returns error string when edge function fails", async () => {
      const { initiateSubscription } = await loadBilling();
      invokeMock.mockResolvedValue({
        data: null,
        error: { message: "Unauthorized" },
      });

      const result = await initiateSubscription("starter");

      expect(result).toBe("Unauthorized");
      expect(window.location.href).toBe(""); // no redirect
    });

    it("returns error when no authorization_url returned", async () => {
      const { initiateSubscription } = await loadBilling();
      invokeMock.mockResolvedValue({
        data: { reference: "ref-123" }, // missing authorization_url
        error: null,
      });

      const result = await initiateSubscription("premium");

      expect(result).toBe("No payment URL returned. Please contact support.");
    });

    it("returns fallback message when error has no message", async () => {
      const { initiateSubscription } = await loadBilling();
      invokeMock.mockResolvedValue({
        data: null,
        error: {},
      });

      const result = await initiateSubscription("pro");

      expect(result).toBe("Failed to initialize payment. Please try again.");
    });
  });

  // ── getSubscriptionStatus ──────────────────────────────────────

  describe("getSubscriptionStatus", () => {
    it("returns active status with plan data", async () => {
      const { getSubscriptionStatus } = await loadBilling();
      mockFrom({
        plan_id: "pro",
        status: "active",
        current_period_end: "2026-09-15T00:00:00Z",
      });

      const sub = await getSubscriptionStatus();

      expect(fromMock).toHaveBeenCalledWith("subscriptions");
      expect(sub).toEqual({
        isActive: true,
        planId: "pro",
        periodEnd: new Date("2026-09-15T00:00:00Z"),
        status: "active",
      });
    });

    it("returns inactive when no subscription exists", async () => {
      const { getSubscriptionStatus } = await loadBilling();
      mockFrom(null);

      const sub = await getSubscriptionStatus();

      expect(sub).toEqual({
        isActive: false,
        planId: null,
        periodEnd: null,
        status: null,
      });
    });

    it("returns inactive on query error", async () => {
      const { getSubscriptionStatus } = await loadBilling();
      mockFrom(null, { message: "network error" });

      const sub = await getSubscriptionStatus();

      expect(sub).toEqual({
        isActive: false,
        planId: null,
        periodEnd: null,
        status: null,
      });
    });

    it("handles null period_end gracefully", async () => {
      const { getSubscriptionStatus } = await loadBilling();
      mockFrom({ plan_id: "starter", status: "trialing", current_period_end: null });

      const sub = await getSubscriptionStatus();

      expect(sub.isActive).toBe(true);
      expect(sub.periodEnd).toBeNull();
    });
  });

  // ── pollSubscriptionActive ─────────────────────────────────────

  describe("pollSubscriptionActive", () => {
    it("returns true immediately when subscription is already active", async () => {
      const { pollSubscriptionActive } = await loadBilling();
      mockFrom({ plan_id: "pro", status: "active", current_period_end: "2026-09-15T00:00:00Z" });

      const result = await pollSubscriptionActive(5000, 100);

      expect(result).toBe(true);
    });

    it("returns false when subscription never becomes active within deadline", async () => {
      const { pollSubscriptionActive } = await loadBilling();
      // Always return inactive
      mockFrom(null);

      const result = await pollSubscriptionActive(200, 50);

      expect(result).toBe(false);
    });

    it("retries until subscription activates", async () => {
      const { pollSubscriptionActive } = await loadBilling();
      let callCount = 0;

      // First two calls return inactive, third returns active
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "limit", "maybeSingle"]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(() => {
        callCount++;
        if (callCount >= 3) {
          return {
            data: { plan_id: "pro", status: "active", current_period_end: "2026-09-15T00:00:00Z" },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      fromMock._chain = chain;

      const result = await pollSubscriptionActive(10000, 50);

      expect(result).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(3);
    });
  });
});
