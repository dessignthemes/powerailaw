// Features built for one firm (The Law Office of Piotr Rapciewicz, LLC): its Word
// templates, letters and the LEAP import. Shared by server and browser code.
export const TEMPLATE_DOMAINS = ["rapciewiczlaw.com"];

export const templatesAllowed = (email: string | null | undefined) =>
  !!email && TEMPLATE_DOMAINS.includes(email.split("@").pop()?.toLowerCase() ?? "");
