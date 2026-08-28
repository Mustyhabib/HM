import { Link } from "react-router";
import { Scale } from "lucide-react";
import { LEGAL_NAME, MAILING_ADDRESS, SUPPORT_EMAIL } from "@/lib/company";

const LAST_UPDATED = "1 August 2026";

export function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">

      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Scale className="h-3 w-3" /> Legal
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          These Terms of Service govern your use of the H~Mltd platform. By creating an
          account or accessing the Service you agree to be bound by them. Please read
          them carefully.
        </p>
      </div>

      {/* ─── Sections ─────────────────────────────────────────────────── */}
      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>
            By creating an account or using H~Mltd ("the Service", "the Platform", "we", "us",
            "our"), you confirm that you have read, understood, and agree to be bound by these
            Terms of Service. If you do not agree, do not use the Service. These Terms are
            governed by the laws of the Federal Republic of Nigeria.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">2. Service Description</h2>
          <p>
            H~Mltd is an AI-powered trading research platform. The Service allows subscribers
            to submit natural-language research queries which are processed by an AI agent to
            produce research reports, backtests, and quantitative analysis. The Service is{" "}
            <strong className="text-foreground">research and education only</strong> — it does
            not execute live trades, connect to broker accounts, or manage funds on your behalf.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">3. Eligibility</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>You must be at least 18 years old to use the Service.</li>
            <li>You must provide accurate account information and keep it current.</li>
            <li>One account per person. Sharing accounts is not permitted.</li>
            <li>Corporate accounts must be registered and used by an authorised representative of the entity.</li>
            <li>Accounts used in violation of these Terms may be suspended without notice.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">4. Subscriptions & Billing</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>Subscriptions are billed monthly in Nigerian Naira (NGN) via Paystack.</li>
            <li>All plans include unlimited agent runs. You supply your own LLM API key (BYOK) and pay the LLM provider directly for token usage.</li>
            <li>Subscriptions renew automatically unless cancelled before the renewal date.</li>
            <li>You may cancel at any time from your billing settings. Access continues until the end of the current paid period.</li>
            <li>We may update prices with 30 days' written notice by email. Continued use after the effective date constitutes acceptance of the new price.</li>
            <li>Subscription fees paid for the current billing period are non-refundable, except where required by applicable Nigerian consumer protection law.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">5. Runs & Refund Policy</h2>
          <p>
            Each prompt submission triggers an agent run. You supply your own LLM API key and
            pay the LLM provider directly for token usage. The platform does not charge per run.
          </p>
          <ul className="ml-4 mt-3 list-disc space-y-1.5">
            <li>
              <strong className="text-foreground">System errors</strong> (infrastructure failures,
              internal timeouts, platform bugs) — the run is flagged and does not count against
              any safety rate limits.
            </li>
            <li>
              <strong className="text-foreground">Input errors</strong> (invalid ticker, unsupported
              market, malformed query) — LLM tokens consumed are billed by your provider; the
              platform has no involvement in that billing.
            </li>
          </ul>
          <p className="mt-3">
            Subscription fees paid for the current billing period are non-refundable, except where
            required by applicable Nigerian consumer protection law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">6. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>Violate any applicable law or regulation.</li>
            <li>Facilitate illegal financial activities, market manipulation, or securities fraud.</li>
            <li>Reverse-engineer, decompile, or extract data from the platform in bulk.</li>
            <li>Use automated scripts, bots, or programs to submit prompts beyond the platform's safety rate limits.</li>
            <li>Share your account credentials with other persons.</li>
            <li>Misrepresent AI-generated research outputs as certified professional financial advice.</li>
            <li>Attempt to circumvent rate limits, access controls, or billing mechanisms.</li>
            <li>Submit prompts designed to probe system internals, extract model weights, or extract proprietary algorithm details.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to suspend or terminate accounts that violate these usage rules.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">7. No Financial Advice</h2>
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 mb-3">
            <p className="font-medium text-foreground">Important disclaimer</p>
          </div>
          <p>
            All content produced by the Service — including research reports, backtests, alpha
            factor scores, and strategy analyses — is for{" "}
            <strong className="text-foreground">informational and educational purposes only</strong>.
            It does not constitute financial advice, investment advice, trading advice, or a
            recommendation to buy, hold, or sell any security, asset, or financial instrument.
          </p>
          <p className="mt-3">
            Past performance of backtested strategies is not indicative of future results. Trading
            financial markets involves significant risk of loss. Always consult a licensed and
            regulated financial adviser before making investment decisions.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">8. Intellectual Property</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>
              The H~Mltd platform, brand, UI, software, and underlying AI system are owned by
              H~Mltd and protected by applicable intellectual property laws.
            </li>
            <li>
              Research reports and analysis produced from your prompts belong to you. You may
              use them for personal, professional, or commercial purposes.
            </li>
            <li>
              You grant us a limited licence to process your prompts and inputs to deliver the
              Service. We do not claim ownership of your research questions.
            </li>
            <li>
              We retain the right to use anonymised, aggregated usage patterns to improve the
              platform. We will never reproduce your individual prompts or results externally.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">9. Service Availability</h2>
          <p>
            We aim to provide the Service continuously, but we do not guarantee uninterrupted
            availability. Planned maintenance, infrastructure upgrades, and unforeseen incidents
            may cause downtime. We are not liable for losses resulting from temporary unavailability.
          </p>
          <p className="mt-3">
            If a system outage causes a run to fail, the run credit will be refunded per Section 5.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by Nigerian law, H~Mltd's total aggregate liability
            to you for any claims arising out of or related to your use of the Service shall not
            exceed the total amount you paid for the Service in the three (3) months immediately
            preceding the claim.
          </p>
          <p className="mt-3">
            We are not liable for any indirect, incidental, special, consequential, or punitive
            damages — including trading losses, missed opportunities, loss of profits, or data
            loss — arising from your use of, or inability to use, the Service or its outputs.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">11. Termination</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1.5">
            <li>We may suspend or terminate your account if you violate these Terms, with or without prior notice.</li>
            <li>You may delete your account at any time from your profile settings.</li>
            <li>On termination, your data is retained for 30 days before deletion (see our Privacy Policy).</li>
            <li>Termination does not entitle you to a refund of subscription fees for the current period.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">12. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you by email at least
            14 days before material changes take effect. Continued use of the Service after the
            effective date constitutes acceptance of the revised Terms. The "Last updated" date
            above reflects the current version.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">13. Governing Law & Disputes</h2>
          <p>
            These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute
            arising from or related to these Terms or your use of the Service shall first be
            attempted to be resolved through good-faith negotiation. If unresolved, disputes
            shall be submitted to the jurisdiction of the courts of Nigeria.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">14. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            or read our{" "}
            <Link to="/docs" className="text-primary hover:underline">
              documentation
            </Link>
            {" "}and{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>

          {/* ─── Registrant block — required for ToS enforceability ───── */}
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
