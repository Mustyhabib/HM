import { Link } from "react-router";
import { Shield } from "lucide-react";
import { LEGAL_NAME, MAILING_ADDRESS, SUPPORT_EMAIL } from "@/lib/company";

const LAST_UPDATED = "1 August 2026";

export function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">

      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Shield className="h-3 w-3" /> Legal
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-elevated/50 p-4">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            H~Mltd is committed to protecting your personal information. This policy explains what
            we collect, why, and how — in plain language, in compliance with the{" "}
            <strong className="text-foreground">Nigerian Data Protection Act (NDPA) 2023</strong>.
          </p>
        </div>
      </div>

      {/* ─── Sections ─────────────────────────────────────────────────── */}
      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">1. Who We Are</h2>
          <p>
            H~Mltd ("we", "us", "our") is the data controller for personal information processed
            through this platform. If you have privacy questions, contact our data protection team
            at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">2. What We Collect</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Category</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Data collected</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  {
                    cat: "Account",
                    data: "Email address, password (bcrypt hash)",
                    purpose: "Authentication and account management",
                  },
                  {
                    cat: "Billing",
                    data: "Paystack customer ID, subscription status, plan tier",
                    purpose: "Payment processing — card details are never stored by us",
                  },
                  {
                    cat: "Usage",
                    data: "Research prompts, run history, result artifacts",
                    purpose: "Delivering the Service to you",
                  },
                  {
                    cat: "Technical",
                    data: "IP address, browser type, request timestamps",
                    purpose: "Security, fraud prevention, diagnostic logs",
                  },
                  {
                    cat: "Preferences",
                    data: "UI theme (dark/light), sidebar collapse state",
                    purpose: "Personalising your interface experience",
                  },
                ].map(({ cat, data, purpose }) => (
                  <tr key={cat} className="hover:bg-elevated/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">{cat}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{data}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">3. Legal Basis for Processing</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>
              <strong className="text-foreground">Contract performance:</strong> Processing your
              prompts and delivering research reports is necessary to fulfil the subscription
              agreement.
            </li>
            <li>
              <strong className="text-foreground">Legitimate interest:</strong> Security monitoring,
              fraud prevention, and aggregate service analytics.
            </li>
            <li>
              <strong className="text-foreground">Legal obligation:</strong> Retaining billing
              records as required by Nigerian tax law.
            </li>
            <li>
              <strong className="text-foreground">Consent:</strong> Sending marketing communications —
              you may opt out at any time from your profile settings.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">4. How We Use Your Data</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>To create and manage your account.</li>
            <li>To process payments securely through Paystack.</li>
            <li>To run AI research agents on your behalf and return results.</li>
            <li>To send transactional emails (account confirmations, billing receipts, run notifications).</li>
            <li>To detect and prevent abuse, fraud, and unauthorised access.</li>
            <li>To improve the platform using anonymised, aggregated usage patterns — we never use individual prompts for this.</li>
          </ul>
          <div className="mt-4 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
            <p className="font-medium text-foreground">
              We do not sell your personal data. We do not share it with third parties for advertising or marketing.
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">5. Third-Party Processors</h2>
          <p className="mb-3">
            We share data only with processors that are necessary to operate the Service:
          </p>
          <div className="space-y-2">
            {[
              {
                name: "Supabase",
                role: "Database, authentication, and file storage. Infrastructure hosted in the US/EU. Supabase processes data under a Data Processing Agreement.",
              },
              {
                name: "Paystack",
                role: "Payment processing. Nigerian-registered company, PCI-DSS compliant. They process your card details directly — we receive only a subscription ID and status.",
              },
              {
                name: "DeepSeek / LLM provider",
                role: "AI inference for research reports. Your research prompts may be sent to the model provider for processing. We do not send personally identifiable information alongside prompts.",
              },
            ].map(({ name, role }) => (
              <div key={name} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                <span className="shrink-0 font-mono text-xs font-bold text-primary">{name}</span>
                <span className="text-xs text-muted-foreground">{role}</span>
              </div>
            ))}
          </div>
          <p className="mt-3">
            All processors are contractually bound to handle your data according to applicable
            data protection law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">6. Data Retention</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Data type</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Retained for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { type: "Account data",       period: "Duration of account + 30 days after deletion request" },
                  { type: "Run history & files", period: "12 months from run date, then automatically deleted"  },
                  { type: "Billing records",     period: "7 years (Nigerian tax compliance)"                    },
                  { type: "Technical logs",      period: "90 days, then purged"                                 },
                ].map(({ type, period }) => (
                  <tr key={type} className="hover:bg-elevated/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">{type}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">7. Your Rights (NDPA 2023)</h2>
          <p className="mb-3">
            Under the Nigerian Data Protection Act 2023, you have the right to:
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <strong className="text-foreground">Access</strong> — request a copy of the personal
              data we hold about you.
            </li>
            <li>
              <strong className="text-foreground">Correct</strong> — have inaccurate or incomplete
              data corrected.
            </li>
            <li>
              <strong className="text-foreground">Delete</strong> — request deletion of your personal
              data (subject to legal retention obligations).
            </li>
            <li>
              <strong className="text-foreground">Object</strong> — object to processing based on
              legitimate interests.
            </li>
            <li>
              <strong className="text-foreground">Portability</strong> — receive your data in a
              structured, machine-readable format.
            </li>
            <li>
              <strong className="text-foreground">Withdraw consent</strong> — at any time where
              processing is consent-based (e.g. marketing emails).
            </li>
          </ul>
          <p className="mt-4">
            To exercise any of these rights, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            . We will respond within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">8. Security</h2>
          <p>
            We protect your data using industry-standard measures:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>TLS encryption for all data in transit.</li>
            <li>Row-Level Security (RLS) in our database — each user can only access their own data.</li>
            <li>bcrypt hashing for passwords — we never store plaintext credentials.</li>
            <li>Access controls and least-privilege principles for internal systems.</li>
          </ul>
          <p className="mt-3">
            No system is 100% secure. If you discover a security vulnerability, please report it
            responsibly to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">9. Cookies & Local Storage</h2>
          <p>
            We use functional cookies and browser local storage for:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>Authentication session tokens (required for login).</li>
            <li>UI preferences such as theme and sidebar state.</li>
          </ul>
          <p className="mt-3">
            We do not use third-party advertising trackers, analytics cookies, or fingerprinting.
            Disabling cookies in your browser will prevent authentication from functioning.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">10. Children's Privacy</h2>
          <p>
            The Service is not directed at persons under 18. We do not knowingly collect personal
            data from minors. If you believe a minor has created an account, contact us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            and we will delete the account promptly.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you by email
            before material changes take effect. The "Last updated" date at the top of this
            page reflects the current version. Continued use after the effective date constitutes
            acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">12. Contact & Complaints</h2>
          <p>
            For privacy enquiries or to exercise your NDPA rights, contact our Data Protection
            Officer at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <p className="mt-3">
            If you believe your data protection rights have been violated, you may lodge a complaint
            with the{" "}
            <strong className="text-foreground">Nigeria Data Protection Commission (NDPC)</strong>{" "}
            at{" "}
            <a
              href="https://ndpc.gov.ng"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              ndpc.gov.ng
            </a>
            .
          </p>
          <p className="mt-3">
            See also our{" "}
            <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
            {" "}and{" "}
            <Link to="/docs" className="text-primary hover:underline">Documentation</Link>.
          </p>

          {/* ─── Registrant block — required for Privacy Policy enforceability ───── */}
          <div className="mt-5 rounded-lg border border-border bg-elevated/50 p-4">
            <p className="mb-2 font-medium text-foreground">Registrant</p>
            <p>{LEGAL_NAME}</p>
            <p>
              Contact:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p>Mailing address: {MAILING_ADDRESS}</p>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Registered in Nigeria.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
