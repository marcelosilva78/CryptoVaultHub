# Client Management Revamp — Invite Flow + Custody Policy Redesign

**Date:** 2026-04-12  
**Status:** Approved  
**Scope:** auth-service, admin-api, notification-service, apps/admin, apps/client

---

## Goal

Two related improvements delivered together:

1. **B1 — Invite Flow**: Admins can send a registration invite to a client's email. The client receives a link to a portal registration page where they set their password and get a JWT. The admin can also copy the invite URL manually.

2. **B2 — Custody Policy Redesign**: Move custody from client-level `custodyMode` (a per-client operational setting) to `custodyPolicy` (a governance policy), and add per-project `custodyMode` for clients on the self_managed policy.

---

## B1 — Invite Flow

### Architecture

Admin-api orchestrates: it calls auth-service to generate a token, then calls notification-service to queue the email. The portal calls auth-service directly to validate the token and accept the invite.

```
Admin Panel
  └── "Send Invite" → POST /admin/clients/:id/invite
        ├── auth-service: POST /auth/invite/generate → { token, inviteUrl }
        ├── notification-service: queueEmail(invite template)
        └── returns { inviteUrl } to admin panel for copy button

Portal /register?token=xxx
  ├── GET /auth/invite/:token/validate → { email, valid: true }
  └── POST /auth/invite/:token/accept { password } → JWT → /setup
```

### auth-service — new InviteToken model

```prisma
model InviteToken {
  id        Int       @id @default(autoincrement())
  email     String
  clientId  Int
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([token])
  @@index([email])
}
```

- `token`: `crypto.randomBytes(32).toString('hex')` — 64-char hex, unique
- `expiresAt`: `now() + 48h`
- `usedAt`: null until accepted; set on accept to prevent reuse
- No FK to Client — cross-service boundary

### auth-service — new endpoints

**`POST /auth/invite/generate`** (internal — called by admin-api)
- Request: `{ email: string, clientId: number }`
- Response 201: `{ token: string, inviteUrl: string }`
- Creates InviteToken. `inviteUrl = PORTAL_URL + /register?token=xxx` (env var)

**`GET /auth/invite/:token/validate`** (public — called by portal on mount)
- Response 200: `{ email: string, valid: true }`
- Errors: 404 not found, 410 expired, 409 already used

**`POST /auth/invite/:token/accept`** (public — called by portal on submit)
- Request: `{ password: string }`
- Response 201: `{ accessToken: string, refreshToken: string, user: { id, email, name, role } }`
- Validates token (exists, not usedAt, not expired). Creates User. Sets `usedAt = now()`. Returns JWT pair.
- Errors: 404 not found, 410 expired, 409 already used

### admin-api — new endpoint

**`POST /admin/clients/:id/invite`**
- No request body (uses `client.email`)
- Response 200: `{ inviteUrl: string }`
- Guard: 400 if `client.email` is null
- Calls `POST /auth/invite/generate` → gets `{ token, inviteUrl }`
- Calls `notification-service queueEmail()` with invite template (fire and forget)
- Returns `{ inviteUrl }` to admin panel

### notification-service — invite email

New method `sendInviteEmail(to: string, inviteUrl: string, orgName: string)` added to `email.service.ts`.  
Called via existing `queueEmail()` BullMQ pattern.  
Subject: `"You've been invited to [orgName] on VaultHub"`  
Body: greeting + invite link button + 48h expiry notice.

### Portal — `/register` page (new)

**On mount:**
1. Extract `token` from query string
2. Call `GET /auth/invite/:token/validate`
3. Valid → show form with email pre-filled (read-only)
4. Invalid/expired/used → show error screen (no form)

**Form fields:** Email (read-only), Full Name, Password, Confirm Password

**On submit:**
- `POST /auth/invite/:token/accept { password }`
- Receives JWT → store tokens → redirect to `/setup`
- Same token storage pattern as existing portal login

**Error states:**
- 410 Expired → "This invite link has expired. Ask your administrator to send a new one."
- 409 Used → "This invite link has already been used. Try logging in instead."
- Network error → "Something went wrong. Please try again."

### Admin Panel — Send Invite UI

**New Client modal** — add `email` field (optional, valid email format) above Custody Policy.

**Client list row** — add "Send Invite" button in actions column:
- Disabled (greyed) with tooltip "Add an email to this client first" if `client.email` is null
- On click → `POST /admin/clients/:id/invite`
- Success state: "Email sent to [email]" + "Copy invite link" button (copies inviteUrl to clipboard)
- Error state: "Failed to send invite. Try again."

