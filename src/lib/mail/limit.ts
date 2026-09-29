// Outlook allows only a few requests at once per mailbox, and both Outlook
// and Gmail ask callers to slow down (429) when busy. These helpers keep the
// Inbox within those limits instead of failing.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isBusy(res: Response, body: string) {
  if (res.status === 429 || res.status === 503 || res.status === 504) return true;
  // Gmail signals rate limits with 403 and a "rateLimitExceeded" reason.
  return res.status === 403 && /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT/i.test(body);
}

// fetch that waits and retries when the provider is busy (up to 3 retries).
export async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok || attempt >= retries) return res;
    const body = res.status === 403 ? await res.clone().text().catch(() => "") : "";
    if (!isBusy(res, body)) return res;
    const after = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 5000) : 400 * 2 ** attempt + Math.random() * 200;
    await res.body?.cancel().catch(() => {});
    await sleep(wait);
  }
}

// Runs fn over items with at most `limit` running at the same time.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
