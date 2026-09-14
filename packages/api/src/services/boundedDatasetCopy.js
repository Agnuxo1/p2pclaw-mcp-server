// No filesystem, credentials or network activity at import time.
export const DATASET_R2_TIMEOUT_MS = 10_000;

/** A failed/ambiguous remote copy must not prevent the caller's local write. */
export function createBoundedDatasetCopy({
    signRequest, fetchImpl = globalThis.fetch,
    setTimer = setTimeout, clearTimer = clearTimeout,
    timeoutMs = DATASET_R2_TIMEOUT_MS,
} = {}) {
    const budget = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.min(timeoutMs, DATASET_R2_TIMEOUT_MS) : DATASET_R2_TIMEOUT_MS;
    return async function r2Put(key, body, contentType = 'application/x-ndjson') {
        const controller = new AbortController();
        let timer;
        let response;
        const close = res => {
            try { res?.body?.cancel()?.catch(() => {}); } catch { /* Already closed/locked. */ }
        };
        const expired = new Promise(resolve => {
            timer = setTimer(() => { controller.abort(); resolve(false); }, budget);
        });
        const copy = async () => {
            const signed = signRequest('PUT', key, body, contentType);
            if (!signed || controller.signal.aborted) return false;
            response = await fetchImpl(signed.url, {
                method: 'PUT', headers: signed.headers, body,
                redirect: 'error', signal: controller.signal,
            });
            // A transport ignoring abort may resolve after the caller has moved on.
            if (controller.signal.aborted) { close(response); return false; }
            // A PUT acknowledgement is sufficient; never wait for its response body.
            return response.ok === true;
        };
        try {
            return await Promise.race([copy().catch(() => false), expired]);
        } finally {
            clearTimer(timer);
            controller.abort();
            close(response);
        }
    };
}
