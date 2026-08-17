const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-radio-backend.fly.dev/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    const message = typeof body.error === 'string'
      ? body.error
      : typeof body.message === 'string'
        ? body.message
        : `API error: ${response.status}`;
    const err = new Error(message) as Error & { status?: number; body?: Record<string, unknown> };
    err.status = response.status;
    err.body = body as Record<string, unknown>;
    throw err;
  }

  return response.json();
}
