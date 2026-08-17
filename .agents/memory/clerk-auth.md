---
name: Clerk Auth integration
description: How Clerk Auth is wired into the Rachador project — keys, proxy, user-group linking.
---

## Setup
- Replit-managed Clerk, provisioned via `setupClerkWhitelabelAuth()`.
- Keys auto-injected: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`.
- Clerk proxy middleware mounted in `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`.
- `clerkMiddleware` wired in `artifacts/api-server/src/app.ts` using `publishableKeyFromHost`.

## User-to-group linking
- `participantesTable` has a nullable `clerkUserId text("clerk_user_id")` column.
- When a user identifies themselves in `join-group.tsx`, the app calls `POST /api/participantes/:id/claim` to link the Clerk `userId` to that participant row.
- `GET /api/me/grupos` returns all groups where `participantesTable.clerkUserId = auth.userId`.
- Both endpoints live in `artifacts/api-server/src/routes/me.ts`.

## Frontend
- `App.tsx` wraps everything in `ClerkProvider` with `publishableKeyFromHost` + `proxyUrl`.
- Sign-in: `/sign-in/*?`, sign-up: `/sign-up/*?` (wouter optional wildcard required for OAuth sub-paths).
- `@layer theme, base, clerk, components, utilities` added before `@import 'tailwindcss'` in `index.css`.
- `tailwindcss({ optimize: false })` in `vite.config.ts` to prevent prod CSS layer reordering.
- Appearance uses shadcn theme with terra-cotta primary (`hsl(12,85%,55%)`).

**Why:** Users wanted email+password login with a "my groups" home screen. Clerk was chosen as the default auth provider (Replit-managed, no external account needed).
