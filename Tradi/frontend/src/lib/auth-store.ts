import { create } from "zustand";
import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;

  /** Call once on app mount — sets up the auth listener */
  initialize: () => () => void;

  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  initialize: () => {
    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        initialized: true,
      });
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        loading: false,
      });
    });

    // Return cleanup function
    return () => subscription.unsubscribe();
  },

  signUp: async (email, password) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signUp({ email, password });
    set({ loading: false });

    if (error) {
      return { error: error.message, needsConfirmation: false };
    }

    // When "Confirm email" is on, Supabase masks a duplicate signup instead of
    // erroring (anti-enumeration): it returns a user with an empty identities
    // array and no session, and never sends a mail. Surface it as a real
    // message so the user isn't told to check an inbox that stays empty.
    if (data.user && data.user.identities?.length === 0) {
      return {
        error: "An account with this email already exists. Try logging in.",
        needsConfirmation: false,
      };
    }

    // A session means email confirmation is disabled — the user is already
    // logged in. No session means a confirmation link was emailed and must be
    // clicked before the account is usable. Set the session synchronously so a
    // caller that navigates on success doesn't race the onAuthStateChange
    // listener (AuthGuard would otherwise see a null user and bounce to /login).
    if (data.session) {
      set({ user: data.user, session: data.session });
    }
    return { error: null, needsConfirmation: data.session === null };
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ loading: false });
      return { error: error.message };
    }

    // Set user/session synchronously rather than waiting for the async
    // onAuthStateChange listener — otherwise navigate() on the caller side
    // reaches AuthGuard before the store updates and gets bounced to /login.
    set({ user: data.user, session: data.session, loading: false });
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
