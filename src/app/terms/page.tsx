import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { H2, P, UL, Mail, SUPPORT_EMAIL } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service — LawPower AI", description: "The terms for using LawPower AI." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <P>
        These Terms of Service (&quot;Terms&quot;) govern your use of LawPower AI (&quot;LawPower&quot;, &quot;we&quot;, &quot;us&quot;) at lawpower.ai. By
        signing in or using LawPower, you agree to these Terms. If you use LawPower on behalf of a firm, you confirm you are authorized to accept
        these Terms for it.
      </P>

      <H2>1. The service</H2>
      <P>
        LawPower is a workspace for law firms: tasks and boards, clients, matters and records, documents and PDF editing, time tracking, an inbox
        and calendar view of your connected accounts, Dropbox access, and AI features. Some features may be labeled beta and may change.
      </P>

      <H2>2. Accounts and workspaces</H2>
      <UL>
        <li>You sign in with a Google or Microsoft account and are responsible for activity under your account.</li>
        <li>Workspace owners and admins control who joins their workspace and their roles.</li>
        <li>Keep your sign-in secure and tell us promptly about any unauthorized use.</li>
      </UL>

      <H2>3. Your content</H2>
      <P>
        You and your firm own the content you put into LawPower. You give us permission to host, process and display it only as needed to provide
        and secure the service for you. Our handling of information is described in our <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
      </P>
      <P>You are responsible for having the rights and consents needed for the content you add and the accounts you connect.</P>

      <H2>4. Connected services</H2>
      <P>
        When you connect Google, Microsoft or Dropbox, you authorize LawPower to access those accounts as described when you connect them. Those
        services are governed by their own terms. You can disconnect them at any time.
      </P>

      <H2>5. AI features and professional responsibility</H2>
      <UL>
        <li>AI output can be inaccurate or incomplete. Review it before relying on it.</li>
        <li>LawPower does not provide legal, tax or accounting advice and does not create an attorney-client relationship.</li>
        <li>You remain responsible for your professional obligations, including competence, supervision and client confidentiality, and for decisions about what information to process with AI features.</li>
        <li>Drafts produced by LawPower are drafts for attorney review.</li>
      </UL>

      <H2>6. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>use LawPower for anything unlawful, or to infringe others&apos; rights;</li>
        <li>attempt to access accounts or data that aren&apos;t yours, or bypass security or usage limits;</li>
        <li>upload malware or interfere with the service;</li>
        <li>reverse engineer the service except as allowed by law, or resell it without our permission.</li>
      </UL>

      <H2>7. Fees</H2>
      <P>
        If you use a paid plan, the fees and billing terms shown to you at purchase apply. We may change prices for future billing periods with
        advance notice.
      </P>

      <H2>8. Suspension and termination</H2>
      <P>
        You can stop using LawPower at any time and ask us to delete your account. We may suspend or end access for violations of these Terms or
        to protect the service or others. On termination you may request an export of your content within 30 days.
      </P>

      <H2>9. Disclaimers</H2>
      <P>
        LawPower is provided &quot;as is&quot; and &quot;as available&quot;. To the extent permitted by law, we disclaim all warranties, express or implied,
        including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee the service will be uninterrupted or
        error-free.
      </P>

      <H2>10. Limitation of liability</H2>
      <P>
        To the extent permitted by law, LawPower will not be liable for indirect, incidental, special, consequential or punitive damages, or for
        lost profits, revenue or data. Our total liability for any claim relating to the service is limited to the amount you paid us for the
        service in the 12 months before the claim.
      </P>

      <H2>11. Indemnity</H2>
      <P>
        You agree to defend and indemnify LawPower against claims arising from your content, your use of the service in violation of these Terms,
        or your violation of law or third-party rights.
      </P>

      <H2>12. Changes to these Terms</H2>
      <P>
        We may update these Terms. We will post the new version here with a new date, and notify you of material changes. Continuing to use
        LawPower after changes take effect means you accept them.
      </P>

      <H2>13. Contact us</H2>
      <P>
        Questions about these Terms or the service: <Mail to={SUPPORT_EMAIL} />.
      </P>
    </LegalPage>
  );
}
