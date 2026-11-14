/**
 * Thin wrapper around `fetch` used by every API module in this folder.
 *
 * Why: `fetch` does NOT throw on 4xx/5xx responses, and every call needs the
 * same JSON headers and error parsing. Centralising it here means each API
 * function (see projects.ts) is a one-liner.
 */

/** Fired on `window` whenever the API answers 401. App.tsx listens for it. */
export const UNAUTHORIZED_EVENT = "launchpad:unauthorized";

/** One field-level problem, as returned by the API's ZodValidationPipe. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** Thrown for any non-2xx response. Components can inspect `status`/`issues`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ValidationIssue[] = [],
    /** Machine-readable error code, when the API sends one. */
    readonly code: string | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Sends a request to the Launchpad API and returns the parsed JSON body.
 * `path` is relative to `/api`, e.g. `request("/projects")`.
 */
export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const hasBody = init.body !== undefined;
  const response = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    // Only send a JSON body + header when there is something to send.
    ...(hasBody && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(init.body)
    })
  });

  // 204 No Content (e.g. DELETE) has no body to parse.
  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    // Session missing/expired: tell the app to show the sign-in screen.
    if (response.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw toApiError(response.status, body);
  }

  return body as T;
}

/** NestJS error bodies look like `{ message, statusCode, issues? }`. */
function toApiError(status: number, body: unknown): ApiError {
  const data = (body ?? {}) as {
    message?: string | string[];
    issues?: ValidationIssue[];
    code?: string;
  };
  const message = Array.isArray(data.message)
    ? data.message.join(", ")
    : (data.message ?? `Request failed with status ${status}`);

  return new ApiError(status, message, data.issues ?? [], data.code ?? null);
}
