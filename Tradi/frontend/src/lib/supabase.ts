import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (import.meta.env.DEV && (!supabaseUrl || !supabaseAnonKey)) {
  // Warn in development only — don't throw so public pages still render
  console.warn("[H~M] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Auth will not work.");
}

// Safe to call createClient with empty strings — it won't throw; requests will just fail
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder",
);
