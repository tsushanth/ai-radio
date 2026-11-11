import { apiErrorText, retryAfterMs } from './error-text.ts';
import { bearerTokenFor } from './session-token.ts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-radio-backend.fly.dev/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
  /**
   * The user this call acts for (the email in the URL or body). When that user has a signed-in session its token is sent as
   * "Authorization: Bearer"; with none (guest, signed out) the call goes out unchanged. Set it on the routes that take a token:
   * podcast generate/job/episodes, linked-accounts, DELETE user.
   */
  asUser?: string | null;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, asUser, ...fetchOptions } = options;

  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const send = (token: string | null) =>
    fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
    });

  const token = asUser ? await bearerTokenFor(asUser) : null;
  let response = await send(token);
  // The server refused the token (revoked or expired session): try once as before, without one. While the backend still has its
  // compatibility window for token-less calls this keeps the page working; once the window is closed it gets the same 401.
  if (token && response.status === 401) response = await send(null);

  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    const message = apiErrorText(body, response.status);
    const err = new Error(message) as Error & { status?: number; body?: Record<string, unknown>; retryAfterMs?: number };
    err.status = response.status;
    err.retryAfterMs = retryAfterMs(response.headers.get('retry-after'));
    err.body = body as Record<string, unknown>;
    throw err;
  }

  return response.json();
}
