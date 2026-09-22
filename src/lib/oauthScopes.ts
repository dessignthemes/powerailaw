// Shared between /login (sign in) and /connect (mailbox connect flow) so
// the scopes requested from Google/Microsoft never drift out of sync.

export const GOOGLE_BASE_SCOPES = ["openid", "email", "profile"];
export const MICROSOFT_BASE_SCOPES = ["openid", "email", "profile", "offline_access", "User.Read"];

export type MailboxItem = {
  key: "mail" | "calendar" | "files";
  label: string;
  desc: string;
  scope: string;
};

export const GOOGLE_MAILBOX_ITEMS: MailboxItem[] = [
  {
    key: "mail",
    label: "Gmail",
    desc: "New client emails and documents get routed to your team the moment they arrive.",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  },
  {
    key: "calendar",
    label: "Google Calendar",
    desc: "Deadlines and hearings land on the calendar you already check.",
    scope: "https://www.googleapis.com/auth/calendar",
  },
  {
    key: "files",
    label: "Google Drive",
    desc: "Assigned documents show up as files your whole team can see.",
    scope: "https://www.googleapis.com/auth/drive.readonly",
  },
];

export const MICROSOFT_MAILBOX_ITEMS: MailboxItem[] = [
  {
    key: "mail",
    label: "Outlook Mail",
    desc: "New client emails and documents get routed to your team the moment they arrive.",
    scope: "Mail.Read",
  },
  {
    key: "calendar",
    label: "Outlook Calendar",
    desc: "Deadlines and hearings land on the calendar you already check.",
    scope: "Calendars.ReadWrite",
  },
  {
    key: "files",
    label: "OneDrive Files",
    desc: "Assigned documents show up as files your whole team can see.",
    scope: "Files.Read",
  },
];

export const GOOGLE_FULL_SCOPES = [
  ...GOOGLE_BASE_SCOPES,
  ...GOOGLE_MAILBOX_ITEMS.map((i) => i.scope),
].join(" ");

export const MICROSOFT_FULL_SCOPES = [
  ...MICROSOFT_BASE_SCOPES,
  ...MICROSOFT_MAILBOX_ITEMS.map((i) => i.scope),
].join(" ");
