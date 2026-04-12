# Admin Panel Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs — auth token expiry silently logging the user out on next navigation, and new clients not appearing in the listing after creation.

**Architecture:** Two isolated one-file changes. Task 1 fixes a one-line response-key mismatch in the client list fetch. Task 2 replaces the init `useEffect` in `auth-context.tsx` with a proper async function that tries to refresh the access token before giving up and redirecting.

**Tech Stack:** Next.js 14 App Router, React hooks, fetch API, TypeScript. No test framework exists for the admin panel — verification is manual in the browser.

---

## File Map

| File | Change |
|------|--------|
| `apps/admin/app/clients/page.tsx` | Line 118: add `data?.items` to response fallback chain |
| `apps/admin/lib/auth-context.tsx` | Lines 29–47: replace init `useEffect` with async refresh-before-redirect logic |

---

### Task 1: Fix client list response parsing

**Files:**
- Modify: `apps/admin/app/clients/page.tsx:118`

The admin-api returns `{ items: [...], pagination: {...} }`. The frontend never tries `data.items`, so the client list always shows empty even after a successful create.

- [ ] **Step 1: Open the file and locate line 118**

```
apps/admin/app/clients/page.tsx
```

Current code at line 118:
```typescript
      .then((data) => setClients(Array.isArray(data) ? data : data?.clients ?? data?.data ?? []))
```

- [ ] **Step 2: Replace with the fixed version**

```typescript
      .then((data) => setClients(Array.isArray(data) ? data : data?.items ?? data?.clients ?? data?.data ?? []))
```

Only `data?.items ??` is added before `data?.clients`. Everything else stays identical.

- [ ] **Step 3: Verify in the browser**

1. Open `https://admin.vaulthub.live/clients`
2. Click `+ New Client`
3. Fill in: Organization Name = "Test Co", Slug = "test-co", leave other fields as defaults
4. Click "Create Client"
5. The modal should close and "Test Co" should appear in the table immediately without a page refresh

Expected: client row visible in the listing.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/clients/page.tsx
git commit -m "fix(admin): handle data.items response key in client list fetch"
```

---

### Task 2: Fix auth — refresh token before redirecting to login

**Files:**
- Modify: `apps/admin/lib/auth-context.tsx:29–47`

**Context:** When the JWT access token expires, `GET /auth/validate` returns 401. The current catch block clears the localStorage token and cookie but does NOT redirect. The user stays on screen with `isAuthenticated = false` and no cookie. The next client-side navigation triggers Next.js middleware, which finds no cookie and redirects to `/login` — making it look like a specific page (e.g. Compliance) causes logout.

The fix: attempt a token refresh before giving up. Only clear and redirect if the refresh also fails.

`AUTH_API_URL` is already defined at the top of the file:
```typescript
const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';
```

- [ ] **Step 1: Replace the init `useEffect` (lines 29–47)**

Delete lines 29–47 (the entire `useEffect(() => { ... }, []);` block) and replace with:

```typescript
  useEffect(() => {
    const token = localStorage.getItem('cvh_admin_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    function clearAndRedirect() {
      localStorage.removeItem('cvh_admin_token');
      localStorage.removeItem('cvh_admin_refresh');
      document.cookie = 'cvh_admin_token=; path=/; max-age=0';
      window.location.href = '/login';
    }

    async function init() {
      try {
        // Step 1: validate existing token
        const validateRes = await fetch(`${AUTH_API_URL}/validate`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (validateRes.ok) {
          const data = await validateRes.json();
          setUser(data.user);
          return;
        }

        // Step 2: token invalid — try refresh
        const storedRefresh = localStorage.getItem('cvh_admin_refresh');
        if (!storedRefresh) {
          clearAndRedirect();
          return;
        }

        const refreshRes = await fetch(`${AUTH_API_URL}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefresh }),
        });
        if (!refreshRes.ok) {
          clearAndRedirect();
          return;
        }

        const refreshData = await refreshRes.json();
        const accessToken = refreshData.tokens?.accessToken ?? refreshData.accessToken;
        const newRefresh = refreshData.tokens?.refreshToken ?? refreshData.refreshToken;

        localStorage.setItem('cvh_admin_token', accessToken);
        if (newRefresh) localStorage.setItem('cvh_admin_refresh', newRefresh);
        document.cookie = `cvh_admin_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

        // Step 3: use user from refresh response, or re-validate to get it
        if (refreshData.user) {
          setUser(refreshData.user);
          return;
        }

        const revalidateRes = await fetch(`${AUTH_API_URL}/validate`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (revalidateRes.ok) {
          const revalidateData = await revalidateRes.json();
          setUser(revalidateData.user);
        } else {
          clearAndRedirect();
        }
      } catch {
        clearAndRedirect();
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);
```

- [ ] **Step 2: Verify the file compiles — run TypeScript check**

```bash
npx tsc --project apps/admin/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors. If errors appear, check that `clearAndRedirect` is declared before it is called (it is, it's a function declaration which is hoisted).

- [ ] **Step 3: Verify scenario A — valid token, stays logged in**

1. Open `https://admin.vaulthub.live` and log in normally
2. Navigate between pages (Dashboard → Compliance → Clients)
3. Expected: no logout, all pages load normally

- [ ] **Step 4: Verify scenario B — Compliance no longer causes logout**

1. While logged in, open DevTools → Application → Cookies
2. Delete the `cvh_admin_token` cookie manually (leave localStorage tokens intact)
3. Click "Compliance" in the sidebar
4. Expected: page loads normally (the init refresh re-creates the cookie from localStorage refresh token)

> Note: if the refresh token is also expired (very old session), the page will redirect to `/login` — that is the correct behaviour.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/auth-context.tsx
git commit -m "fix(admin): refresh access token before logout when validate fails on init"
```

---

### Task 3: Deploy to production

- [ ] **Step 1: Push to remote**

```bash
git push
```

- [ ] **Step 2: Pull and rebuild on server**

```bash
ssh green@10.10.30.15 "sudo git -C /docker/CryptoVaultHub pull && cd /docker/CryptoVaultHub && docker compose build admin && docker compose up -d admin"
```

Expected: build completes without TypeScript errors, container recreated.

- [ ] **Step 3: Smoke test on production**

1. Open `https://admin.vaulthub.live`
2. Log in as `admin@cryptovaulthub.com`
3. Create a client — verify it appears immediately in the list
4. Navigate to Compliance — verify no logout occurs
