# Client Management Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement invite flow (B1) and custody policy redesign (B2) across auth-service, admin-api, notification-service, apps/admin, and apps/client.

**Architecture:** B1 — admin-api orchestrates invite by calling auth-service (generate token) and notification-service (queue email), then returns inviteUrl to admin panel for copy button; portal /register page calls auth-service directly to validate token and create user. B2 — rename `Client.custodyMode` → `Client.custodyPolicy` with new `self_managed` value, add `Project.custodyMode` (nullable) for per-project override when policy = self_managed.

**Tech Stack:** NestJS 10, Prisma (MySQL), Next.js 14 App Router, TypeScript, class-validator, bcryptjs, Jest.

---

## File Map

| File | Action |
|------|--------|
| `services/auth-service/prisma/schema.prisma` | Add InviteToken model |
| `services/auth-service/src/common/guards/internal-service.guard.ts` | New — X-Internal-Service-Key guard |
| `services/auth-service/src/invite/invite.dto.ts` | New — GenerateInviteDto, AcceptInviteDto |
| `services/auth-service/src/invite/invite.service.ts` | New — generateInvite() + validateToken() |
| `services/auth-service/src/invite/invite.service.spec.ts` | New — unit tests |
| `services/auth-service/src/invite/invite.controller.ts` | New — POST generate + GET validate |
| `services/auth-service/src/invite/registration.service.ts` | New — acceptInvite() |
| `services/auth-service/src/invite/registration.service.spec.ts` | New — unit tests |
| `services/auth-service/src/invite/registration.controller.ts` | New — POST accept |
| `services/auth-service/src/invite/invite.module.ts` | New |
| `services/auth-service/src/jwt/jwt-auth.service.ts` | Add public issueTokenPair() |
| `services/auth-service/src/app.module.ts` | Import InviteModule |
| `services/notification-service/src/email/email.service.ts` | Add sendInviteEmail() |
| `services/notification-service/src/email/email.controller.ts` | New — POST /email/invite |
| `services/notification-service/src/email/email.module.ts` | Add EmailController |
| `services/admin-api/prisma/schema.prisma` | Client email + CustodyPolicy enum + Project.custodyMode |
| `services/admin-api/src/common/dto/client.dto.ts` | email + custodyPolicy fields |
| `services/admin-api/src/common/dto/project.dto.ts` | custodyMode field |
| `services/admin-api/src/client-management/client-management.service.ts` | custodyPolicy + email + inviteClient() |
| `services/admin-api/src/client-management/client-management.controller.ts` | POST :id/invite endpoint |
| `services/admin-api/src/project-management/project-management.service.ts` | Validate custodyMode against client policy |
| `apps/admin/app/clients/page.tsx` | email field + custodyPolicy + Send Invite button |
| `apps/admin/app/clients/[id]/page.tsx` | Send Invite button + custodyPolicy in edit modal |
| `apps/client/app/register/page.tsx` | New — invite registration page |

---

### Task 1: auth-service — InviteToken Prisma model + migration

**Files:**
- Modify: `services/auth-service/prisma/schema.prisma`

The auth-service has no InviteToken model. We need to add it and run the migration.

- [ ] **Step 1: Add InviteToken model to schema**

Open `services/auth-service/prisma/schema.prisma` and add the following model after the existing models (before any closing content):

```prisma
model InviteToken {
  id        Int       @id @default(autoincrement())
  email     String    @db.VarChar(255)
  clientId  BigInt    @map("client_id")
  token     String    @unique @db.VarChar(64)
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([token], name: "idx_token")
  @@index([email], name: "idx_email")
  @@map("invite_tokens")
}
```

- [ ] **Step 2: Run migration**

```bash
cd services/auth-service
npx prisma migrate dev --name add-invite-token
```

Expected: Migration applied, `invite_tokens` table created. Prisma Client regenerated.

- [ ] **Step 3: Verify migration**

```bash
npx prisma studio
```

Navigate to InviteToken table — it should be present (or skip Studio and just confirm no error in Step 2).

- [ ] **Step 4: Commit**

```bash
git add services/auth-service/prisma/schema.prisma services/auth-service/prisma/migrations
git commit -m "feat(auth-service): add InviteToken Prisma model"
```

---

### Task 2: auth-service — InviteService (token generation + validation) with tests

**Files:**
- Create: `services/auth-service/src/invite/invite.dto.ts`
- Create: `services/auth-service/src/invite/invite.service.ts`
- Create: `services/auth-service/src/invite/invite.service.spec.ts`

- [ ] **Step 1: Create invite.dto.ts**

```typescript
// services/auth-service/src/invite/invite.dto.ts
import { IsEmail, IsNumber, IsString, MinLength, MaxLength } from 'class-validator';

export class GenerateInviteDto {
  @IsEmail()
  email!: string;

  @IsNumber()
  clientId!: number;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
```

- [ ] **Step 2: Write the failing unit tests for InviteService**

