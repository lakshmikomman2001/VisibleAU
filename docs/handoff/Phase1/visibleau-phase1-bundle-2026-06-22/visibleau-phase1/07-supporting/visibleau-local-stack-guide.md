# VisibleAU — Full Local Stack (Zero Third-Party Dependencies)
# Every service replaced with a local equivalent
# Only external calls: OpenAI / Anthropic / Perplexity / Gemini APIs (the AI engines)
# Everything else runs on your machine

---

## THE FULL PICTURE — WHAT NEEDS REPLACING

| Service | Purpose in VisibleAU | Local Replacement | Effort |
|---------|---------------------|-------------------|--------|
| **Clerk** | Auth + multi-tenant orgs | **Better Auth** (self-hosted) | 🔴 High — Sprint 1 rewrite |
| **Stripe** | Billing / subscriptions | **Mock billing layer** (deferred to later) | 🟡 Medium — stub it out |
| **Supabase** | Postgres hosting | **Docker Postgres** ✅ Already done | 🟢 Done |
| **Inngest** | Background job queue | **BullMQ + Redis** (Docker) | 🟡 Medium |
| **Resend** | Transactional emails | **Mailpit** (local SMTP) | 🟢 Easy |
| **PostHog** | Analytics | **Self-hosted PostHog** or disable | 🟢 Easy |
| **Vercel** | Hosting | **Local Next.js dev server** | 🟢 Already local |
| **AI APIs** | The actual audit engines | ⚠️ Keep external (this IS the product) | — |

---

## RECOMMENDED APPROACH — TWO PHASES

**Phase A (do now — unblocks Sprint 1 today):**
Replace Clerk with Better Auth + local auth. Everything else stub/mock.

**Phase B (do when billing/jobs matter — Sprint 2+):**
Replace Inngest with BullMQ+Redis, Resend with Mailpit, PostHog self-hosted.

This gets you running today without touching 8 sprints at once.

---

## PHASE A — REPLACE CLERK WITH BETTER AUTH

### What Better Auth gives you locally
- Full email/password auth — no external service
- Multi-tenant organisations (built-in plugin)
- Session management with JWT or database sessions
- Works with Drizzle ORM + Postgres (your existing stack)
- Zero external calls — runs entirely on your machine
- Free, open source, MIT licence

### Step 1 — Install Better Auth

```bash
cd C:\startup\VisibleAU
pnpm remove @clerk/nextjs @clerk/backend
pnpm add better-auth
```

### Step 2 — Add Better Auth tables to your schema

Add these to `db/schema/auth.ts`:

```typescript
import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Better Auth users table
export const authUsers = pgTable('auth_users', {
  id:             text('id').primaryKey(),           // Better Auth uses string IDs
  name:           text('name').notNull(),
  email:          text('email').notNull().unique(),
  emailVerified:  boolean('email_verified').notNull().default(false),
  image:          text('image'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth sessions table
export const authSessions = pgTable('auth_sessions', {
  id:        text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token:     text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth accounts table (for OAuth providers if added later)
export const authAccounts = pgTable('auth_accounts', {
  id:                  text('id').primaryKey(),
  accountId:           text('account_id').notNull(),
  providerId:          text('provider_id').notNull(),
  userId:              text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken:         text('access_token'),
  refreshToken:        text('refresh_token'),
  idToken:             text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope:               text('scope'),
  password:            text('password'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth verifications table (email OTP etc.)
export const authVerifications = pgTable('auth_verifications', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth organisations (replaces Clerk org model)
export const authOrganizations = pgTable('auth_organizations', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  slug:      text('slug').unique(),
  logo:      text('logo'),
  metadata:  text('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Better Auth org members
export const authMembers = pgTable('auth_members', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => authOrganizations.id, { onDelete: 'cascade' }),
  userId:         text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  role:           text('role').notNull().default('member'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
});
```

### Step 3 — Create Better Auth server instance

Create `lib/auth/server.ts`:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from '@/db/client';
import * as schema from '@/db/schema/auth';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user:         schema.authUsers,
      session:      schema.authSessions,
      account:      schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // disable for local dev
  },
  plugins: [
    organization({
      schema: {
        organization: schema.authOrganizations,
        member:       schema.authMembers,
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  // Local dev — no email verification needed
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Just log to console locally — Mailpit handles it in Phase B
      console.log(`[AUTH] Verify email for ${user.email}: ${url}`);
    },
  },
});
```

### Step 4 — Create Better Auth client

Create `lib/auth/client.ts`:

```typescript
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [organizationClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
} = authClient;
```

### Step 5 — Create the API route

Create `app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from '@/lib/auth/server';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

### Step 6 — Create middleware (replaces Clerk middleware)

