// fetch wrapper (SDS 3.6): JSON in and out, the session cookie on every call, and API errors
// turned into ApiError with the SDS 6.5 fields.

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const NETWORK_ERROR_MESSAGE = "Cannot reach KitHub. Check your connection and try again.";

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type UnauthenticatedListener = () => void;
let onUnauthenticated: UnauthenticatedListener | null = null;

/** AuthProvider registers here to learn that a call came back 401 UNAUTHENTICATED (SDS 5.3). */
export function setUnauthenticatedListener(listener: UnauthenticatedListener | null): void {
  onUnauthenticated = listener;
}

export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  // Every POST and PATCH sends the JSON content type, even with no body (SDS 6.2).
  if (method !== "GET") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const error = data?.error;
  const apiError = new ApiError(
    res.status,
    error?.code ?? "INTERNAL_ERROR",
    error?.message ?? "Something went wrong.",
    error?.details ?? [],
  );
  if (apiError.code === "UNAUTHENTICATED") onUnauthenticated?.();
  throw apiError;
}