```typescript
// services/auth-service/src/invite/invite.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { InviteService } from './invite.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InviteService', () => {
  let service: InviteService;
  let prisma: jest.Mocked<Pick<PrismaService, 'inviteToken'>>;

  const mockConfig = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'PORTAL_URL') return 'https://portal.example.com';
      return fallback;
    }),
  };

  beforeEach(async () => {
    const mockPrisma = {
      inviteToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<InviteService>(InviteService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateInvite', () => {
    it('should create an InviteToken and return token + inviteUrl', async () => {
      (prisma.inviteToken.create as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'client@example.com',
        clientId: BigInt(42),
        token: 'abc123',
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      });

      const result = await service.generateInvite('client@example.com', 42);

      expect(result.inviteUrl).toMatch(/^https:\/\/portal\.example\.com\/register\?token=/);
      expect(result.token).toHaveLength(64); // 32 bytes hex
      expect(prisma.inviteToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'client@example.com', clientId: BigInt(42) }),
        }),
      );
    });
  });

  describe('validateToken', () => {
    it('should return the invite if token is valid', async () => {
      const future = new Date(Date.now() + 60_000);
      const invite = { id: 1, email: 'x@x.com', clientId: BigInt(1), token: 'tok', expiresAt: future, usedAt: null, createdAt: new Date() };
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(invite);

      const result = await service.validateToken('tok');
      expect(result).toEqual(invite);
    });

    it('should throw NotFoundException when token not found', async () => {
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.validateToken('bad')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when token already used', async () => {
      const invite = { id: 1, email: 'x@x.com', clientId: BigInt(1), token: 'tok', expiresAt: new Date(Date.now() + 60_000), usedAt: new Date(), createdAt: new Date() };
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(invite);
      await expect(service.validateToken('tok')).rejects.toThrow(ConflictException);
    });

    it('should throw GoneException when token expired', async () => {
      const invite = { id: 1, email: 'x@x.com', clientId: BigInt(1), token: 'tok', expiresAt: new Date(Date.now() - 1000), usedAt: null, createdAt: new Date() };
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(invite);
      await expect(service.validateToken('tok')).rejects.toThrow(GoneException);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd services/auth-service
npx jest src/invite/invite.service.spec.ts --no-coverage 2>&1 | head -30
```

Expected: FAIL — `Cannot find module './invite.service'`

- [ ] **Step 4: Create invite.service.ts**

```typescript
// services/auth-service/src/invite/invite.service.ts
import {
  Injectable,
  NotFoundException,
  GoneException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateInvite(email: string, clientId: number) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await this.prisma.inviteToken.create({
      data: {
        email,
        clientId: BigInt(clientId),
        token,
        expiresAt,
      },
    });

    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3002');
    const inviteUrl = `${portalUrl}/register?token=${token}`;

    return { token, inviteUrl };
  }

  async validateToken(token: string) {
    const invite = await this.prisma.inviteToken.findUnique({
      where: { token },
    });

    if (!invite) {
      throw new NotFoundException('Invite token not found');
    }
    if (invite.usedAt) {
      throw new ConflictException('Invite token has already been used');
    }
    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite token has expired');
    }

    return invite;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/invite/invite.service.spec.ts --no-coverage
```

Expected: PASS — 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/auth-service/src/invite/invite.dto.ts \
        services/auth-service/src/invite/invite.service.ts \
        services/auth-service/src/invite/invite.service.spec.ts
git commit -m "feat(auth-service): add InviteService with generate and validate"
```

---

### Task 3: auth-service — RegistrationService with tests + JwtAuthService public method

**Files:**
- Modify: `services/auth-service/src/jwt/jwt-auth.service.ts`
- Create: `services/auth-service/src/invite/registration.service.ts`
- Create: `services/auth-service/src/invite/registration.service.spec.ts`

- [ ] **Step 1: Add `issueTokenPair` public method to JwtAuthService**

Open `services/auth-service/src/jwt/jwt-auth.service.ts` and add this method at the end of the class, after the private `issueTokens` method (around line 342, before the closing `}`):

```typescript
  /**
   * Public wrapper for issueTokens — used by RegistrationService.
   */
  async issueTokenPair(
    user: {
      id: bigint;
      email: string;
      role: string;
      clientId?: bigint | null;
      clientRole?: string | null;
    },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    return this.issueTokens(user, ipAddress, userAgent);
  }
