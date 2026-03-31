const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!apiBaseUrl) {
    return normalizedPath;
  }

  return new URL(normalizedPath, `${normalizeBaseUrl(apiBaseUrl)}/`).toString();
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildApiUrl(path), init);
}