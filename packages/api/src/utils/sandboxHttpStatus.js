/** Execution admission failures are retryable service responses, not completed jobs. */
export function sandboxHttpStatus(result) {
    if (['SANDBOX_UNAVAILABLE', 'SANDBOX_CLEANUP_FAILED'].includes(result?.error)) return 503;
    if (result?.error === 'SANDBOX_BUSY') return 429;
    return 200;
}
