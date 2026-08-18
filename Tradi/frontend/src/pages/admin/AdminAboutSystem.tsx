import { Building2, Server, Tag } from "lucide-react";
import {
  APP_VERSION,
  DOMAIN,
  LEGAL_NAME,
  MAILING_ADDRESS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/lib/company";

/**
 * Admin panel "about/system" screen — registrant info, support contact, and
 * current environment. Doubles as an ownership record per
 * Design_Flow_Prompt.md "Ownership / contact footprint".
 */

/** Best-effort hostname extraction — never renders a full URL (which could
 * carry query params/keys). Falls back to "—" if the env var is unset or
 * malformed. */
function supabaseHostname(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return "—";
  try {
    return new URL(url).hostname;
  } catch {
    return "—";
  }
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-1.5 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

export function AdminAboutSystem() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">About / System</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrant record, support contact, and the current runtime environment.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card icon={Building2} title="Registrant">
          <Row label="Legal name" value={LEGAL_NAME} />
          <Row
            label="Support email"
            value={
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
            }
          />
          <Row label="Support phone" value={SUPPORT_PHONE} />
          <Row label="Mailing address" value={MAILING_ADDRESS} />
          <Row label="Domain" value={DOMAIN} />
        </Card>

        <Card icon={Server} title="Environment">
          <Row label="Mode" value={import.meta.env.MODE} />
          <Row label="Supabase host" value={supabaseHostname()} />
          {(import.meta.env.VITE_APP_NAME as string | undefined) && (
            <Row label="App name" value={import.meta.env.VITE_APP_NAME as string} />
          )}
        </Card>

        <Card icon={Tag} title="Version">
          <Row label="App version" value={APP_VERSION} />
        </Card>
      </div>
    </div>
  );
}
