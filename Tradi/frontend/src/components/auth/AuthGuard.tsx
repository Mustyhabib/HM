import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/lib/auth-store";

/** Wrap authenticated routes — redirects to /login if not signed in */
export function AuthGuard() {
  const { user, loading, initialized, initialize } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!initialized) {
      const cleanup = initialize();
      return cleanup;
    }
  }, [initialized, initialize]);

  if (!initialized || loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/** Wrap public auth routes (login/signup) — redirects to /dashboard if already signed in */
export function GuestGuard() {
  const { user, loading, initialized, initialize } = useAuth();

  useEffect(() => {
    if (!initialized) {
      const cleanup = initialize();
      return cleanup;
    }
  }, [initialized, initialize]);

  if (!initialized || loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
