export async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong. Please try again."), { code: d?.code });
  return d;
}

export const input = "bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
export const btn = "bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-2";
export const chip = "bg-chip hover:bg-btn disabled:opacity-50 px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5";

export function downloadBase64(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
