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

export type FolderKind = "inbox" | "drafts" | "sent" | "trash" | "junk" | "archive" | "starred" | "important" | "custom";

export type MailFolder = {
  id: string;
  name: string;
  kind: FolderKind;
  parentId: string | null;
  unread: number;
  total: number | null;
};