Replace `middleware.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC_ROUTES = [
  '/',
  '/sign-in',
  '/sign-up',
  '/api/auth',
  '/methodology',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Step 7 — Replace Clerk hooks in components

Every place your code uses Clerk hooks, replace like this:

```typescript
// BEFORE (Clerk)
import { useUser, useOrganization } from '@clerk/nextjs';
const { user } = useUser();
const { organization } = useOrganization();

// AFTER (Better Auth)
import { useSession, useActiveOrganization } from '@/lib/auth/client';
const { data: session } = useSession();
const user = session?.user;
const { data: organization } = useActiveOrganization();
```

```typescript
// BEFORE (Clerk — server side)
import { currentUser, auth } from '@clerk/nextjs/server';
const { orgId } = auth();

// AFTER (Better Auth — server side)
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
const session = await auth.api.getSession({ headers: headers() });
const orgId = session?.session?.activeOrganizationId;
```

### Step 8 — Create sign-in and sign-up pages

Replace Clerk's hosted UI with simple local forms.

`app/(auth)/sign-in/page.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { signIn } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign in to VisibleAU</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
             placeholder="Email" required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
             placeholder="Password" required />
      <button type="submit">Sign in</button>
      <a href="/sign-up">Create account</a>
    </form>
  );
}
```

`app/(auth)/sign-up/page.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { signUp } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await signUp.email({ name, email, password });
    if (result.error) {
      setError(result.error.message);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Create your VisibleAU account</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input type="text" value={name} onChange={e => setName(e.target.value)}
             placeholder="Name" required />
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
             placeholder="Email" required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
             placeholder="Password" required />
      <button type="submit">Create account</button>
      <a href="/sign-in">Already have an account?</a>
    </form>
  );
}
```

### Step 9 — Update .env.local (remove Clerk, add Better Auth)

```env
# Remove these:
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
# CLERK_SECRET_KEY=
# NEXT_PUBLIC_CLERK_SIGN_IN_URL=
# NEXT_PUBLIC_CLERK_SIGN_UP_URL=

# Add these:
BETTER_AUTH_SECRET=your-random-32-char-secret-here-change-this
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (already set from Docker setup)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/visibleau
```

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 10 — Run migrations for Better Auth tables

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## PHASE B — REPLACE REMAINING SERVICES

### Replace Inngest with BullMQ + Redis (Docker)

```bash
# Start Redis in Docker
docker run --name visibleau-redis \
  -p 6379:6379 \
  -v visibleau-redis-data:/data \
  --restart unless-stopped \
  -d redis:7-alpine

# Install BullMQ
pnpm remove inngest
pnpm add bullmq ioredis
```

Create `lib/queue/client.ts`:
```typescript
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
export const auditQueue = new Queue('audits', { connection: redis });
```

Add to `.env.local`:
```env
REDIS_URL=redis://localhost:6379
```

---

### Replace Resend with Mailpit (local SMTP)

Mailpit is a local email catcher — all emails sent locally are captured
in a web UI at http://localhost:8025, nothing goes to real inboxes.

```bash
# Start Mailpit in Docker
docker run --name visibleau-mail \
  -p 1025:1025 \
  -p 8025:8025 \
  --restart unless-stopped \
  -d axllent/mailpit
```

```bash
pnpm remove resend
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Create `lib/email/client.ts`:
```typescript
import nodemailer from 'nodemailer';

export const mailer = nodemailer.createTransport({
  host: 'localhost',
  port: 1025,
  secure: false,
  ignoreTLS: true,
});

export async function sendEmail({
  to, subject, html,
}: { to: string; subject: string; html: string }) {
  await mailer.sendMail({
    from: 'noreply@visibleau.local',
    to,
    subject,
    html,
  });
  console.log(`[EMAIL] Sent "${subject}" to ${to}`);
}
```

View all sent emails at: **http://localhost:8025**

---

### Disable PostHog (analytics — not needed locally)

Replace PostHog calls with a no-op locally:

