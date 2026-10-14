// Who a task is waiting on. Shown on the card and as Task Board filters.
export const WAITING_ON = ["client", "lender", "title", "seller", "buyer"] as const;
// The usual parties; a firm can also use its own ("Surveyor", "Opposing counsel").
export type WaitingOn = string;
export const WAITING_LABEL: Record<(typeof WAITING_ON)[number], string> = {
  client: "Client",
  lender: "Lender",
  title: "Title company",
  seller: "Seller",
  buyer: "Buyer",
};
