// Byte-level checks shared by the browser pre-check and server validation.

function latin1(bytes: Uint8Array, start: number, end: number) {
  return new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, start), Math.min(bytes.length, end)));
}

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