```

- [ ] **Step 2: Write the failing unit tests for RegistrationService**

```typescript
// services/auth-service/src/invite/registration.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { InviteService } from './invite.service';
import { JwtAuthService } from '../jwt/jwt-auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let prisma: jest.Mocked<Pick<PrismaService, 'user' | 'inviteToken'>>;
  let inviteService: jest.Mocked<InviteService>;
  let jwtAuthService: jest.Mocked<JwtAuthService>;

  const mockInvite = {
    id: 1,
    email: 'client@example.com',
    clientId: BigInt(42),
    token: 'tok123',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
  };

  const mockUser = {
    id: BigInt(10),
    email: 'client@example.com',
    name: 'Test User',
    role: 'viewer',
    clientId: BigInt(42),
    clientRole: 'owner',
    isActive: true,
    totpEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const mockTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      inviteToken: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InviteService, useValue: { validateToken: jest.fn() } },
        { provide: JwtAuthService, useValue: { issueTokenPair: jest.fn() } },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
    prisma = module.get(PrismaService);
    inviteService = module.get(InviteService);
    jwtAuthService = module.get(JwtAuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('acceptInvite', () => {
    it('should create user, mark token used, and return JWT', async () => {
      inviteService.validateToken.mockResolvedValue(mockInvite as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (prisma.inviteToken.update as jest.Mock).mockResolvedValue({});
      jwtAuthService.issueTokenPair.mockResolvedValue(mockTokens);

      const result = await service.acceptInvite('tok123', 'password123', 'Test User');

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('client@example.com');
      expect(result.user.clientRole).toBe('owner');
      expect(result.tokens).toEqual(mockTokens);
      expect(prisma.inviteToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { usedAt: expect.any(Date) } }),
      );
    });

    it('should throw ConflictException if email already registered', async () => {
      inviteService.validateToken.mockResolvedValue(mockInvite as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.acceptInvite('tok123', 'pass', 'Test')).rejects.toThrow(ConflictException);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd services/auth-service
npx jest src/invite/registration.service.spec.ts --no-coverage 2>&1 | head -20
```

Expected: FAIL — `Cannot find module './registration.service'`

- [ ] **Step 4: Create registration.service.ts**

```typescript
// services/auth-service/src/invite/registration.service.ts
import {
  Injectable,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { InviteService } from './invite.service';
import { JwtAuthService } from '../jwt/jwt-auth.service';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  async acceptInvite(
    token: string,
    password: string,
    name: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const invite = await this.inviteService.validateToken(token);

    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name,
        role: 'viewer',
        clientId: invite.clientId,
        clientRole: 'owner',
        isActive: true,
      },
    });

    await this.prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    const tokens = await this.jwtAuthService.issueTokenPair(user, ipAddress, userAgent);

    return {
      success: true,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.clientId?.toString() ?? null,
        clientRole: user.clientRole ?? null,
      },
      tokens,
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/invite/registration.service.spec.ts --no-coverage
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/auth-service/src/jwt/jwt-auth.service.ts \
        services/auth-service/src/invite/registration.service.ts \
        services/auth-service/src/invite/registration.service.spec.ts
git commit -m "feat(auth-service): add RegistrationService + issueTokenPair on JwtAuthService"
```

---

### Task 4: auth-service — Controllers + InternalServiceGuard + InviteModule + app.module.ts

**Files:**
- Create: `services/auth-service/src/common/guards/internal-service.guard.ts`
- Create: `services/auth-service/src/invite/invite.controller.ts`
- Create: `services/auth-service/src/invite/registration.controller.ts`
- Create: `services/auth-service/src/invite/invite.module.ts`
- Modify: `services/auth-service/src/app.module.ts`

- [ ] **Step 1: Create InternalServiceGuard**

```typescript
// services/auth-service/src/common/guards/internal-service.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-internal-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException('INTERNAL_SERVICE_KEY is not configured');
    }

    if (
      !serviceKey ||
      serviceKey.length !== expectedKey.length ||
      !timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey))
    ) {
      throw new UnauthorizedException('Invalid or missing internal service key');
    }

    return true;
  }
}
```

- [ ] **Step 2: Create invite.controller.ts**

```typescript
// services/auth-service/src/invite/invite.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { InviteService } from './invite.service';
import { GenerateInviteDto } from './invite.dto';
import { InternalServiceGuard } from '../common/guards/internal-service.guard';

@Controller('auth')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Post('invite/generate')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.CREATED)
  async generate(@Body() dto: GenerateInviteDto) {
    return this.inviteService.generateInvite(dto.email, dto.clientId);
  }

  @Get('invite/:token/validate')
  async validate(@Param('token') token: string) {
    const invite = await this.inviteService.validateToken(token);
    return { email: invite.email, valid: true };
  }
}
```

- [ ] **Step 3: Create registration.controller.ts**

```typescript
// services/auth-service/src/invite/registration.controller.ts
import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { RegistrationService } from './registration.service';
import { AcceptInviteDto } from './invite.dto';

@Controller('auth')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('invite/:token/accept')
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
  ) {
    return this.registrationService.acceptInvite(
      token,
      dto.password,
      dto.name,
      req.ip,
      req.headers['user-agent'] as string | undefined,
    );
  }
}
```

- [ ] **Step 4: Create invite.module.ts**

```typescript
// services/auth-service/src/invite/invite.module.ts
import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../jwt/jwt-auth.module';
import { InviteService } from './invite.service';
import { InviteController } from './invite.controller';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';

// PrismaModule is @Global(), no need to import it here.
@Module({
  imports: [JwtAuthModule],
  controllers: [InviteController, RegistrationController],
  providers: [InviteService, RegistrationService],
})
export class InviteModule {}
```

- [ ] **Step 5: Import InviteModule in app.module.ts**

In `services/auth-service/src/app.module.ts`, add `InviteModule` to the imports array and the import statement:

```typescript
import { InviteModule } from './invite/invite.module';
```

Add `InviteModule` to the `imports` array alongside `JwtAuthModule`, `ApiKeyModule`, etc.

- [ ] **Step 6: TypeScript check**

```bash
cd services/auth-service
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add services/auth-service/src/common/guards/internal-service.guard.ts \
        services/auth-service/src/invite/invite.controller.ts \
        services/auth-service/src/invite/registration.controller.ts \
        services/auth-service/src/invite/invite.module.ts \
        services/auth-service/src/app.module.ts
git commit -m "feat(auth-service): add InviteModule with controllers and InternalServiceGuard"
```

---

### Task 5: notification-service — sendInviteEmail() + EmailController

**Files:**
- Modify: `services/notification-service/src/email/email.service.ts`
- Create: `services/notification-service/src/email/email.controller.ts`
- Modify: `services/notification-service/src/email/email.module.ts`

- [ ] **Step 1: Add sendInviteEmail() to EmailService**

Open `services/notification-service/src/email/email.service.ts` and add the following method after `sendComplianceAlert()` (after line 158, before the closing `}`):

```typescript
  /**
   * Queue an invite email for a new client user.
   */
  async sendInviteEmail(params: {
    to: string;
    clientId: number;
    inviteUrl: string;
    orgName: string;
  }) {
    const { to, clientId, inviteUrl, orgName } = params;

    const subject = `You've been invited to ${orgName} on VaultHub`;
    const body = `
      <h2>Welcome to VaultHub</h2>
      <p>You have been invited to join <strong>${orgName}</strong> on VaultHub.</p>
      <p>Click the button below to set up your account. This link expires in 48 hours.</p>
      <p>
        <a href="${inviteUrl}"
           style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Accept Invitation
        </a>
      </p>
      <p>Or copy this link: <code>${inviteUrl}</code></p>
      <hr>
      <p><em>If you did not expect this invitation, you can safely ignore this email.</em></p>
    `.trim();

    return this.queueEmail({ clientId, to, subject, body });
  }
