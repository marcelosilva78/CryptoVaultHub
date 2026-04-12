# Admin Panel Bug Fixes — Auth Expiry Logout + Client List

**Date:** 2026-04-12  
**Status:** Approved  
**Scope:** `apps/admin/lib/auth-context.tsx`, `apps/admin/app/clients/page.tsx`

---

## Problem

Two bugs block basic usage of the admin panel:

1. **Compliance page (and any next navigation) causes logout.** When the JWT access token expires and the app re-validates on mount, the validate endpoint returns 401. The catch block clears the localStorage token and the cookie but does not redirect. The user stays on screen with `isAuthenticated = false` and no cookie. The next client-side navigation (e.g. clicking "Compliance" in the sidebar) triggers Next.js middleware, which checks for `cvh_admin_token` cookie, finds none, and redirects to `/login`. Any page could trigger this; Compliance is just the first one clicked.

2. **New client does not appear in the listing after creation.** The admin-api `GET /admin/clients` returns `{ items: [...], pagination: {...} }`. The frontend's response handler (`clients/page.tsx` line 118) tries `data.clients ?? data.data ?? []` but never checks `data.items`, so the list always falls back to `[]` regardless of what the server returns.

---

## Fix 1: Auth — Refresh Before Logout

**File:** `apps/admin/lib/auth-context.tsx`

**Current init flow:**
```
localStorage token present?
  yes → validate with auth-api
    ok  → setUser(data.user)
    err → clear localStorage + clear cookie   ← no redirect, broken state
  no  → setIsLoading(false)
```

**New init flow:**
```
localStorage token present?
  yes → validate with auth-api
    ok  → setUser(data.user)
    err → try POST /auth/refresh with stored refresh token
            ok  → store new accessToken + cookie
                  set user from response (data.user) if present,
                  else re-validate with new token to get user
            err → clearTokens() + window.location.href = '/login'
  no  → setIsLoading(false)
```

**Helper added to the `useEffect` scope:**
```typescript
function clearAndRedirect() {
  localStorage.removeItem('cvh_admin_token');
  localStorage.removeItem('cvh_admin_refresh');
  document.cookie = 'cvh_admin_token=; path=/; max-age=0';
  window.location.href = '/login';
}
```

**Refresh request shape** (matches existing `refreshToken()` function):
```typescript
POST ${AUTH_API_URL}/refresh
{ refreshToken: localStorage.getItem('cvh_admin_refresh') }
```

**Expected response:**
```json
{ "accessToken": "...", "refreshToken": "...", "user": { "id": 1, "email": "...", "name": "...", "role": "..." } }
```

If `data.user` is present in the refresh response, set it directly. If not, re-call validate with the new access token to retrieve user data.

**No other auth flows change** — login, verify2FA, logout, and the existing `refreshToken()` callback are untouched.

---

## Fix 2: Client List Response Parsing

**File:** `apps/admin/app/clients/page.tsx`

**Line 118 — current:**
```typescript
.then((data) => setClients(Array.isArray(data) ? data : data?.clients ?? data?.data ?? []))
```

**Line 118 — fixed:**
```typescript
.then((data) => setClients(Array.isArray(data) ? data : data?.items ?? data?.clients ?? data?.data ?? []))
```

`data?.items` is added first in the fallback chain because it matches the current admin-api response shape. The other keys (`clients`, `data`) are retained as future-proof fallbacks.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/admin/lib/auth-context.tsx` | Modify init `useEffect`: add refresh-before-redirect logic |
| `apps/admin/app/clients/page.tsx` | Modify line 118: add `data?.items` to fallback chain |

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Validate fails, refresh succeeds | New token stored, user set, app stays on current page |
| Validate fails, no refresh token in localStorage | `clearAndRedirect()` immediately |
| Validate fails, refresh endpoint returns non-200 | `clearAndRedirect()` |
| Validate fails, refresh succeeds but no `user` in response, re-validate also fails | `clearAndRedirect()` |
| `GET /clients` returns `{ items: [] }` | List renders empty state correctly |
| `GET /clients` returns legacy format `{ clients: [...] }` | Still works via fallback |
