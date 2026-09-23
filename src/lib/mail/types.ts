export type MailProvider = "google" | "microsoft";

export type MailSummary = {
  id: string;
  threadId: string | null;
  from: string; // display name, or address
  fromEmail: string;
  subject: string;
  snippet: string;
  date: string; // ISO
  unread: boolean;
  hasAttachments: boolean;
};

export type MailMessage = MailSummary & {
  to: string;
  cc: string;
  html: string | null;
  text: string | null;
  attachments: { name: string; size: number; mimeType: string }[];
  webLink: string | null;
};

export type MailPage = { messages: MailSummary[]; nextPageToken: string | null };
