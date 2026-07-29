export const WORLD_ROOM_NAME = 'world';

export const CLIENT_TO_SERVER_MESSAGE = {
    PLAYER_MOVE: 'player:move',
    PLAYER_ATTACK: 'player:attack',
    CHAT_SEND: 'chat:send',
    ITEM_DROP: 'item:drop',
    ITEM_PICKUP: 'item:pickup',
    ITEM_INVENTORY_REQUEST: 'item:inventory:request'
} as const;

export const SERVER_TO_CLIENT_MESSAGE = {
    CHAT_MESSAGE: 'chat:message',
    ANNOUNCEMENT: 'ui:announcement',
    ITEM_INVENTORY_SYNC: 'item:inventory:sync'
} as const;
