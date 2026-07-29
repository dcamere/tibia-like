# Developer Setup Guide

This guide explains how to run the project locally with the real PostgreSQL database.

## 1. Requirements

- Node.js 22+
- pnpm 11+
- Docker Desktop (running)

## 2. Install dependencies

From repository root:

```bash
pnpm install
```

If pnpm blocks build scripts for Prisma, run:

```bash
pnpm approve-builds --all
```

## 3. Configure environment

Create server env file from example:

```bash
copy apps\\server\\.env.example apps\\server\\.env
```

Default values (already suitable for local Docker Postgres):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tibia_like"
TOKEN_TTL_HOURS="168"
GM_USERNAMES="ekkel"
```

Notes:
- DATABASE_URL format:
  postgresql://USER:PASSWORD@HOST:PORT/DATABASE
- GM_USERNAMES accepts comma-separated usernames, case-insensitive.

## 4. Start PostgreSQL

```bash
docker compose -f docker/postgres.compose.yml up -d
```

Quick check:

```bash
docker ps
```

Expected container name:
- tibia_like_postgres

## 5. Generate Prisma client

```bash
pnpm --filter @tibia-like/server exec prisma generate
```

## 6. Apply schema to database

Development fast path:

```bash
pnpm --filter @tibia-like/server prisma:push
```

Alternative with migrations history:

```bash
pnpm --filter @tibia-like/server prisma:migrate --name init
```

## 7. Seed baseline item definitions

```bash
pnpm --filter @tibia-like/server prisma:seed
```

## 8. Start backend and frontend

Backend (Auth API + Colyseus):

```bash
pnpm --filter @tibia-like/server start
```

Frontend:

```bash
pnpm --filter @tibia-like/client dev-nolog
```

Expected URLs:
- Auth API: http://localhost:3567
- Game WS server: ws://localhost:2567
- Client: http://localhost:8080

## 9. Verify health and persistence

Health endpoint:

```bash
curl http://localhost:3567/health
```

Manual persistence test:
- Register/login
- Enter world
- Move and gain some XP
- Disconnect/reconnect
- Confirm position/level/xp restored

## 10. Useful commands

Typecheck all packages:

```bash
pnpm --recursive typecheck
```

Open Prisma Studio:

```bash
pnpm --filter @tibia-like/server exec prisma studio
```

Stop database:

```bash
docker compose -f docker/postgres.compose.yml down
```

## Troubleshooting

### Port already in use (2567, 3567, 8080)

Kill stale node/esbuild processes:

```bash
Get-Process node,esbuild -ErrorAction SilentlyContinue | Stop-Process -Force
```

### PrismaClient or schema mismatch errors

Run in order:

```bash
pnpm approve-builds --all
pnpm --filter @tibia-like/server exec prisma generate
pnpm --filter @tibia-like/server prisma:push
```

### Cannot connect to DB

- Ensure Docker Desktop is running.
- Confirm Postgres container is up (`docker ps`).
- Verify DATABASE_URL credentials and port.

### Server exits on startup

Common causes:
- Invalid/missing DATABASE_URL
- Prisma client not generated
- Port conflicts

## Project entry points

- Server boot: apps/server/src/main.ts
- World room authority: apps/server/src/rooms/WorldRoom.ts
- Auth service: apps/server/src/auth/AuthService.ts
- Inventory service: apps/server/src/inventory/InventoryService.ts
- Shared contracts: packages/shared/src
