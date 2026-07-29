/**
 * Identifier for any networked entity (player character, creature,
 * item, etc.). A plain string for now; kept as a distinct alias so call
 * sites document intent and can evolve independently of `string`.
 */
export type EntityId = string;

export type CreatureId = EntityId;
