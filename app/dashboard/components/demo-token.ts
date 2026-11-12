'use client';

const STORAGE_KEY = 'tether_demo_token';

export function getClientDemoToken(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim() !== '') {
        return stored.trim();
      }
    } catch {
      // Ignore storage access errors
    }
  }
  return (process.env.NEXT_PUBLIC_DEMO_TOKEN ?? '').trim();
}

export function setClientDemoToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = token.trim();
    if (trimmed) {
      window.sessionStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function withDemoTokenHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const token = getClientDemoToken();
  if (!token) return headers;
  return {
    ...headers,
    'x-demo-token': token,
  };
}
