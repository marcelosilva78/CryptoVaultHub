/**
 * Type-safe wrapper for Auth Service endpoints (port 3003).
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export class AuthApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Auth API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    return this.request('POST', '/auth/login', data);
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return this.request('POST', '/auth/refresh', { refreshToken });
  }

  async logout(accessToken: string): Promise<void> {
    return this.request('POST', '/auth/logout', undefined, accessToken);
  }

  async me(accessToken: string): Promise<{ id: number; email: string; role: string }> {
    return this.request('GET', '/auth/me', undefined, accessToken);
  }
}