```

- [ ] **Step 2: Create email.controller.ts**

```typescript
// services/notification-service/src/email/email.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEmail, IsNumber, IsString, IsUrl } from 'class-validator';
import { EmailService } from './email.service';

class SendInviteEmailDto {
  @IsEmail()
  to!: string;

  @IsNumber()
  clientId!: number;

  @IsString()
  inviteUrl!: string;

  @IsString()
  orgName!: string;
}

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  async sendInvite(@Body() dto: SendInviteEmailDto) {
    return this.emailService.sendInviteEmail(dto);
  }
}
```

Note: The global `InternalServiceGuard` in `app.module.ts` already protects all routes — no guard needed on the controller itself.

- [ ] **Step 3: Add EmailController to EmailModule**

In `services/notification-service/src/email/email.module.ts`, add `EmailController` to the module:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailWorker } from './email.worker';
import { EmailController } from './email.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email-delivery',
    }),
  ],
  providers: [EmailService, EmailWorker],
  controllers: [EmailController],
  exports: [EmailService],
})
export class EmailModule {}
```

- [ ] **Step 4: TypeScript check**

```bash
cd services/notification-service
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add services/notification-service/src/email/email.service.ts \
        services/notification-service/src/email/email.controller.ts \
        services/notification-service/src/email/email.module.ts
git commit -m "feat(notification-service): add sendInviteEmail and POST /email/invite endpoint"
```

---

### Task 6: admin-api — Prisma schema B2 (Client + Project) + migration

**Files:**
- Modify: `services/admin-api/prisma/schema.prisma`

The current schema has `CustodyMode` enum with `full_custody | co_sign | client_initiated`. We need to rename it to `CustodyPolicy`, rename the column, add `self_managed`, and add fields.

- [ ] **Step 1: Update schema.prisma**

Open `services/admin-api/prisma/schema.prisma`.

**Replace the Client model** (currently lines 12–31) with:

```prisma
model Client {
  id            BigInt         @id @default(autoincrement())
  name          String         @db.VarChar(200)
  slug          String         @unique @db.VarChar(100)
  status        ClientStatus   @default(active)
  tierId        BigInt?        @map("tier_id")
  email         String?        @db.VarChar(255)
  custodyPolicy CustodyPolicy  @default(full_custody) @map("custody_policy")
  kytEnabled    Boolean        @default(false) @map("kyt_enabled")
  kytLevel      KytLevel       @default(basic) @map("kyt_level")
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")

  tier      Tier?               @relation(fields: [tierId], references: [id])
  overrides ClientTierOverride[]
  projects  Project[]

  @@index([tierId], name: "idx_tier")
  @@index([slug], name: "idx_slug")
  @@map("clients")
}
```

**Replace the Project model** (currently lines 33–51) with:

```prisma
model Project {
  id          BigInt              @id @default(autoincrement())
  clientId    BigInt              @map("client_id")
  name        String              @db.VarChar(200)
  slug        String              @db.VarChar(100)
  description String?             @db.VarChar(500)
  isDefault   Boolean             @default(false) @map("is_default")
  status      ProjectStatus       @default(active)
  custodyMode ProjectCustodyMode? @map("custody_mode")
  settings    Json?
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")

  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([clientId, slug], name: "uq_client_slug")
  @@index([clientId, status], name: "idx_client_status")
  @@index([clientId, isDefault], name: "idx_client_default")
  @@map("projects")
}
```

**Replace the `CustodyMode` enum** with:

```prisma
enum CustodyPolicy {
  full_custody
  co_sign
  self_managed
}

enum ProjectCustodyMode {
  full_custody
  co_sign
}
```

(Delete the old `enum CustodyMode { ... }` block entirely.)

- [ ] **Step 2: Generate migration file only (do not apply yet)**

```bash
cd services/admin-api
npx prisma migrate dev --create-only --name client-custody-policy-redesign
```

This creates a file at `prisma/migrations/YYYYMMDDHHMMSS_client_custody_policy_redesign/migration.sql`.

- [ ] **Step 3: Replace the migration SQL with the correct content**

Open the generated `migration.sql` file and replace its entire content with:

