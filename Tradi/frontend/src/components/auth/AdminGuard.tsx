import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { admin } from "@/lib/admin";

/**
 * Wrap /admin/* routes — sits INSIDE AuthGuard (a user is already known to
 * be signed in by the time this mounts). Checks `is_admin()` on mount and
 * re-checks whenever the mounted instance changes.
 *
 * This is a UX convenience only (D-A7) — every admin_* RPC re-checks
 * `admin_users` membership server-side via `_require_admin()`. A client
 * that skips this guard entirely still can't call an admin RPC.
 */
export function AdminGuard() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    admin.isAdmin().then((ok) => {
      if (!cancelled) setAllowed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (allowed === null) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Checking admin access...</span>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
