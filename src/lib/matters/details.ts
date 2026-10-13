// Matter details: the parties, property and contract figures each matter type needs.
// Purchase (REP): our client is the buyer. Sale (RES): our client is the seller.

export type DetailKind = "text" | "money" | "email" | "phone" | "names";
export type DetailField = { key: string; label: string; kind?: DetailKind; placeholder?: string };
export type DetailSection = { id: string; title: string; client?: boolean; fields: DetailField[] };
export type DetailValue = { value: string; source?: string | null; manual?: boolean };
export type MatterDetails = Record<string, DetailValue>;

const contact = (prefix: string, who: string, firmLabel: string): DetailField[] => [
  { key: `${prefix}Firm`, label: firmLabel },
  { key: `${prefix}Name`, label: who },
  { key: `${prefix}Email`, label: "Email", kind: "email" },
  { key: `${prefix}Phone`, label: "Phone", kind: "phone" },
];
const party = (prefix: "buyer" | "seller", label: string): DetailField[] => [
  { key: `${prefix}Names`, label, kind: "names", placeholder: "Names, separated by commas" },
  { key: `${prefix}Email`, label: "Email", kind: "email" },
  { key: `${prefix}Phone`, label: "Phone", kind: "phone" },
  { key: `${prefix}Address`, label: "Current address" },
];

const PROPERTY: DetailSection = {
  id: "property",
  title: "Property",
  fields: [
    { key: "property", label: "Address" },
    { key: "county", label: "County" },
  ],
};
const CONTRACT: DetailSection = {
  id: "contract",
  title: "Contract details",
  fields: [
    { key: "price", label: "Purchase price", kind: "money" },
    { key: "deposit1", label: "First deposit", kind: "money" },
    { key: "deposit2", label: "Second deposit", kind: "money" },
    { key: "totalDeposit", label: "Total deposit", kind: "money" },
    { key: "depositPayableTo", label: "Deposit payable to", placeholder: "Escrow holder (check payee)" },
    { key: "depositMailedTo", label: "Deposit mailed to", placeholder: "Escrow holder's address" },
    { key: "mortgageAmount", label: "Mortgage amount", kind: "money" },
    { key: "amountToClose", label: "Cash to close", kind: "money" },
  ],
};
const CLOSING: DetailSection = {
  id: "closing",
  title: "Settlement & lender",
  fields: [
    { key: "settlementAgent", label: "Settlement agent" },
    { key: "lender", label: "Lender" },
  ],
};
const MORE: DetailSection = {
  id: "more",
  title: "Additional",
  fields: [
    { key: "inspector", label: "Inspector" },
    { key: "surveyor", label: "Surveyor" },
    { key: "titleCompany", label: "Title company" },
  ],
};

export const PURCHASE_LAYOUT: DetailSection[] = [
  { id: "buyer", title: "Buyer (our client)", client: true, fields: party("buyer", "Buyer") },
  { id: "buyerAgent", title: "Buyer's realtor", fields: contact("buyerAgent", "Realtor", "Brokerage") },
  { id: "seller", title: "Seller", fields: party("seller", "Seller") },
  { id: "sellerAttorney", title: "Seller's attorney", fields: contact("sellerAttorney", "Attorney", "Law firm") },
  { id: "listingAgent", title: "Seller's realtor (listing)", fields: contact("listingAgent", "Listing agent", "Brokerage") },
  PROPERTY,
  CONTRACT,
  CLOSING,
  MORE,
];

export const SALE_LAYOUT: DetailSection[] = [
  { id: "seller", title: "Seller (our client)", client: true, fields: party("seller", "Seller") },
  { id: "listingAgent", title: "Seller's realtor (listing)", fields: contact("listingAgent", "Listing agent", "Brokerage") },
  { id: "buyer", title: "Buyer", fields: party("buyer", "Buyer") },
  { id: "buyerAttorney", title: "Buyer's attorney", fields: contact("buyerAttorney", "Attorney", "Law firm") },
  { id: "buyerAgent", title: "Buyer's realtor", fields: contact("buyerAgent", "Realtor", "Brokerage") },
  PROPERTY,
  CONTRACT,
  CLOSING,
  MORE,
];

const GENERAL_LAYOUT: DetailSection[] = [
  { id: "client", title: "Client", client: true, fields: [{ key: "clientNames", label: "Client", kind: "names" }, { key: "clientEmail", label: "Email", kind: "email" }, { key: "clientPhone", label: "Phone", kind: "phone" }] },
  { id: "other", title: "Other party", fields: [{ key: "otherNames", label: "Name", kind: "names" }, ...contact("otherAttorney", "Attorney", "Law firm")] },
];

export type Side = "buyer" | "seller" | null;

// Which layout a matter uses: sale codes (RES) put our client on the seller side.
export function layoutFor(m: { matterCode?: string | null; category?: string | null }): { layout: DetailSection[]; side: Side } {
  const code = (m.matterCode ?? "").toUpperCase();
  if (code === "RES" || /SALE/.test(code)) return { layout: SALE_LAYOUT, side: "seller" };
  if (code === "REP" || code === "REF" || m.category === "Real Estate") return { layout: PURCHASE_LAYOUT, side: "buyer" };
  return { layout: GENERAL_LAYOUT, side: null };
}

// Every field key the AI may fill.
export const AI_FIELDS = [
  ...new Set([...PURCHASE_LAYOUT, ...SALE_LAYOUT].flatMap((s) => s.fields.map((f) => f.key))),
];

const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Rough cash to close: price − deposits − mortgage (before closing costs and adjustments).
export function estimateToClose(d: MatterDetails): string | null {
  const price = num(d.price?.value);
  if (!price) return null;
  const rest = price - num(d.deposit1?.value) - num(d.deposit2?.value) - num(d.mortgageAmount?.value);
  return rest > 0 ? money(rest) : null;
}

export function cleanDetails(input: unknown): MatterDetails {
  const out: MatterDetails = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 120)) {
    if (!/^[a-zA-Z0-9]{1,40}$/.test(k) || !v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    const value = typeof x.value === "string" ? x.value.trim().slice(0, 500) : "";
    if (!value) continue;
    out[k] = { value, source: typeof x.source === "string" ? x.source.slice(0, 200) : null, ...(x.manual === true ? { manual: true } : {}) };
  }
  return out;
}
