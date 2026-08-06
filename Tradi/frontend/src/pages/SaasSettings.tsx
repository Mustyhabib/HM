import { useState } from "react";
import {
  User,
  Mail,
  Lock,
  Bell,
  CreditCard,
  Shield,
  Key,
  Globe,
  Moon,
  Smartphone,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Crown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Section wrapper ─── */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/* ─── Field row ─── */
function FieldRow({
  label,
  value,
  type = "text",
  disabled = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:w-40 shrink-0">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </label>
      <input
        type={type}
        defaultValue={value}
        disabled={disabled}
        className={cn(
          "flex-1 rounded-lg border border-border bg-[#05060F] px-3 py-2 text-sm text-foreground outline-none transition",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
    </div>
  );
}

/* ─── Toggle switch ─── */
function Toggle({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />}
        <div>
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

/* ─── Tabs ─── */
const TABS = [
  { id: "account", label: "Account", icon: User },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "api", label: "API Keys", icon: Key },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ─── Page ─── */
export function SaasSettings() {
  const [tab, setTab] = useState<TabId>("account");

  // Notification toggles
  const [emailRun, setEmailRun] = useState(true);
  const [emailBilling, setEmailBilling] = useState(true);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [pushRun, setPushRun] = useState(false);
  const [pushSignals, setPushSignals] = useState(true);

  // Security toggles
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionAlerts, setSessionAlerts] = useState(true);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, billing, and preferences
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition whitespace-nowrap",
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-[#101730]",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {/* ─── Account ─── */}
        {tab === "account" && (
          <>
            <Section title="Profile Information" description="Update your personal details">
              <div className="space-y-4">
                <FieldRow icon={User} label="Full Name" value="Mustapha Habib" />
                <FieldRow icon={Mail} label="Email" value="mustaphahabib270@gmail.com" disabled />
                <FieldRow icon={Globe} label="Timezone" value="UTC+01:00 (West Africa)" />
              </div>
              <div className="mt-5 flex justify-end">
                <button className="rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
                  Save Changes
                </button>
              </div>
            </Section>

            <Section title="Preferences">
              <div className="space-y-4">
                <Toggle
                  icon={Moon}
                  label="Dark mode"
                  description="Always enabled — H~Mltd uses a dark theme"
                  checked={true}
                  onChange={() => {}}
                />
                <Toggle
                  icon={Globe}
                  label="Show prices in local currency"
                  description="Display subscription prices in your local currency"
                  checked={false}
                  onChange={() => {}}
                />
              </div>
            </Section>

            <Section title="Danger Zone">
              <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div>
                  <div className="text-sm font-medium text-destructive">Delete Account</div>
                  <div className="text-xs text-muted-foreground">
                    Permanently delete your account and all associated data
                  </div>
                </div>
                <button className="rounded-lg border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive/10">
                  Delete Account
                </button>
              </div>
            </Section>
          </>
        )}

        {/* ─── Billing ─── */}
        {tab === "billing" && (
          <>
            <Section title="Current Plan">
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg gradient-bg">
                    <Crown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">Pro Plan</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Active
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ₦120,000/month · 7 agent runs · Renews Aug 15, 2026
                    </div>
                  </div>
                </div>
                <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-[#101730]">
                  Change Plan
                </button>
              </div>
            </Section>

            <Section title="Usage This Period" description="Resets on Aug 15, 2026">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Agent runs used</span>
                  <span className="font-mono font-medium">3 / 7</span>
                </div>
                <div className="h-2 rounded-full bg-[#101730]">
                  <div
                    className="h-full rounded-full gradient-bg transition-all"
                    style={{ width: "42.8%" }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  4 runs remaining this billing period
                </div>
              </div>
            </Section>

            <Section title="Payment Method">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-14 items-center justify-center rounded-md bg-[#101730] text-xs font-bold text-muted-foreground">
                    VISA
                  </div>
                  <div>
                    <div className="text-sm font-medium">•••• •••• •••• 4242</div>
                    <div className="text-xs text-muted-foreground">Expires 12/2028</div>
                  </div>
                </div>
                <button className="text-sm text-primary hover:underline">Update</button>
              </div>
            </Section>

            <Section title="Billing History">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { date: "Aug 1, 2026", desc: "Pro Plan — Monthly", amount: "₦120,000", status: "Paid" },
                      { date: "Jul 1, 2026", desc: "Pro Plan — Monthly", amount: "₦120,000", status: "Paid" },
                      { date: "Jun 1, 2026", desc: "Starter Plan — Monthly", amount: "₦70,000", status: "Paid" },
                    ].map((row) => (
                      <tr key={row.date}>
                        <td className="py-3 font-mono text-xs">{row.date}</td>
                        <td className="py-3">{row.desc}</td>
                        <td className="py-3 font-mono">{row.amount}</td>
                        <td className="py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                            <Check className="h-3 w-3" /> {row.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button className="text-xs text-primary hover:underline">
                            Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <div className="text-center">
              <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
                Manage subscription on Paystack <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}

        {/* ─── Notifications ─── */}
        {tab === "notifications" && (
          <>
            <Section title="Email Notifications" description="Choose what emails you receive">
              <div className="space-y-5">
                <Toggle
                  icon={Bell}
                  label="Run completed"
                  description="Get notified when an agent run finishes"
                  checked={emailRun}
                  onChange={setEmailRun}
                />
                <Toggle
                  icon={CreditCard}
                  label="Billing & invoices"
                  description="Payment confirmations and invoice receipts"
                  checked={emailBilling}
                  onChange={setEmailBilling}
                />
                <Toggle
                  icon={Mail}
                  label="Product updates"
                  description="New features, tips, and platform news"
                  checked={emailMarketing}
                  onChange={setEmailMarketing}
                />
              </div>
            </Section>

            <Section title="Push Notifications" description="Browser and mobile push alerts">
              <div className="space-y-5">
                <Toggle
                  icon={Smartphone}
                  label="Run status updates"
                  description="Push notification when a run completes or fails"
                  checked={pushRun}
                  onChange={setPushRun}
                />
                <Toggle
                  icon={Bell}
                  label="Signal alerts"
                  description="Get notified when new trading signals trigger"
                  checked={pushSignals}
                  onChange={setPushSignals}
                />
              </div>
            </Section>
          </>
        )}

        {/* ─── Security ─── */}
        {tab === "security" && (
          <>
            <Section title="Password" description="Change your account password">
              <div className="space-y-4">
                <FieldRow icon={Lock} label="Current" value="" type="password" />
                <FieldRow icon={Lock} label="New Password" value="" type="password" />
                <FieldRow icon={Lock} label="Confirm" value="" type="password" />
              </div>
              <div className="mt-5 flex justify-end">
                <button className="rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
                  Update Password
                </button>
              </div>
            </Section>

            <Section title="Two-Factor Authentication">
              <div className="space-y-5">
                <Toggle
                  icon={Shield}
                  label="Enable 2FA"
                  description="Add an extra layer of security with an authenticator app"
                  checked={twoFactor}
                  onChange={setTwoFactor}
                />
                {twoFactor && (
                  <div className="ml-7 rounded-lg border border-border bg-[#05060F] p-4">
                    <p className="text-sm text-muted-foreground">
                      Scan the QR code with your authenticator app to complete setup.
                    </p>
                    <div className="mt-3 flex h-32 w-32 items-center justify-center rounded-lg border border-border bg-white">
                      <span className="text-xs text-gray-500">QR Code</span>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            <Section title="Sessions">
              <div className="space-y-5">
                <Toggle
                  icon={Bell}
                  label="New login alerts"
                  description="Email me when a new device logs into my account"
                  checked={sessionAlerts}
                  onChange={setSessionAlerts}
                />
              </div>
              <div className="mt-5 space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Active sessions</div>
                {[
                  { device: "Chrome · macOS", location: "Lagos, NG", current: true },
                  { device: "Safari · iPhone", location: "Lagos, NG", current: false },
                ].map((s) => (
                  <div
                    key={s.device}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {s.device}
                        {s.current && (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{s.location}</div>
                    </div>
                    {!s.current && (
                      <button className="text-xs text-destructive hover:underline">
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {/* ─── API Keys ─── */}
        {tab === "api" && (
          <>
            <Section
              title="API Access"
              description="Generate API keys for programmatic access to your H~Mltd account"
            >
              <div className="rounded-lg border border-border bg-[#05060F] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Production Key</div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span>hm_live_••••••••••••••••••••k7x9</span>
                      <ApiKeyToggle />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-md border border-border px-3 py-1.5 text-xs transition hover:bg-[#101730]">
                      Copy
                    </button>
                    <button className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10">
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-[#05060F] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Test Key</div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span>hm_test_••••••••••••••••••••q2m4</span>
                      <ApiKeyToggle />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-md border border-border px-3 py-1.5 text-xs transition hover:bg-[#101730]">
                      Copy
                    </button>
                    <button className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10">
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Webhooks" description="Receive real-time events via HTTP POST">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground">
                  No webhooks configured
                </div>
                <button className="rounded-lg gradient-bg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
                  Add Endpoint
                </button>
              </div>
            </Section>

            <Section title="API Documentation">
              <button className="flex w-full items-center justify-between rounded-lg border border-border p-4 text-left transition hover:bg-[#101730]">
                <div>
                  <div className="text-sm font-medium">View API Reference</div>
                  <div className="text-xs text-muted-foreground">
                    Full REST API documentation with examples
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function ApiKeyToggle() {
  const [visible, setVisible] = useState(false);
  return (
    <button
      onClick={() => setVisible(!visible)}
      className="text-muted-foreground hover:text-foreground transition"
      title={visible ? "Hide" : "Show"}
    >
      {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}
