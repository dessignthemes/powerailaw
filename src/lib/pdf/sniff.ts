// Byte-level checks shared by the browser pre-check and server validation.

function latin1(bytes: Uint8Array, start: number, end: number) {
  return new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, start), Math.min(bytes.length, end)));
}

// A PDF that opens without a password but carries editing restrictions
// (DocuSign locks completed envelopes this way). It's stored and shown as-is.
export const LOCKED_PDF_MESSAGE =
  "This PDF is locked against changes by the app that created it. DocuSign and similar services do this to signed documents to protect the signatures. You can view, download and share it, but not edit it or send it for signature.";
export const PASSWORD_PDF_MESSAGE =
  "This PDF needs a password to open. Open it in the app that created it, remove the password, save a copy, and upload that copy.";

export function hasPdfHeader(bytes: Uint8Array) {
  return latin1(bytes, 0, 1024).includes("%PDF-");
}

// An /Encrypt entry lives in the trailer (classic xref) or the xref stream
// dictionary; both are near the end of the file and never compressed, so a
// scan of the tail — plus the head, for linearized files — finds it even
// when the parser can't get far enough to report encryption itself.
export function looksEncrypted(bytes: Uint8Array) {
  const re = /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/;
  return re.test(latin1(bytes, bytes.length - 64 * 1024, bytes.length)) || re.test(latin1(bytes, 0, 64 * 1024));
}
