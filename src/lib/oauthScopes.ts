// Shared between /login (sign in) and /connect (mailbox connect flow) so
// the scopes requested from Google/Microsoft never drift out of sync.

export const GOOGLE_BASE_SCOPES = ["openid", "email", "profile"];
export const MICROSOFT_BASE_SCOPES = ["openid", "email", "profile", "offline_access", "User.Read"];

export type MailboxItem = {
  key: "mail" | "calendar" | "files" | "contacts";
  label: string;
  desc: string;
  scope: string;
};

export const GOOGLE_MAILBOX_ITEMS: MailboxItem[] = [
  {
    key: "mail",
    label: "Gmail",
    desc: "New client emails and documents get routed to your team the moment they arrive.",
    // Read mail and change read / unread (no sending, no deleting).
    scope: "https://www.googleapis.com/auth/gmail.modify",
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
    // Read mail and change read / unread (LawPower doesn't send or delete mail).
    scope: "Mail.ReadWrite",
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
  {
    key: "contacts",
    label: "Outlook Contacts",
    desc: "Bring your Outlook contacts into LawPower Contacts, and new ones as you add them (read only).",
    scope: "Contacts.Read",
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
