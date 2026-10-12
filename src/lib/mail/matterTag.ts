// The matter number written into email subjects, e.g. "[REP-2026-0001] Closing date".
// Replies keep the subject, so they find their way back to the matter.

export const MATTER_NUMBER_RE = /\b[A-Z][A-Z0-9]{1,5}-\d{4}-\d{4,}\b/g;

// The first matter number in the subject that belongs to one of the firm's matters.
export function matterTag<T>(subject: string, byNumber: Map<string, T>): T | null {
  for (const n of subject.toUpperCase().match(MATTER_NUMBER_RE) ?? []) {
    const hit = byNumber.get(n);
    if (hit) return hit;
  }
  return null;
}

export function subjectWithTag(subject: string, number: string | null | undefined): string {
  const s = subject.trim();
  if (!number || s.toUpperCase().includes(number)) return s;
  return s ? `[${number}] ${s}` : `[${number}]`;
}

// Links that open a new email, already filled in, in the person's own mail.
export function composeLinks(to: string, subject: string, body: string) {
  const enc = encodeURIComponent;
  return {
    google: `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`,
    microsoft: `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`,
    app: `mailto:${to.split(/[,;]\s*/).map(enc).join(",")}?subject=${enc(subject)}&body=${enc(body)}`,
  };
}

// Opens the phone's Messages app with the text filled in (iPhone, Android, Mac).
export function smsLink(phone: string, body: string) {
  const num = phone.replace(/[^\d+]/g, "");
  return `sms:${num}${/iPhone|iPad|Mac/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
