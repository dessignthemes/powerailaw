// The permissions inside a Microsoft (Outlook) access token. Microsoft puts the
// granted permissions in the token's "scp" claim, e.g. "Mail.ReadWrite
// Calendars.ReadWrite Files.Read User.Read". Only read, never trusted for
// security: Microsoft itself enforces what the token can do.
export function scopesFromMicrosoftToken(token: string | null | undefined): string[] {
  const part = token?.split(".")[1];
  if (!part) return []; // not a readable token (some personal accounts)
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { scp?: unknown };
    return typeof claims.scp === "string" ? claims.scp.split(" ").filter(Boolean) : [];
  } catch {
    return [];
  }
}

// When the token expires, from its "exp" claim (null if it can't be read).
export function expiryFromMicrosoftToken(token: string | null | undefined): string | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof claims.exp === "number" ? new Date(claims.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}