Create `lib/analytics/client.ts`:
```typescript
// Local stub — PostHog disabled in development
export const analytics = {
  capture: (event: string, properties?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ANALYTICS] ${event}`, properties);
      return;
    }
    // Production: add PostHog here later
  },
};
```

Update `.env.local`:
```env
NEXT_PUBLIC_POSTHOG_KEY=local-disabled
NEXT_PUBLIC_POSTHOG_HOST=http://localhost:3000
```

---

### Stub Stripe (billing — for local dev)

Stripe needs real keys only for Sprint 10 (billing). For Sprints 1–9,
stub it out so the app doesn't crash:

Create `lib/stripe/client.ts`:
```typescript
// Local stub — real Stripe only needed for Sprint 10
export const stripe = {
  products: {
    create: async (params: unknown) => {
      console.log('[STRIPE STUB] products.create', params);
      return { id: 'prod_local_stub' };
    },
  },
  prices: {
    create: async (params: unknown) => {
      console.log('[STRIPE STUB] prices.create', params);
      return { id: 'price_local_stub' };
    },
  },
  webhooks: {
    constructEvent: () => ({ type: 'stub', data: { object: {} } }),
  },
};
```

Update `.env.local`:
```env
STRIPE_SECRET_KEY=sk_test_local_stub_not_real
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_local_stub_not_real
```

---

## COMPLETE .env.local FOR FULLY LOCAL STACK

```env
# ── App ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Better Auth (replaces Clerk) ─────────────────────────────
BETTER_AUTH_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
BETTER_AUTH_URL=http://localhost:3000

# ── Database (Docker Postgres) ───────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/visibleau

# ── Queue (Docker Redis + BullMQ) ────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Email (Docker Mailpit) ───────────────────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025

# ── Analytics (disabled locally) ─────────────────────────────
NEXT_PUBLIC_POSTHOG_KEY=local-disabled
NEXT_PUBLIC_POSTHOG_HOST=http://localhost:3000

# ── Billing (stub until Sprint 10) ───────────────────────────
STRIPE_SECRET_KEY=sk_test_local_stub
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_local_stub
STRIPE_WEBHOOK_SECRET=whsec_local_stub

# ── AI APIs (the product — keep external) ────────────────────
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_API_KEY=pplx-...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

---

## DOCKER COMPOSE — START EVERYTHING WITH ONE COMMAND

Save as `C:\startup\VisibleAU\docker-compose.yml`:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16
    container_name: visibleau-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: visibleau
    ports:
      - "5432:5432"
    volumes:
      - visibleau-pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: visibleau-redis
    ports:
      - "6379:6379"
    volumes:
      - visibleau-redis-data:/data
    restart: unless-stopped

  mailpit:
    image: axllent/mailpit
    container_name: visibleau-mail
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
    restart: unless-stopped

volumes:
  visibleau-pgdata:
  visibleau-redis-data:
```

Start everything:
```bash
cd C:\startup\VisibleAU
docker compose up -d
```

Stop everything:
```bash
docker compose down
```

---

## WHAT THIS CHANGES IN YOUR SPRINT PROMPTS

| Sprint | What changes | Effort |
|--------|-------------|--------|
| Sprint 1 | Replace Clerk install + middleware + hooks + auth pages | 🔴 2–3 hrs |
| Sprint 2 | Replace `mockClerkAuth` helper with `mockBetterAuth` | 🟢 30 min |
| Sprint 3 | Nothing | 🟢 None |
| Sprint 4 | Swap Clerk UI components for Better Auth hooks | 🟡 1 hr |
| Sprint 5 | Nothing | 🟢 None |
| Sprint 6 | Swap auth context calls | 🟡 1 hr |
| Sprint 7 | Nothing | 🟢 None |
| Sprint 8 | Swap auth + Inngest → BullMQ | 🟡 2 hrs |
| Sprint 9 | Swap Clerk org switcher + magic-link → Better Auth | 🔴 3 hrs |
| Sprint 10 | Swap Clerk signup flow + real Stripe (still needed) | 🔴 3 hrs |
| Sprint 11 | Swap Clerk CTAs | 🟢 30 min |
| Sprint 12 | Monitoring setup unchanged | 🟢 Minimal |

**Total extra effort: ~13–14 hours spread across the build.**
On your capacity (full-time dev + your evenings) that's 1–2 extra days,
not weeks. And you never need an external account for auth again.

---

## GIVE THIS TO CLAUDE CODE

```
Switching to a fully local stack. Replace Clerk with Better Auth.
All services run locally in Docker. Only external calls are the AI APIs.

Local stack:
- Auth:     Better Auth (self-hosted, email+password)
- Database: Docker Postgres 16 (localhost:5432)
- Queue:    BullMQ + Docker Redis 7 (localhost:6379)
- Email:    Mailpit (localhost:1025, UI at localhost:8025)
- Analytics: Disabled locally (console.log stub)
- Billing:  Stub until Sprint 10

Please:
1. Remove @clerk/nextjs and @clerk/backend
2. Install better-auth
3. Create lib/auth/server.ts and lib/auth/client.ts as per the spec
4. Create app/api/auth/[...all]/route.ts
5. Replace middleware.ts
6. Create sign-in and sign-up pages
7. Update all Clerk hook imports to Better Auth equivalents
8. Run drizzle-kit migrate to create the Better Auth tables
9. Confirm the app starts on localhost:3000 without any external service calls
```