**Client detail page** — same "Send Invite" button in page header actions area.

---

## B2 — Custody Policy Redesign

### Schema Changes

**admin-api — Client model:**

| Before | After |
|--------|-------|
| `custodyMode: CustodyMode` | `custodyPolicy: CustodyPolicy` |
| enum: `full_custody \| co_sign \| client_initiated` | enum: `full_custody \| co_sign \| self_managed` |
| no email field | `email: String?` |

**admin-api — Project model:**

New optional field: `custodyMode: ProjectCustodyMode?`  
New enum `ProjectCustodyMode`: `full_custody | co_sign`  
Null = client policy is full_custody or co_sign (forced, project override irrelevant)  
Non-null = client policy is self_managed, this is the project's custody mode

### Migration SQL

```sql
-- Client table
ALTER TABLE Client ADD COLUMN email VARCHAR(255);
ALTER TABLE Client ADD COLUMN custodyPolicy ENUM('full_custody','co_sign','self_managed') NOT NULL DEFAULT 'full_custody';
UPDATE Client SET custodyPolicy = CASE custodyMode
  WHEN 'full_custody'     THEN 'full_custody'
  WHEN 'co_sign'          THEN 'co_sign'
  WHEN 'client_initiated' THEN 'self_managed'
END;
ALTER TABLE Client DROP COLUMN custodyMode;

-- Project table
ALTER TABLE Project ADD COLUMN custodyMode ENUM('full_custody','co_sign') NULL;
```

### API Changes

**`POST /admin/clients`** and **`PATCH /admin/clients/:id`**:
- Remove `custodyMode` from DTO
- Add `custodyPolicy: CustodyPolicy` (required on POST, optional on PATCH)
- Add `email?: string` (optional, valid email format)

**`PATCH /admin/projects/:id`**:
- Add optional `custodyMode: ProjectCustodyMode | null`
- Validation: if `client.custodyPolicy !== 'self_managed'`, reject non-null custodyMode with 400

### Admin Panel — Custody UI

**New Client modal / Edit Client modal:**
- Rename dropdown label: "Custody Mode" → "Custody Policy"
- Update option values/labels: `client_initiated` → `self_managed` / "Self Managed"

**Project detail page** (self_managed clients only):
- Show "Custody Mode" dropdown (Full Custody | Co-Sign) when client policy = self_managed
- Hidden/absent for full_custody and co_sign policy clients

---

## Files to Create / Modify

### auth-service
| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add InviteToken model |
| `prisma/migrations/...` | Migration for InviteToken table |
| `src/invite/invite.module.ts` | New — NestJS module |
| `src/invite/invite.controller.ts` | New — `POST /auth/invite/generate`, `GET /auth/invite/:token/validate` |
| `src/invite/invite.service.ts` | New — token generation + validation logic |
| `src/invite/registration.controller.ts` | New — `POST /auth/invite/:token/accept` |
| `src/invite/registration.service.ts` | New — user creation + JWT on invite accept |
| `src/app.module.ts` | Import InviteModule |

### admin-api
| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add email to Client, rename custodyMode→custodyPolicy, add Project.custodyMode |
| `prisma/migrations/...` | Migration SQL above |
| `src/client-management/client.dto.ts` | Add email, rename custodyMode→custodyPolicy, add self_managed value |
| `src/client-management/client-management.service.ts` | Add inviteClient() method, update create/update for new fields |
| `src/client-management/client-management.controller.ts` | Add POST /admin/clients/:id/invite endpoint |
| `src/project-management/project.dto.ts` | Add custodyMode field |
| `src/project-management/project-management.service.ts` | Validate custodyMode against client policy |

### notification-service
| File | Action |
|------|--------|
| `src/email/email.service.ts` | Add sendInviteEmail() method |

### apps/admin
| File | Action |
|------|--------|
| `app/clients/page.tsx` | Add email field to modal, rename custody dropdown, add Send Invite button |
| `app/clients/[id]/page.tsx` | Add Send Invite button in header actions |

### apps/client
| File | Action |
|------|--------|
| `app/register/page.tsx` | New — invite registration page |

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Send Invite with no email on client | admin-api returns 400; frontend shows disabled button |
| Token not found | auth-service 404; portal shows "Invalid invite link" |
| Token expired | auth-service 410; portal shows expiry message |
| Token already used | auth-service 409; portal shows "already used, try login" |
| Email delivery fails | BullMQ queues retry; inviteUrl still returned to admin for manual copy |
| custodyMode set on non-self_managed project | admin-api 400 validation error |