```sql
-- Step 1: Add self_managed value to existing custody_mode enum
ALTER TABLE `clients` MODIFY COLUMN `custody_mode` ENUM('full_custody', 'co_sign', 'client_initiated', 'self_managed') NOT NULL DEFAULT 'full_custody';

-- Step 2: Migrate client_initiated data to self_managed
UPDATE `clients` SET `custody_mode` = 'self_managed' WHERE `custody_mode` = 'client_initiated';

-- Step 3: Rename column + remove client_initiated from enum
ALTER TABLE `clients` CHANGE COLUMN `custody_mode` `custody_policy` ENUM('full_custody', 'co_sign', 'self_managed') NOT NULL DEFAULT 'full_custody';

-- Step 4: Add email column
ALTER TABLE `clients` ADD COLUMN `email` VARCHAR(255) NULL;

-- Step 5: Add custodyMode column to projects
ALTER TABLE `projects` ADD COLUMN `custody_mode` ENUM('full_custody', 'co_sign') NULL;
```

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate dev
```

Expected: Migration applied successfully. Prisma Client regenerated.

- [ ] **Step 5: Commit**

```bash
git add services/admin-api/prisma/schema.prisma services/admin-api/prisma/migrations
git commit -m "feat(admin-api): custody policy redesign schema + Project.custodyMode"
```

---

### Task 7: admin-api — client.dto.ts + client-management.service.ts (custodyPolicy + email)

**Files:**
- Modify: `services/admin-api/src/common/dto/client.dto.ts`
- Modify: `services/admin-api/src/client-management/client-management.service.ts`

- [ ] **Step 1: Update client.dto.ts**

Replace the entire content of `services/admin-api/src/common/dto/client.dto.ts` with:

```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsEmail,
  MinLength,
  MaxLength,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CustodyPolicy {
  full_custody = 'full_custody',
  co_sign = 'co_sign',
  self_managed = 'self_managed',
}

export class CreateClientDto {
  @ApiProperty({ example: 'Acme Exchange' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'acme-exchange' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug!: string;

  @ApiPropertyOptional({ example: 'admin@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: CustodyPolicy, default: CustodyPolicy.full_custody })
  @IsOptional()
  @IsEnum(CustodyPolicy)
  custodyPolicy?: CustodyPolicy;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tierId?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['basic', 'enhanced', 'full'], default: 'basic' })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'onboarding'] })
  @IsOptional()
  @IsEnum(['active', 'suspended', 'onboarding'])
  status?: string;

  @ApiPropertyOptional({ enum: CustodyPolicy })
  @IsOptional()
  @IsEnum(CustodyPolicy)
  custodyPolicy?: CustodyPolicy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  tierId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['basic', 'enhanced', 'full'] })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class ListClientsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
