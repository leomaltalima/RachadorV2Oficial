# Rachador

App web para dividir despesas em grupo — crie um grupo, adicione participantes, lance despesas, veja o saldo simplificado e marque pagamentos via Pix.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- API spec (source of truth): `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/` (grupos, participantes, despesas, divisoes, pagamentos)
- API routes: `artifacts/api-server/src/routes/` (grupos, participantes, despesas, saldo, pagamentos)
- Frontend: `artifacts/rachador/src/` (React + Vite, Portuguese UI)
- Invite code generator: `artifacts/api-server/src/lib/nanoid.ts`

## Architecture decisions

- Integer types in OpenAPI spec are `number` (not `integer`) because Orval v8 generates `zod.int()` which doesn't exist in Zod v3. Using `number` generates `zod.number()` which is valid.
- Debt simplification runs server-side in `routes/saldo.ts` using a greedy creditor/debtor matching algorithm.
- Invite codes are 8-char alphanumeric strings generated via a small `nanoid` utility using `crypto.getRandomValues`.
- No auth in v1 per PRD — group access is granted by knowing the invite code.

## Product

- Create a group with a name and list of participants (each with optional Pix key)
- Join an existing group via 8-char invite code
- Add expenses: choose who paid, split equally or with custom amounts per person
- View simplified balance: who owes whom (minimized transfers)
- Mark debts as paid; copy creditor's Pix key with one click
- All UI in Portuguese

## User preferences

- **Toda alteração deve ser aplicada no web (`artifacts/rachador`) E no mobile (`artifacts/rachador-mobile`) simultaneamente**, salvo instrução contrária explícita.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
