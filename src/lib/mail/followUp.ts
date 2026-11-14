// Does an outgoing email ask the recipient for something? ("Please get back to me",
// "Please forward this to me", "I look forward to hearing from you"…). Plain
// phrase matching, no AI: only the part the person wrote is checked (not the
// quoted email underneath, not the signature).

const ASKS: RegExp[] = [
  /\bplease (get back|respond|reply|advise|confirm|let (me|us) know|send|forward|provide|email|call|sign|return|review and (sign|return|confirm))\b/i,
  /\bkindly (send|forward|provide|advise|confirm|respond|reply|let (me|us) know|return|sign)\b/i,
  /\b(can|could|would|will) you (please )?(send|forward|provide|confirm|let (me|us) know|get back|advise|email|call|sign|return|look into|check)\b/i,
  /\blet (me|us) know\b/i,
  /\b(i|we) (look|am looking|are looking) forward to (hearing|your (reply|response|answer))\b/i,
  /\b(i|we) (await|wait|am waiting|are waiting) (to hear|for your|your)\b/i,
  /\b(awaiting|waiting for|waiting on) (your|the) (reply|response|answer|confirmation|documents?|signature|feedback|approval)\b/i,
  /\bget back to (me|us)\b/i,
  /\bat your earliest convenience\b/i,
  /\b(please|kindly) .{0,40}\b(by|before) (monday|tuesday|wednesday|thursday|friday|tomorrow|end of (the )?(day|week)|eod|cob)\b/i,
];

// Polite sign-offs that don't really wait for anything.
const NOT_ASKS = /\b(let (me|us) know|please (feel free|do not hesitate|don't hesitate)|reach out|contact (me|us))\b.{0,30}\b(if|should) you (have|need|want)\b|\bif (you have )?any (further )?questions\b|\bdo not hesitate\b|\bdon't hesitate\b/i;

// The part of an email the sender wrote: above the quoted / forwarded email.
function ownPart(text: string): string {
  const cut = text.search(/\n\s*(-{2,}\s*(original message|forwarded message)|on .{6,80} wrote:|from:\s.+\n\s*sent:|_{8,})/i);
  return (cut < 0 ? text : text.slice(0, cut))
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
}

// The sentence that asks for something, or null.
export function askedFor(text: string): string | null {
  const own = ownPart(text ?? "").replace(/\s+/g, " ").trim();
  if (!own) return null;
  const sentences = own.split(/(?<=[.!?])\s+/);
  for (const s of sentences) if (!NOT_ASKS.test(s) && ASKS.some((r) => r.test(s))) return s.slice(0, 200);
  return null;
}

// The next business day after a YYYY-MM-DD day (Friday → Monday).
export function nextBusinessDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
