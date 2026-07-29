# Tibia-like MMORPG Plan (Step by Step)

Last updated: 2026-07-29

## Goal
Build the current multiplayer prototype into a real MMORPG-style game, preserving server authority and strict TypeScript.

## Visual Direction (must-have)
- Overall art direction: medieval fantasy inspired by Tibia.
- Sprites for players, creatures, NPCs, items, and UI ornaments should follow a coherent medieval visual language.
- Prioritize readable top-down silhouettes, clear faction/entity differentiation, and classic MMORPG readability over high-detail effects.
- Keep consistency across tilesets, props, equipment icons, and chat/UI chrome.

## Current Baseline
- Monorepo with `apps/client`, `apps/server`, `packages/shared`.
- Tile movement is authoritative on server.
- Creatures are authoritative on server (spawn, movement, health, death, respawn).
- Client sends intents and renders synchronized state.

## Execution Rules
- Work in small, verifiable increments.
- Typecheck must pass at the end of every step.
- No gameplay authority on client (client sends intents only).
- Add tests whenever a server rule is introduced.
- Do not jump phases.
- All new art and UI assets must respect the medieval Tibia-inspired style guide above.

---

## Phase 0: Core Product Foundations (priority now)
Status: Pending

### 0.1 Accounts and authentication
Deliverables:
- Register/login/logout flows.
- Secure session/token model.
- Account to character ownership validation.

Definition of done:
- Unauthenticated users cannot enter the world.
- Authenticated sessions survive refresh/reconnect safely.

### 0.2 Character creation and selection
Deliverables:
- Character creation UI and server endpoint.
- Character list per account.
- Character selection before entering world.

Definition of done:
- A user can create multiple characters and pick one at login.
- Server always validates selected character belongs to account.

### 0.3 Visual upgrade (players + creatures sprites)
Deliverables:
- Replace placeholder shapes with sprite-based entities.
- Directional animation set (idle/walk at minimum).
- Client-side render pipeline for sprites with clean entity abstraction.

Definition of done:
- Local and remote players render with consistent sprite states.
- Creatures render with sprite/animation states tied to server state.

### 0.4 Chat system with role-based commands
Deliverables:
- Authoritative chat channels (local/global/private baseline).
- Command parser with role permissions.
- Separate command sets for GM and normal players.

Definition of done:
- Player commands execute only allowed actions.
- GM commands require GM role and are audited/logged.
- Rate limiting and anti-spam safeguards are active.

---

## Phase 1: Combat Core Stabilization (authoritative)
Status: Pending

### 1.1 Combat feedback events (server -> client)
Deliverables:
- Add typed combat result events (hit, out-of-range, cooldown, invalid target).
- Keep damage calculation server-side only.
- Client shows feedback text/log from server events.

Definition of done:
- Two clients see consistent HP changes.
- Invalid attacks show deterministic feedback.
- Typecheck passes.

### 1.2 Multi-creature balance pass
Deliverables:
- Tune creature speed, attack interval (if applicable), respawn times.
- Ensure no overlap and no invalid spawns.

Definition of done:
- Creatures do not clip walls/players/other creatures.
- Stable behavior across two tabs for 10+ minutes.

### 1.3 Automated integration tests for room rules
Deliverables:
- Tests for move validation, attack range, cooldown, death lock, respawn.
- Tests for malformed payload handling.

Definition of done:
- Tests pass in CI/local.
- No room crash on invalid messages.

---

## Phase 2: Player Progression Base
Status: Pending

### 2.1 Player combat stats
Deliverables:
- Add server-side player stats: maxHealth, health, attack, defense, attackCooldown.
- Replace fixed damage with formula using attacker/defender stats.

Definition of done:
- Damage is deterministic and server-authoritative.
- Client reflects new HP state correctly.

### 2.2 Player death and respawn
Deliverables:
- Authoritative player death state.
- Respawn on server-defined spawn tile after delay.
- Disable movement/attack while dead.

Definition of done:
- Death is synchronized for all players.
- Dead players cannot act.
- Respawn is synchronized and deterministic.

### 2.3 Experience and levels
Deliverables:
- XP gain on creature kill.
- Level progression curve.
- Stat increase per level.

Definition of done:
- XP and level are server-tracked.
- Level-up is visible and consistent for all clients.

---

## Phase 3: Loot and Inventory
Status: Pending

### 3.1 Authoritative loot tables
Deliverables:
- Creature drop tables on server.
- Drop generation on death.
- Ground item entities in room state.

Definition of done:
- Drops are identical for all observers.
- No client-driven loot generation.

