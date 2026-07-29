export const WORLD_ROOM_NAME = 'world';

export const CLIENT_TO_SERVER_MESSAGE = {
    PLAYER_MOVE: 'player:move',
    PLAYER_ATTACK: 'player:attack',
    CHAT_SEND: 'chat:send'
} as const;

export const SERVER_TO_CLIENT_MESSAGE = {
    CHAT_MESSAGE: 'chat:message',
    ANNOUNCEMENT: 'ui:announcement'
} as const;
