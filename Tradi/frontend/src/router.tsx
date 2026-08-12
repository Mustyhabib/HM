import { Suspense, lazy, type ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "@/components/layout/Layout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { AuthGuard, GuestGuard } from "@/components/auth/AuthGuard";

// --- Public / SaaS pages ---
const Landing = lazy(() => import("@/pages/Landing").then((m) => ({ default: m.Landing })));
const Pricing = lazy(() => import("@/pages/Pricing").then((m) => ({ default: m.Pricing })));
const Docs    = lazy(() => import("@/pages/Docs").then((m) => ({ default: m.Docs })));
const Terms   = lazy(() => import("@/pages/Terms").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("@/pages/Privacy").then((m) => ({ default: m.Privacy })));
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Signup = lazy(() => import("@/pages/Signup").then((m) => ({ default: m.Signup })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const SaasSettings = lazy(() => import("@/pages/SaasSettings").then((m) => ({ default: m.SaasSettings })));
const Signals = lazy(() => import("@/pages/Signals").then((m) => ({ default: m.Signals })));
const Teams = lazy(() => import("@/pages/Teams").then((m) => ({ default: m.Teams })));
const Profile = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.Profile })));
const RunView = lazy(() => import("@/pages/RunView").then((m) => ({ default: m.RunView })));
const BillingCallback = lazy(() =>
  import("@/pages/BillingCallback").then((m) => ({ default: m.BillingCallback })),
);

// --- Engine pages (existing) ---
const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })));
const Agent = lazy(() => import("@/pages/Agent").then((m) => ({ default: m.Agent })));
const RunDetail = lazy(() =>
  import("@/pages/RunDetail").then((m) => ({ default: m.RunDetail })),
);
const Compare = lazy(() =>
  import("@/pages/Compare").then((m) => ({ default: m.Compare })),
);
const Settings = lazy(() =>
  import("@/pages/Settings").then((m) => ({ default: m.Settings })),
);
const Runtime = lazy(() =>
  import("@/pages/Runtime").then((m) => ({ default: m.Runtime })),
);
const Scheduled = lazy(() =>
  import("@/pages/Scheduled").then((m) => ({ default: m.Scheduled })),
);
const Reports = lazy(() =>
  import("@/pages/Reports").then((m) => ({ default: m.Reports })),
);
const Correlation = lazy(() =>
  import("@/pages/Correlation").then((m) => ({ default: m.Correlation })),
);
const AlphaZoo = lazy(() =>
  import("@/pages/AlphaZoo").then((m) => ({ default: m.AlphaZoo })),
);

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

function wrap(Component: ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // --- Public pages (header + footer, no sidebar) ---
  {
    element: <PublicLayout />,
    children: [
      { path: "/",        element: wrap(Landing)  },
      { path: "/pricing", element: wrap(Pricing)  },
      { path: "/docs",              element: wrap(Docs)            },
      { path: "/terms",             element: wrap(Terms)           },
      { path: "/privacy",           element: wrap(Privacy)         },
      // Paystack redirects here after checkout — no auth required (can reach
      // this page before the subscription webhook fires)
      { path: "/billing/callback",  element: wrap(BillingCallback) },
    ],
  },

  // --- Auth pages (public layout, redirect if already logged in) ---
  {
    element: <GuestGuard />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: "/login", element: wrap(Login) },
          { path: "/signup", element: wrap(Signup) },
        ],
      },
    ],
  },

  // --- Authenticated app pages (sidebar layout, redirect to login if not authed) ---
  {
    element: <AuthGuard />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: "/dashboard", element: wrap(Dashboard) },
          { path: "/run/:runId", element: wrap(RunView) },
          { path: "/about", element: wrap(Home) },
          { path: "/agent", element: wrap(Agent) },
          { path: "/teams", element: wrap(Teams) },
          { path: "/runtime", element: wrap(Runtime) },
          { path: "/scheduled", element: wrap(Scheduled) },
          { path: "/reports", element: wrap(Reports) },
          { path: "/settings", element: wrap(SaasSettings) },
          { path: "/signals", element: wrap(Signals) },
          { path: "/profile", element: wrap(Profile) },
          { path: "/settings/engine", element: wrap(Settings) },
          { path: "/runs/:runId", element: wrap(RunDetail) },
          { path: "/compare", element: wrap(Compare) },
          { path: "/correlation", element: wrap(Correlation) },
          { path: "/alpha-zoo", element: wrap(AlphaZoo) },
          { path: "/alpha-zoo/bench", element: wrap(AlphaZoo) },
          { path: "/alpha-zoo/compare", element: wrap(AlphaZoo) },
          { path: "/alpha-zoo/:alphaId", element: wrap(AlphaZoo) },
        ],
      },
    ],
  },
]);