```

- [ ] **Step 2: Update client-management.service.ts**

Replace the `createClient` method data parameter type and body, the `updateClient` method data parameter type and body, and `serializeClient` to reflect the renamed field. Apply these changes to `services/admin-api/src/client-management/client-management.service.ts`:

**createClient signature and body** — change `custodyMode` → `custodyPolicy`, add `email`:

```typescript
  async createClient(
    data: {
      name: string;
      slug: string;
      email?: string;
      tierId?: number;
      custodyPolicy?: string;
      kytEnabled?: boolean;
      kytLevel?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.client.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(`Client with slug "${data.slug}" already exists`);
    }

    const client = await this.prisma.client.create({
      data: {
        name: data.name,
        slug: data.slug,
        email: data.email ?? null,
        tierId: data.tierId ? BigInt(data.tierId) : null,
        custodyPolicy: (data.custodyPolicy as any) ?? 'full_custody',
        kytEnabled: data.kytEnabled ?? false,
        kytLevel: (data.kytLevel as any) ?? 'basic',
      },
      include: { tier: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client.create',
      entityType: 'client',
      entityId: client.id.toString(),
      details: { name: data.name, slug: data.slug },
      ipAddress,
    });

    this.logger.log(`Client created: ${data.slug} (ID: ${client.id})`);

    return this.serializeClient(client);
  }
```

**updateClient signature and body** — change `custodyMode` → `custodyPolicy`, add `email`:

```typescript
  async updateClient(
    id: number,
    data: {
      name?: string;
      email?: string;
      status?: string;
      tierId?: number;
      custodyPolicy?: string;
      kytEnabled?: boolean;
      kytLevel?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tierId !== undefined) updateData.tierId = BigInt(data.tierId);
    if (data.custodyPolicy !== undefined) updateData.custodyPolicy = data.custodyPolicy;
    if (data.kytEnabled !== undefined) updateData.kytEnabled = data.kytEnabled;
    if (data.kytLevel !== undefined) updateData.kytLevel = data.kytLevel;

    const client = await this.prisma.client.update({
      where: { id: BigInt(id) },
      data: updateData,
      include: { tier: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client.update',
      entityType: 'client',
      entityId: id.toString(),
      details: data,
      ipAddress,
    });

    return this.serializeClient(client);
  }
```

**serializeClient** — change `custodyMode` → `custodyPolicy`, add `email`:

```typescript
  private serializeClient(client: any) {
    return {
      id: client.id.toString(),
      name: client.name,
      slug: client.slug,
      email: client.email ?? null,
      status: client.status,
      tierId: client.tierId?.toString() ?? null,
      custodyPolicy: client.custodyPolicy,
      kytEnabled: client.kytEnabled,
      kytLevel: client.kytLevel,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      tier: client.tier
        ? { id: client.tier.id.toString(), name: client.tier.name }
        : null,
      overrides: client.overrides?.map((o: any) => ({
        id: o.id.toString(),
        overrideKey: o.overrideKey,
        overrideValue: o.overrideValue,
        overrideType: o.overrideType,
      })),
    };
  }
```

- [ ] **Step 3: TypeScript check**

```bash
cd services/admin-api
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add services/admin-api/src/common/dto/client.dto.ts \
        services/admin-api/src/client-management/client-management.service.ts
git commit -m "feat(admin-api): rename custodyMode→custodyPolicy, add email to client DTO+service"
```

---

### Task 8: admin-api — Invite orchestration endpoint

**Files:**
- Modify: `services/admin-api/src/client-management/client-management.service.ts`
- Modify: `services/admin-api/src/client-management/client-management.controller.ts`

- [ ] **Step 1: Add service URLs to ClientManagementService constructor**

Open `services/admin-api/src/client-management/client-management.service.ts`.

Add two new private properties after `private readonly keyVaultUrl`:

```typescript
  private readonly authServiceUrl: string;
  private readonly notificationServiceUrl: string;
```

In the constructor, after the `keyVaultUrl` assignment, add:

```typescript
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:8000',
    );
    this.notificationServiceUrl = this.configService.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
```

- [ ] **Step 2: Add inviteClient() method to the service**

Add this method after `generateKeys()` and before `serializeClient()`:

```typescript
  async inviteClient(id: number, adminUserId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (!client.email) {
      throw new BadRequestException(
        'Client has no email address. Add an email before sending an invite.',
      );
    }

    const internalKey = this.configService.get<string>('INTERNAL_SERVICE_KEY', '');

    // 1. Generate invite token via auth-service
    const authRes = await axios.post(
      `${this.authServiceUrl}/auth/invite/generate`,
      { email: client.email, clientId: Number(client.id) },
      {
        timeout: 10000,
        headers: { 'X-Internal-Service-Key': internalKey },
      },
    );
    const { inviteUrl } = authRes.data as { token: string; inviteUrl: string };

    // 2. Queue invite email via notification-service (fire and forget)
    axios
      .post(
        `${this.notificationServiceUrl}/email/invite`,
        {
          to: client.email,
          clientId: Number(client.id),
          inviteUrl,
          orgName: client.name,
        },
        {
          timeout: 10000,
          headers: { 'X-Internal-Service-Key': internalKey },
        },
      )
      .catch((err: Error) =>
        this.logger.warn(`Invite email queue failed for client ${id}: ${err.message}`),
      );

    await this.auditLog.log({
      adminUserId,
      action: 'client.invite_sent',
      entityType: 'client',
      entityId: id.toString(),
      details: { email: client.email },
      ipAddress,
    });

    return { inviteUrl };
  }
```

Also add `BadRequestException` to the import at the top of the file (it may already be imported — check and add if missing).

- [ ] **Step 3: Add POST :id/invite endpoint to the controller**

Open `services/admin-api/src/client-management/client-management.controller.ts`.

Add this method after the `generateKeys` method (before the closing `}`):

```typescript
  @Post(':id/invite')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send invite email to client',
    description: 'Generates an invite token and queues an email to the client\'s email address. Also returns the invite URL for manual copy.',
  })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Invite sent',
    schema: { example: { success: true, inviteUrl: 'https://portal.vaulthub.live/register?token=abc123' } },
  })
  @ApiResponse({ status: 400, description: 'Client has no email address' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async inviteClient(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const result = await this.clientService.inviteClient(id, user.userId, req.ip);
    return { success: true, ...result };
  }
```

- [ ] **Step 4: TypeScript check**

```bash
cd services/admin-api
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add services/admin-api/src/client-management/client-management.service.ts \
        services/admin-api/src/client-management/client-management.controller.ts
git commit -m "feat(admin-api): add inviteClient() service method and POST /admin/clients/:id/invite"
```

---

### Task 9: admin-api — Project custodyMode DTO + validation

**Files:**
- Modify: `services/admin-api/src/common/dto/project.dto.ts`
- Modify: `services/admin-api/src/project-management/project-management.service.ts`

- [ ] **Step 1: Add custodyMode to UpdateProjectDto**

Open `services/admin-api/src/common/dto/project.dto.ts`.

Add the following to the `UpdateProjectDto` class (after the existing fields, before the closing `}`):

```typescript
  @ApiPropertyOptional({
    description: 'Custody mode for this project. Only valid when the owning client\'s custodyPolicy is self_managed. Set to null to clear.',
    enum: ['full_custody', 'co_sign'],
    nullable: true,
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['full_custody', 'co_sign'])
  custodyMode?: 'full_custody' | 'co_sign' | null;
```

Also add `IsEnum` and `IsNullable` to the import list if not already present. `IsNullable` isn't a standard class-validator decorator — just use `@IsOptional()` which allows null.

- [ ] **Step 2: Add custodyMode validation to project-management.service.ts**

Open `services/admin-api/src/project-management/project-management.service.ts`. Find the `update` method. Add custodyMode validation logic inside it.

Locate the `update` method and add custody validation after the project existence check. Here is the complete updated `update` method signature change and the validation block to insert:

In the `update` method's `data` parameter type, add `custodyMode?: string | null`.

The `update` method (line 139) uses `existing` for the fetched project. Add this block after `if (!existing) { throw new NotFoundException(...) }` (after line 154):

```typescript
    // Validate custodyMode: only allowed when client policy is self_managed
    if (data.custodyMode !== undefined) {
      const client = await this.prisma.client.findUnique({
        where: { id: existing.clientId },
      });
      if (client?.custodyPolicy !== 'self_managed') {
        throw new BadRequestException(
          'custodyMode can only be set on projects whose client has custodyPolicy = self_managed',
        );
      }
    }
```

After the existing `updateData` block (lines 157–161), add:

```typescript
    if (data.custodyMode !== undefined) updateData.custodyMode = data.custodyMode ?? null;
```

In `serializeProject` (line 268), add `custodyMode` to the returned object after `status`:

```typescript
      custodyMode: project.custodyMode ?? null,
```

- [ ] **Step 3: TypeScript check**

```bash
cd services/admin-api
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add services/admin-api/src/common/dto/project.dto.ts \
        services/admin-api/src/project-management/project-management.service.ts
git commit -m "feat(admin-api): add Project.custodyMode with self_managed policy validation"
```

---

### Task 10: apps/admin — Client modal + custodyPolicy UI

**Files:**
- Modify: `apps/admin/app/clients/page.tsx`
- Modify: `apps/admin/app/clients/[id]/page.tsx`

- [ ] **Step 1: Update CreateClientModal in clients/page.tsx**

Read `apps/admin/app/clients/page.tsx` first. Then make the following changes:

a. **Add email to form state.** Find the form state object (the one with `name`, `slug`, `custodyMode`, etc.) and add `email: ''` to it.

b. **Rename custodyMode → custodyPolicy in state and all references.** Use find-and-replace for `custodyMode` → `custodyPolicy` within this file.

c. **Add Self Managed option to the custody dropdown.** Find the custody dropdown `<select>` or equivalent and add the option:
```tsx
<option value="self_managed">Self Managed</option>
```

d. **Add email input field in the modal form.** After the slug field and before the custody policy field, insert:
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Email <span className="text-gray-400">(optional — for invite)</span>
  </label>
  <input
    type="email"
    value={form.email}
    onChange={(e) => setForm({ ...form, email: e.target.value })}
    placeholder="client@example.com"
    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>
```

e. **Update the POST /clients call** to include `email` and `custodyPolicy` (instead of `custodyMode`). In the fetch body, change:
```typescript
body: JSON.stringify({
  name: form.name,
  slug: form.slug,
  email: form.email || undefined,
  custodyPolicy: form.custodyPolicy,
  kytEnabled: form.kytEnabled,
  kytLevel: form.kytLevel,
}),
```

f. **Update all display references.** Search for `custodyMode` in the table columns and replace with `custodyPolicy`. Update any display labels from "Custody Mode" to "Custody Policy".

- [ ] **Step 2: Update EditClientModal in clients/[id]/page.tsx**

Read `apps/admin/app/clients/[id]/page.tsx`. Then:

a. **Rename `custodyMode` → `custodyPolicy`** throughout the file (form state, PATCH body, display).

b. **Add email field to EditClientModal** form — same email input as Step 1d above.

c. **Add Self Managed option** to the custody dropdown in EditClientModal.

d. **Update display cards/info sections** that show "Custody Mode" → "Custody Policy".

- [ ] **Step 3: Verify**

Open `http://localhost:3000/clients` (or equivalent dev URL). Click "+ New Client". Confirm:
- Email field appears
- Custody dropdown shows: Full Custody, Co-Sign, Self Managed

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/clients/page.tsx apps/admin/app/clients/\[id\]/page.tsx
git commit -m "feat(admin): email field + custodyPolicy dropdown in client modals"
```

---

### Task 11: apps/admin — Send Invite button

**Files:**
- Modify: `apps/admin/app/clients/page.tsx`
- Modify: `apps/admin/app/clients/[id]/page.tsx`

- [ ] **Step 1: Add Send Invite state + handler to clients/page.tsx**

Read `apps/admin/app/clients/page.tsx`. Add the following state and handler inside the page component:

```typescript
// State: map of clientId → invite result
const [inviteState, setInviteState] = useState<Record<string, { loading?: boolean; url?: string; error?: string }>>({});

async function handleSendInvite(clientId: string, clientEmail: string) {
  setInviteState((prev) => ({ ...prev, [clientId]: { loading: true } }));
  try {
    const res = await adminFetch(`/admin/clients/${clientId}/invite`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setInviteState((prev) => ({ ...prev, [clientId]: { error: data.message ?? 'Failed to send invite.' } }));
      return;
    }
    setInviteState((prev) => ({ ...prev, [clientId]: { url: data.inviteUrl } }));
  } catch {
    setInviteState((prev) => ({ ...prev, [clientId]: { error: 'Network error. Please try again.' } }));
  }
}
```

- [ ] **Step 2: Add Send Invite button in the client list row**

In the table's actions column (where "Edit" / "View" buttons are), add the Send Invite button after the existing buttons:

```tsx
{/* Send Invite */}
{(() => {
  const s = inviteState[client.id];
  if (s?.url) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700">
        <span>Email sent</span>
        <button
          onClick={() => navigator.clipboard.writeText(s.url!)}
          className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-xs font-medium"
        >
          Copy link
        </button>
      </div>
    );
  }
  if (s?.error) {
    return <span className="text-sm text-red-600">{s.error}</span>;
  }
  return (
    <button
      onClick={() => handleSendInvite(client.id, client.email)}
      disabled={!client.email || s?.loading}
      title={!client.email ? 'Add an email to this client first' : 'Send invite email'}
      className="px-3 py-1 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {s?.loading ? 'Sending...' : 'Send Invite'}
    </button>
  );
})()}
```

- [ ] **Step 3: Add Send Invite to clients/[id]/page.tsx header**

Read `apps/admin/app/clients/[id]/page.tsx`. Add similar state and handler for the single client:

```typescript
const [inviteState, setInviteState] = useState<{ loading?: boolean; url?: string; error?: string }>({});

