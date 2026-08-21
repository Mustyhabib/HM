/**
 * auth-store.ts — Zustand auth store covering initialize, signUp, signIn,
 * signOut, and the synchronous session set that prevents the D9 race.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Supabase auth mock ───────────────────────────────────────────

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const signUpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signUp: signUpMock,
      signInWithPassword: signInWithPasswordMock,
      signOut: signOutMock,
    },
  },
}));

// Reset the zustand store between tests by resetting modules
async function freshStore() {
  vi.resetModules();
  const mod = await import("../auth-store");
  return mod.useAuth;
}

const FAKE_USER = {
  id: "user-123",
  email: "test@hm.trade",
  identities: [{ id: "ident-1" }],
};

const FAKE_SESSION = {
  access_token: "jwt-token",
  user: FAKE_USER,
};

describe("auth-store.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: onAuthStateChange returns an unsubscribe function
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initialize ─────────────────────────────────────────────────

  describe("initialize", () => {
    it("fetches session on mount and sets user + initialized", async () => {
      const useAuth = await freshStore();
      getSessionMock.mockResolvedValue({ data: { session: FAKE_SESSION } });

      const cleanup = useAuth.getState().initialize();

      // Wait for the async getSession to resolve
      await vi.waitFor(() => {
        expect(useAuth.getState().initialized).toBe(true);
      });

      expect(useAuth.getState().user).toEqual(FAKE_USER);
      expect(useAuth.getState().session).toEqual(FAKE_SESSION);
      expect(useAuth.getState().loading).toBe(false);

      // Cleanup should unsubscribe
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("sets null user when no session exists", async () => {
      const useAuth = await freshStore();
      getSessionMock.mockResolvedValue({ data: { session: null } });

      useAuth.getState().initialize();

      await vi.waitFor(() => {
        expect(useAuth.getState().initialized).toBe(true);
      });

      expect(useAuth.getState().user).toBeNull();
      expect(useAuth.getState().session).toBeNull();
    });

    it("sets up onAuthStateChange listener that updates store", async () => {
      const useAuth = await freshStore();
      let authChangeCallback: (_event: string, session: unknown) => void = () => {};

      onAuthStateChangeMock.mockReturnValue({
        data: {
          subscription: { unsubscribe: vi.fn() },
        },
      });
      onAuthStateChangeMock.mockImplementation((cb) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });
      getSessionMock.mockResolvedValue({ data: { session: null } });

      useAuth.getState().initialize();

      await vi.waitFor(() => {
        expect(useAuth.getState().initialized).toBe(true);
      });

      // Simulate SIGNED_IN event
      authChangeCallback("SIGNED_IN", FAKE_SESSION);

      expect(useAuth.getState().user).toEqual(FAKE_USER);
      expect(useAuth.getState().session).toEqual(FAKE_SESSION);

      // Simulate SIGNED_OUT event
      authChangeCallback("SIGNED_OUT", null);

      expect(useAuth.getState().user).toBeNull();
      expect(useAuth.getState().session).toBeNull();
    });
  });

  // ── signIn ─────────────────────────────────────────────────────

  describe("signIn", () => {
    it("sets user and session synchronously on success (D9 fix)", async () => {
      const useAuth = await freshStore();
      signInWithPasswordMock.mockResolvedValue({
        data: { user: FAKE_USER, session: FAKE_SESSION },
        error: null,
      });

      const result = await useAuth.getState().signIn("test@hm.trade", "password");

      expect(result.error).toBeNull();
      // The key D9 fix: session is set synchronously, not via onAuthStateChange
      expect(useAuth.getState().user).toEqual(FAKE_USER);
      expect(useAuth.getState().session).toEqual(FAKE_SESSION);
      expect(useAuth.getState().loading).toBe(false);
    });

    it("returns error and does not set session on auth failure", async () => {
      const useAuth = await freshStore();
      signInWithPasswordMock.mockResolvedValue({
        data: {},
        error: { message: "Invalid login credentials" },
      });

      const result = await useAuth.getState().signIn("wrong@email.com", "bad");

      expect(result.error).toBe("Invalid login credentials");
      expect(useAuth.getState().user).toBeNull();
      expect(useAuth.getState().loading).toBe(false);
    });

    it("sets loading true during sign-in and false after", async () => {
      const useAuth = await freshStore();
      let resolveSignIn: (value: unknown) => void;
      signInWithPasswordMock.mockReturnValue(
        new Promise((r) => { resolveSignIn = r; }),
      );

      const promise = useAuth.getState().signIn("test@hm.trade", "pass");

      expect(useAuth.getState().loading).toBe(true);

      resolveSignIn!({
        data: { user: FAKE_USER, session: FAKE_SESSION },
        error: null,
      });
      await promise;

      expect(useAuth.getState().loading).toBe(false);
    });
  });

  // ── signUp ─────────────────────────────────────────────────────

  describe("signUp", () => {
    it("sets session synchronously when email confirmation is off (D9 fix)", async () => {
      const useAuth = await freshStore();
      signUpMock.mockResolvedValue({
        data: { user: FAKE_USER, session: FAKE_SESSION },
        error: null,
      });

      const result = await useAuth.getState().signUp("new@hm.trade", "password123");

      expect(result.error).toBeNull();
      expect(result.needsConfirmation).toBe(false);
      // D9: session set synchronously
      expect(useAuth.getState().user).toEqual(FAKE_USER);
      expect(useAuth.getState().session).toEqual(FAKE_SESSION);
    });

    it("returns needsConfirmation true when session is null (confirmation on)", async () => {
      const useAuth = await freshStore();
      signUpMock.mockResolvedValue({
        data: { user: FAKE_USER, session: null },
        error: null,
      });

      const result = await useAuth.getState().signUp("new@hm.trade", "password123");

      expect(result.needsConfirmation).toBe(true);
      expect(result.error).toBeNull();
      // Session NOT set — user must confirm email first
      expect(useAuth.getState().session).toBeNull();
    });

    it("detects masked duplicate signup (empty identities array)", async () => {
      const useAuth = await freshStore();
      signUpMock.mockResolvedValue({
        data: {
          user: { ...FAKE_USER, identities: [] },
          session: null,
        },
        error: null,
      });

      const result = await useAuth.getState().signUp("existing@hm.trade", "pass");

      expect(result.error).toBe(
        "An account with this email already exists. Try logging in.",
      );
      expect(result.needsConfirmation).toBe(false);
    });

    it("returns error on auth failure", async () => {
      const useAuth = await freshStore();
      signUpMock.mockResolvedValue({
        data: {},
        error: { message: "Password too short" },
      });

      const result = await useAuth.getState().signUp("new@hm.trade", "abc");

      expect(result.error).toBe("Password too short");
    });
  });

  // ── signOut ────────────────────────────────────────────────────

  describe("signOut", () => {
    it("clears user and session", async () => {
      const useAuth = await freshStore();
      // Pre-set a logged-in state
      useAuth.setState({ user: FAKE_USER as any, session: FAKE_SESSION as any });
      signOutMock.mockResolvedValue({});

      await useAuth.getState().signOut();

      expect(signOutMock).toHaveBeenCalled();
      expect(useAuth.getState().user).toBeNull();
      expect(useAuth.getState().session).toBeNull();
    });
  });
});
