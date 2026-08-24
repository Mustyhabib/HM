/**
 * Beta mode — single switch, tiered not deleted (2026-08-24).
 *
 * While BETA_MODE is true the app runs as an OPEN BETA:
 *   - Auth is bypassed client-side: every route renders without a session
 *     and GuestGuard never bounces signed-in users away from /login.
 *   - Subscription / API-key gates on the Agent page are lifted (the UI no
 *     longer blocks; server-side RPCs still enforce nothing extra — see
 *     start_agent_run beta bypass in 2026_08_24_beta_open_gates.sql).
 *
 * NOTHING IS DELETED. Flipping BETA_MODE to false restores the exact
 * pre-beta behaviour: AuthGuard requires a real session again, the Agent
 * page re-checks subscription + key, and pricing links reappear. The DB
 * migration has its own rollback section for the server-side half.
 */
export const BETA_MODE = true;

/** Copy shown in the beta banner. */
export const BETA_NOTICE =
  "Open Beta — free access during the research preview. Accounts, plans, and billing arrive at launch.";
