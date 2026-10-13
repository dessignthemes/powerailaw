// Who a task is waiting on. Shown on the card and as Task Board filters.
export const WAITING_ON = ["client", "lender", "title", "seller", "buyer"] as const;
export type WaitingOn = (typeof WAITING_ON)[number];
export const WAITING_LABEL: Record<WaitingOn, string> = {
  client: "Client",
  lender: "Lender",
  title: "Title company",
  seller: "Seller",
  buyer: "Buyer",
};