async function handleSendInvite() {
  setInviteState({ loading: true });
  try {
    const res = await adminFetch(`/admin/clients/${params.id}/invite`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setInviteState({ error: data.message ?? 'Failed to send invite.' });
      return;
    }
    setInviteState({ url: data.inviteUrl });
  } catch {
    setInviteState({ error: 'Network error. Please try again.' });
  }
}
```

Add the Send Invite button in the page header actions area (next to the Edit button):

```tsx
{inviteState.url ? (
  <div className="flex items-center gap-2">
    <span className="text-sm text-green-700">Email sent</span>
    <button
      onClick={() => navigator.clipboard.writeText(inviteState.url!)}
      className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-800 rounded-lg font-medium"
    >
      Copy invite link
    </button>
  </div>
) : inviteState.error ? (
  <span className="text-sm text-red-600">{inviteState.error}</span>
) : (
  <button
    onClick={handleSendInvite}
    disabled={!client?.email || inviteState.loading}
    title={!client?.email ? 'Add an email to this client first' : undefined}
    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {inviteState.loading ? 'Sending...' : 'Send Invite'}
  </button>
)}
```

Note: `params.id` is the route param available in this page component. Replace with the actual variable name used in the existing file.

- [ ] **Step 4: Verify**

Open a client with an email set. Confirm "Send Invite" button appears and is clickable. Confirm it's disabled/greyed for a client without an email.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/clients/page.tsx apps/admin/app/clients/\[id\]/page.tsx
git commit -m "feat(admin): Send Invite button with success/error state and copy link"
```

