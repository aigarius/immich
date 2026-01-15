type PendingRequest = {
  controller: AbortController;
  promise: Promise<Response>;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

const getRequestKey = (request: URL | Request): string => (request instanceof URL ? request.href : request.url);

const CANCELED_MESSAGE = 'Canceled - this is normal';
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const handleFetch = (request: URL | Request): Promise<Response> => {
  const requestKey = getRequestKey(request);
  const existing = pendingRequests.get(requestKey);

  if (existing) {
    // Clone the response from the shared promise to avoid "Response is disturbed or locked" errors
    return existing.promise.then((response) => response.clone());
  }

  const controller = new AbortController();
  // NOTE: fetch returns after headers received, not the body
  const promise = fetch(request, { signal: controller.signal })
    .catch((error: unknown) => {
      const standardError = error instanceof Error ? error : new Error(String(error));
      if (standardError.name === 'AbortError' || standardError.message === CANCELED_MESSAGE) {
        // dummy response avoids network errors in the console for these requests
        return new Response(undefined, { status: 204 });
      }
      throw standardError;
    })
    .finally(() => {
      // Schedule cleanup after timeout to allow response body streaming to complete
      const cleanupTimeout = setTimeout(() => {
        pendingRequests.delete(requestKey);
      }, CLEANUP_TIMEOUT_MS);

      const pendingRequest = pendingRequests.get(requestKey);
      if (pendingRequest) {
        pendingRequest.cleanupTimeout = cleanupTimeout;
      }
    });

  pendingRequests.set(requestKey, {
    controller,
    promise,
  });

  // Clone for the first caller, so the promise retains the unconsumed original response for future callers
  return promise.then((response) => response.clone());
};

export const handleCancel = (url: URL) => {
  const requestKey = getRequestKey(url);

  const pendingRequest = pendingRequests.get(requestKey);
  if (pendingRequest) {
    pendingRequest.controller.abort(CANCELED_MESSAGE);
    if (pendingRequest.cleanupTimeout) {
      clearTimeout(pendingRequest.cleanupTimeout);
    }
    pendingRequests.delete(requestKey);
    return;
  }
};
