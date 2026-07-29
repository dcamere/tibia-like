# tibia-like

Top-level repository docs:

- Implementation status:
  - docs/IMPLEMENTATION_STATUS.md
- Developer setup and run guide:
  - docs/DEVELOPER_SETUP.md
- GM commands reference:
  - docs/GM_COMMANDS.md

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Start PostgreSQL:

```bash
docker compose -f docker/postgres.compose.yml up -d
```

3. Prepare env file:

```bash
copy apps\\server\\.env.example apps\\server\\.env
```

4. Generate Prisma client and apply schema:

```bash
pnpm --filter @tibia-like/server exec prisma generate
pnpm --filter @tibia-like/server prisma:push
pnpm --filter @tibia-like/server prisma:seed
```

5. Run backend and frontend:

```bash
pnpm --filter @tibia-like/server start
pnpm --filter @tibia-like/client dev-nolog
```
