// Safari (and some older browsers) can't loop over a ReadableStream with
// `for await`, which pdf.js uses to read page text. Add the standard
// async iterator when it's missing. Mirrors the spec's ReadableStream.values().
export function installStreamAsyncIterator() {
  if (typeof ReadableStream === "undefined") return;
  const proto = ReadableStream.prototype as ReadableStream & {
    values?: (opts?: { preventCancel?: boolean }) => AsyncIterableIterator<unknown>;
    [Symbol.asyncIterator]?: unknown;
  };
  if (typeof proto[Symbol.asyncIterator] === "function") return;

  const values = function (this: ReadableStream, { preventCancel = false } = {}) {
    const reader = this.getReader();
    const it: AsyncIterableIterator<unknown> = {
      async next() {
        try {
          const r = await reader.read();
          if (r.done) reader.releaseLock();
          return r as IteratorResult<unknown>;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return(value?: unknown) {
        if (!preventCancel) {
          const p = reader.cancel(value);
          reader.releaseLock();
          await p;
        } else {
          reader.releaseLock();
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return it;
      },
    };
    return it;
  };

  Object.defineProperty(proto, "values", { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}
