import type { Metadata } from "next";
import LegalPage, { H2, H3, P, UL, LEGAL_CONTACT } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — LawPower AI", description: "How LawPower AI collects, uses and protects information." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <P>
        LawPower AI (&quot;LawPower&quot;, &quot;we&quot;, &quot;us&quot;) is a practice-management workspace for law firms, available at lawpower.ai. This
        policy explains what information we collect, how we use it, who we share it with, and the choices you have. It applies to the LawPower AI
        website and application.
      </P>

      <H2>1. Information we collect</H2>
      <H3>Account information</H3>
      <P>
        When you sign in with Google or Microsoft, we receive your name, email address and a unique account identifier from that provider. We use
        them to create and secure your account and your firm&apos;s workspace.
      </P>
      <H3>Content you add to LawPower</H3>
      <P>
        Clients, matters, contacts, tasks, notes, time entries, documents and files you upload, accounting records and receipts, AI conversations
        and saved memories. This content belongs to you and your firm.
      </P>
      <H3>Information from services you connect</H3>
      <P>Only if you choose to connect them, and only for your own account:</P>
      <UL>
        <li>
          <strong>Email (Gmail or Outlook):</strong> read-only access to show your mailbox inside LawPower, to turn emails you choose into tasks,
          and, when you ask, to let the AI Agent search and read messages to answer your question. We do not send, move or delete email.
        </li>
        <li>
          <strong>Calendar (Google Calendar or Outlook):</strong> access to show your events, and to create, edit or delete events when you do so in
          LawPower or confirm a proposal.
        </li>
        <li>
          <strong>Dropbox:</strong> read-only access to browse and preview your files, and to copy a file into LawPower when you choose to.
        </li>
      </UL>
      <P>
        To keep these connections working, we store access tokens for the services you connect. You can disconnect at any time in LawPower, or
        revoke access in your Google, Microsoft or Dropbox account settings.
      </P>
      <H3>Technical information</H3>
      <P>
        Basic logs (such as IP address, browser type, pages requested and error reports) and cookies that keep you signed in. We do not use
        advertising cookies or third-party ad trackers.
      </P>

      <H2>2. How we use information</H2>
      <UL>
        <li>To provide, maintain and secure the features you use.</li>
        <li>To run AI features you request, such as answering questions, summarizing documents or categorizing transactions (see section 4).</li>
        <li>To provide support and communicate with you about your account and the service.</li>
        <li>To comply with legal obligations and enforce our terms.</li>
      </UL>
      <P>We do not sell personal information, and we do not use your content or connected-account data for advertising.</P>

      <H2>3. Google user data</H2>
      <P>
        LawPower AI&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </P>
      <P>Specifically, data we receive from Google APIs (for example Gmail messages and Google Calendar events):</P>
      <UL>
        <li>is used only to provide or improve user-facing features that are visible and prominent in LawPower;</li>
        <li>is not transferred to others, except as necessary to provide those features, to comply with law, or as part of a merger or acquisition with notice to you;</li>
        <li>is not used for advertising, and is not sold;</li>
        <li>is not used to develop, improve or train generalized or non-personalized AI or machine-learning models;</li>
        <li>is not read by humans, unless you give us permission for a specific message (for example for support), it is necessary for security purposes, or it is required by law.</li>
      </UL>

      <H2>4. AI features</H2>
      <P>
        When you use the AI Agent or AI Accountant, the content needed to answer your request (your message, relevant document excerpts, the
        selected matter&apos;s details, and any emails or calendar events the Agent looks up for you) is sent to our AI provider, OpenAI, through its
        business API to generate the response. Under OpenAI&apos;s API terms, this data is not used to train OpenAI&apos;s models. AI output can be
        wrong; LawPower is a tool for legal professionals and does not provide legal, tax or accounting advice.
      </P>

      <H2>5. How we share information</H2>
      <P>We share information only as needed to run the service, with providers bound by confidentiality and data-protection obligations:</P>
      <UL>
        <li><strong>Supabase</strong> — database, sign-in and file storage (United States).</li>
        <li><strong>Vercel</strong> — application hosting.</li>
        <li><strong>OpenAI</strong> — AI processing for features you use.</li>
        <li><strong>Google, Microsoft and Dropbox</strong> — only to connect the accounts you choose to connect.</li>
      </UL>
      <P>
        Within your firm, content in a workspace is visible to the members of that workspace according to their roles. Connected mailboxes,
        calendars and Dropbox accounts are visible only to the person who connected them. We may also disclose information if required by law, to
        protect rights and safety, or in connection with a merger or acquisition, with notice to you.
      </P>

      <H2>6. Security</H2>
      <P>
        Data is encrypted in transit (HTTPS). Workspace data is separated by workspace and protected with access controls, and files are stored
        privately and shared only through short-lived links. No system is perfectly secure, but we work to protect your information and will notify
        affected users of a breach as required by law.
      </P>

      <H2>7. Retention and deletion</H2>
      <P>
        We keep your information while your account is active. You can delete content in LawPower at any time and disconnect connected services
        at any time. To delete your account and its data, email us at {LEGAL_CONTACT}; we will delete it within 30 days, except where we must keep
        certain records by law. Backups are overwritten on a rolling schedule.
      </P>

      <H2>8. Your choices and rights</H2>
      <P>
        You can access, correct, export or delete your information, disconnect services, and withdraw consent by contacting us. Depending on where
        you live, you may have additional rights under laws such as the CCPA or GDPR; contact us to exercise them.
      </P>

      <H2>9. Professional confidentiality</H2>
      <P>
        Law firms using LawPower remain responsible for their professional obligations, including client confidentiality and decisions about what
        client information to store or process with AI features.
      </P>

      <H2>10. Children</H2>
      <P>LawPower is for professionals and is not intended for anyone under 18. We do not knowingly collect information from children.</P>

      <H2>11. Changes to this policy</H2>
      <P>We may update this policy. We will post the new version here with a new date, and notify you of material changes.</P>
    </LegalPage>
  );
}
