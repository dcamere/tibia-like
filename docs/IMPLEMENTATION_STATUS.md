# Implementation Status

Last updated: 2026-07-29

This document tracks what has already been implemented in the project.

## Architecture and stack

- Monorepo with:
  - apps/client (Phaser + Vite + TypeScript)
  - apps/server (Colyseus + Express + TypeScript)
  - packages/shared (shared contracts and validation)
- Server authoritative model for movement, creatures, combat, chat and inventory actions.
- PostgreSQL persistence through Prisma.

## Implemented features

### Accounts, auth and character ownership

- Register and login endpoints implemented.
- Passwords are securely hashed with Argon2.
- Sessions/tokens are persisted in database.
- Character ownership validation enforced when joining world room.
- Multiple characters per account supported.

Relevant files:
- apps/server/src/auth/AuthService.ts
- apps/server/src/main.ts
- packages/shared/src/auth.ts

### Character persistence and progression

- Character persistent fields in database:
  - tileX, tileY
  - level
  - experience
- Character position and progression loaded at room join.
- Character position/progression persisted on room leave.
- Experience gain on creature kill and basic level-up progression curve.

Relevant files:
- apps/server/src/rooms/WorldRoom.ts
- apps/server/src/state/PlayerState.ts
- apps/server/prisma/schema.prisma

### Visual update (players and creatures)

- Primitive placeholders replaced by sprite-based render entities.
- Directional visual states (up/down/left/right) and walk/idle transitions implemented.
- Runtime fallback textures supported for resilience.

Relevant files:
- apps/client/src/game/entities/Player.ts
- apps/client/src/game/entities/Creature.ts
- apps/client/src/game/rendering/MedievalSprites.ts
- apps/client/src/game/scenes/Game.ts

### Chat and command system

- Authoritative chat send intent from client to server.
- Supported channels:
  - local
  - world
  - private
  - system
- Anti-spam chat cooldown and command parsing.
- Role-based command permissions (GM vs player).
- Visual announcement channel separated from normal chat.

Relevant files:
- apps/server/src/rooms/WorldRoom.ts
- apps/client/src/game/scenes/Game.ts
- apps/client/src/game/scenes/UIScene.ts
- packages/shared/src/chat.ts
- packages/shared/src/network.ts

### GM command set (implemented)

- /announce <message>
- /tpme <x> <y>
- /tp <player> <x> <y>
- /speed <player> <1-4>
- /god <player> <on|off>
- /giveitem <player> <slug> <qty>

### Inventory and item persistence (initial authoritative slice)

- Prisma models created for:
  - ItemDefinition
  - CharacterItem
  - GroundItem
  - Container
- Authoritative inventory service with database transactions.
- Seeded base items:
  - gold_coin
  - health_potion
  - short_sword
- Chat commands for first inventory flow:
  - /inv
  - /ground
  - /drop <slug> <qty>
  - /pickup <slug> <qty>

Relevant files:
- apps/server/src/inventory/InventoryService.ts
- apps/server/prisma/schema.prisma
- apps/server/prisma/seed.ts

## Infrastructure and tooling

- Docker compose setup for local PostgreSQL.
- Prisma generation and schema sync scripts configured.

Relevant files:
- docker/postgres.compose.yml
- apps/server/.env.example
- apps/server/package.json

## Current scope status against plan

- Phase 0.1 Accounts/authentication: implemented
- Phase 0.2 Character creation/selection: implemented
- Phase 0.3 Player/creature visual upgrade: implemented
- Phase 0.4 Chat + role-based commands: implemented
- Phase I (DB + persistence): implemented baseline
- Phase J (inventory/objects): implemented initial authoritative baseline
- Phase K (RPG content): data-model groundwork present, gameplay systems pending

## Pending next milestones

- Inventory UI panel and non-chat UX for item interactions.
- Equipment mechanics integrated into combat stats.
- Ground item rendering synchronized to client world state.
- NPC dialog/shops/quests/spells/vocations/party gameplay systems.
- Tiled maps and zone/portal transitions.
