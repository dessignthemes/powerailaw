// Fields a signer fills. Positions are fractions of the page (top-left origin),
// so they work at any zoom and map exactly onto the PDF page.

export type FieldType = "signature" | "initials" | "date" | "name" | "text" | "checkbox";

export type SignField = {
  id: string;
  type: FieldType;
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  required: boolean;
};

export const FIELD_META: Record<FieldType, { label: string; w: number; h: number }> = {
  signature: { label: "Signature", w: 0.28, h: 0.06 },
  initials: { label: "Initials", w: 0.1, h: 0.05 },
  date: { label: "Date signed", w: 0.16, h: 0.03 },
  name: { label: "Full name", w: 0.25, h: 0.03 },
  text: { label: "Text", w: 0.25, h: 0.03 },
  checkbox: { label: "Checkbox", w: 0.025, h: 0.02 },
};

export type SignStatus = "sent" | "viewed" | "signed" | "declined" | "cancelled";

export type SignRequest = {
  id: string;
  documentId: string;
  versionId: string;
  signerName: string;
  signerEmail: string;
  message: string;
  status: SignStatus;
  expiresAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  declineReason: string | null;
  signedVersionId: string | null;
  createdAt: string;
  createdByEmail: string | null;
};

export const STATUS_LABEL: Record<SignStatus, string> = {
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const CONSENT_TEXT =
  "I agree to sign this document electronically. My electronic signature is the legal equivalent of my handwritten signature, and I consent to doing business electronically.";
