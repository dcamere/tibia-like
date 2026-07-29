import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

import { WORLD_ROOM_NAME, WorldRoom } from './rooms/WorldRoom';

const DEFAULT_PORT = 2567;

const parsePort = (value: string | undefined): number => {
    const parsedPort = Number.parseInt(value ?? '', 10);

    if (Number.isNaN(parsedPort)) {
        return DEFAULT_PORT;
    }

    return parsedPort;
};

const port = parsePort(process.env.PORT);

const gameServer = new Server({
    transport: new WebSocketTransport({})
});

gameServer.define(WORLD_ROOM_NAME, WorldRoom);

await gameServer.listen(port);

console.info(`Colyseus listening on ws://localhost:${port}`);