---

### Task 12: apps/client — /register page

**Files:**
- Create: `apps/client/app/register/page.tsx`

The portal (`apps/client`) has no registration page. Token storage follows the existing login page pattern: `cvh_client_token` in localStorage and cookie.

The auth API URL env var is `NEXT_PUBLIC_AUTH_API_URL` (default `http://localhost:8000/auth`).

- [ ] **Step 1: Create the register page**

```typescript
// apps/client/app/register/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const AUTH_API_URL =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

type TokenState =
  | { status: 'loading' }
  | { status: 'valid'; email: string }
  | { status: 'invalid'; message: string };

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [tokenState, setTokenState] = useState<TokenState>({ status: 'loading' });
  const [form, setForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!token) {
      setTokenState({ status: 'invalid', message: 'No invite token provided.' });
      return;
    }

    fetch(`${AUTH_API_URL}/invite/${token}/validate`)
      .then(async (res) => {
        if (res.status === 404) {
          setTokenState({ status: 'invalid', message: 'This invite link is invalid.' });
        } else if (res.status === 410) {
          setTokenState({ status: 'invalid', message: 'This invite link has expired. Ask your administrator to send a new one.' });
        } else if (res.status === 409) {
          setTokenState({ status: 'invalid', message: 'This invite link has already been used. Try logging in instead.' });
        } else if (!res.ok) {
          setTokenState({ status: 'invalid', message: 'Something went wrong. Please try again.' });
        } else {
          const data = await res.json();
          setTokenState({ status: 'valid', email: data.email });
        }
      })
      .catch(() => {
        setTokenState({ status: 'invalid', message: 'Could not verify invite link. Please check your connection.' });
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setSubmitError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`${AUTH_API_URL}/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password, name: form.name }),
      });

      if (res.status === 410) {
        setSubmitError('This invite link has expired. Ask your administrator to send a new one.');
        return;
      }
      if (res.status === 409) {
        setSubmitError('This invite link has already been used. Try logging in instead.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.message ?? 'Something went wrong. Please try again.');
        return;
      }

      const data = await res.json();
      const accessToken = data.tokens?.accessToken ?? data.accessToken;
      const refreshToken = data.tokens?.refreshToken ?? data.refreshToken;

      localStorage.setItem('cvh_client_token', accessToken);
      localStorage.setItem('cvh_client_refresh', refreshToken);
      document.cookie = `cvh_client_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

      router.push('/setup');
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (tokenState.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Verifying invite link...</p>
      </div>
    );
  }

  if (tokenState.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full text-center p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Invite Link</h1>
          <p className="text-gray-600">{tokenState.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Create your account</h1>
        <p className="text-gray-500 mb-6">You were invited to join VaultHub.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={tokenState.email}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Jane Smith"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimum 8 characters"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder="Re-enter your password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --project apps/client/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Verify manually**

Open `http://localhost:3002/register?token=sometoken`. Confirm:
- "Verifying invite link..." shows briefly
- Shows error state for invalid/missing token
- (With a real valid token from the database: shows form with pre-filled email, accepts password, redirects to /setup)

- [ ] **Step 4: Commit**

```bash
git add apps/client/app/register/page.tsx
git commit -m "feat(client): add /register page for invite-based account creation"
```

---

### Task 13: Deploy to production

- [ ] **Step 1: Push to remote**

```bash
git push
```

- [ ] **Step 2: Pull and rebuild all changed services on server**

```bash
ssh green@10.10.30.15 "sudo git -C /docker/CryptoVaultHub pull && cd /docker/CryptoVaultHub && docker compose build auth-service notification-service admin-api admin client && docker compose up -d auth-service notification-service admin-api admin client"
```

Expected: All services rebuild and restart successfully.

- [ ] **Step 3: Run Prisma migrations on production**

```bash
ssh green@10.10.30.15 "cd /docker/CryptoVaultHub && docker compose exec auth-service npx prisma migrate deploy"
ssh green@10.10.30.15 "cd /docker/CryptoVaultHub && docker compose exec admin-api npx prisma migrate deploy"
```

Expected: Migrations applied. `invite_tokens` table created. `clients.custody_mode` renamed to `custody_policy` with `self_managed` value. `projects.custody_mode` column added.

- [ ] **Step 4: Smoke test**

1. Open `https://admin.vaulthub.live/clients`
2. Click "+ New Client" — confirm email field and "Self Managed" option appear in Custody Policy
3. Create a client with an email address
4. Click "Send Invite" on the new client — confirm success state + copy link button appear
5. Copy the invite link and open it in a browser — confirm `/register` page loads with pre-filled email
6. Complete registration — confirm redirect to `/setup`