### 3.2 Inventory system
Deliverables:
- Inventory state per player.
- Stackable items and slot limits.
- Pickup/drop intents with validation.

Definition of done:
- Out-of-range pickup rejected.
- Inventory changes synchronized and authoritative.

### 3.3 Equipment slots
Deliverables:
- Equip/unequip intents.
- Derived stat updates from equipment.

Definition of done:
- Equipment affects server combat formulas.
- No direct client stat mutation.

---

## Phase 4: Spells and Mana
Status: Pending

### 4.1 Mana and spell casting
Deliverables:
- Mana pool and regeneration.
- Spell definitions in shared contracts (shape only).
- Server-side cast validation: mana, cooldown, range, target validity.

Definition of done:
- Spells resolve only on server.
- Client receives outcomes and visualizes them.

### 4.2 Damage/heal spell effects
Deliverables:
- Single-target spells first.
- Optional AoE second.

Definition of done:
- Spell outcomes synchronized for all clients.

---

## Phase 5: Content Layer (NPCs + Quests)
Status: Pending

### 5.1 NPC base system
Deliverables:
- NPC entities in room/world state.
- Talk/trade interaction intents.

Definition of done:
- NPC interactions validated by range and state.

### 5.2 Quest engine
Deliverables:
- Quest definitions and per-player quest state.
- Objectives: kill, collect, talk.
- Rewards: XP, items.

Definition of done:
- Quest progress and rewards are server-authoritative.

---

## Phase 6: Persistence and Accounts
Status: Pending

### 6.1 Database integration
Deliverables:
- Add PostgreSQL and Prisma.
- Persist players, inventory, equipment, quest progress.

Definition of done:
- Reconnect restores character state.

### 6.2 Authentication
Deliverables:
- Register/login endpoints.
- Session/token model.
- Account -> characters relation.

Definition of done:
- Only authenticated users can control characters.

Note:
- Most account/character work is intentionally pulled forward into Phase 0 and should be executed first.

---

## Phase 7: MMO Features
Status: Pending

### 7.1 Chat channels
Deliverables:
- Local, global, private channels.
- Rate limiting and moderation basics.

### 7.2 Party and guild foundations
Deliverables:
- Party invites and shared XP option.
- Guild creation/invite basics.

Definition of done:
- Core social loop works with server authority.

---

## Phase 8: World Scale and Performance
Status: Pending

### 8.1 Interest management
Deliverables:
- Send nearby entities only.
- Zone/chunk visibility rules.

### 8.2 Multi-room/world partition
Deliverables:
- Room zoning strategy.
- Player transfer between zones.

### 8.3 Observability and load testing
Deliverables:
- Metrics, logs, alerts.
- Bot/load tests.

Definition of done:
- Stable under expected concurrency target.

---

## Cross-cutting Backlog (Always On)
- Security hardening (message validation, anti-spam, anti-exploit).
- Test coverage expansion.
- Refactors to keep shared contracts clean.
- UI/UX improvements in client HUD, logs, inventory panels.

---

## Step-by-Step Execution Checklist
Use this list to execute in strict order:

1. Phase 0.1 accounts and authentication.
2. Phase 0.2 character creation and selection.
3. Phase 0.3 sprite upgrade for players and creatures.
4. Phase 0.4 chat with GM and player commands.
5. Phase 1.1 combat feedback events.
6. Phase 1.2 multi-creature behavior pass.
7. Phase 1.3 room integration tests.
8. Phase 2.1 player stats + combat formula.
9. Phase 2.2 player death/respawn.
10. Phase 2.3 XP/leveling.
11. Phase 3.1 loot tables.
12. Phase 3.2 inventory.
13. Phase 3.3 equipment.
14. Phase 4.1 mana + casting validation.
15. Phase 4.2 spell effects.
16. Phase 5.1 NPCs.
17. Phase 5.2 quests.
18. Phase 6.1 PostgreSQL + Prisma persistence.
19. Phase 6.2 authentication hardening and account services.
20. Phase 7.1 chat channel expansion.
21. Phase 7.2 party/guild.
22. Phase 8.1 interest management.
23. Phase 8.2 zone partition.
24. Phase 8.3 observability + load tests.

---

## Validation Protocol Per Step
For every step above:

1. Implement minimal vertical slice.
2. Run typecheck:
   - `pnpm --recursive typecheck`
3. Run related tests.
4. Manual verification in two tabs.
5. Record what changed and residual risks.

---

## Immediate Next Step
Start with Phase 0.1: account/auth baseline, then immediately Phase 0.2 character creation + selection.
