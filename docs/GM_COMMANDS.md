# GM Commands Reference

This document lists available in-game commands and expected behavior.

## Permission model

- Player commands are available to everyone.
- GM commands require account role `gm`.
- GM role is resolved from:
  - usernames starting with `gm_`
  - usernames listed in GM_USERNAMES environment variable.

## Chat basics

- Open chat with Enter.
- Send plain text to local channel by default.
- Built-in channels:
  - local
  - world
  - private
  - system

## General commands

### /help

Shows command help summary.

### /w <message>

Sends world/global chat message.

Example:
```text
/w Hola reino
```

### /pm <player> <message>

Sends private message to a player.

Example:
```text
/pm ekkel hola
```

## Inventory commands (authoritative server)

### /inv

Shows your current inventory grouped by item slug and quantity.

### /ground

Shows ground items at your current tile.

### /drop <slug> <qty>

Drops quantity from your inventory to the current tile.

Validations:
- quantity > 0
- enough item quantity in inventory
- stack updates are transactional

Example:
```text
/drop gold_coin 10
```

### /pickup <slug> <qty>

Picks up quantity from ground at current tile.

Validations:
- quantity > 0
- item exists on ground
- enough quantity on ground
- pickup range validation (server)
- inventory stack merge/create is transactional

Example:
```text
/pickup gold_coin 1
```

## GM commands

### /announce <message>

Broadcasts a large visual announcement banner at top-center of screen (not regular chat).

Example:
```text
/announce Reinicio en 5 minutos
```

### /tpme <x> <y>

Teleports your character to tile coordinates.

Validations:
- walkable tile
- no overlap with blocked occupancy rules

Example:
```text
/tpme 12 8
```

### /tp <player> <x> <y>

Teleports target player to coordinates.

Example:
```text
/tp test 10 10
```

### /speed <player> <1-4>

Sets movement speed multiplier for player in current room runtime.

Example:
```text
/speed test 2
```

### /god <player> <on|off>

Toggles god mode for target player.

Current behavior:
- Attacks from that player instantly kill creatures.

Examples:
```text
/god test on
/god test off
```

### /giveitem <player> <slug> <qty>

Gives an item directly into target player's inventory.

Validations:
- item definition must exist
- quantity > 0
- stack rules enforced server-side

Example:
```text
/giveitem test health_potion 5
```

## Notes for developers

- All command execution is server authoritative.
- Command parsing currently lives in:
  - apps/server/src/rooms/WorldRoom.ts
- Inventory logic and transactional writes live in:
  - apps/server/src/inventory/InventoryService.ts
