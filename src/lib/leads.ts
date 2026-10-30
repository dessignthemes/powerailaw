// Potential leads (shared by the browser and the server).

export const LEAD_STATUSES = ["invited", "new", "contacted", "converted", "declined"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  invited: "Link sent",
  new: "New",
  contacted: "Contacted",
  converted: "Client",
  declined: "Declined",
};

// What the firm helps with (the form's "What do you need help with?").
export const MATTER_TYPES = [
  "Buying a home or property",
  "Selling a home or property",
  "Refinance",
  "Wills, trusts & estate planning",
  "Probate / estate administration",
  "Immigration",
  "Business law",
  "Landlord / tenant",
  "Other",
];

export const CONTACT_WAYS = ["Phone call", "Text message", "Email"];

// What a prospective client fills in.
export type LeadForm = {
  title: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  matterType: string;
  description: string;
  otherParties: string;
  preferredContact: string;
  bestTime: string;
  referredBy: string;
};

export type Lead = LeadForm & {
  id: string;
  status: LeadStatus;
  source: "website" | "link" | "manual";
  notes: string;
  clientId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const leadName = (l: Pick<Lead, "title" | "firstName" | "lastName" | "company" | "email">) =>
  [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || l.email || "Unnamed";
