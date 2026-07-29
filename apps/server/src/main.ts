import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express, {
    type NextFunction,
    type Request,
    type Response
} from 'express';

import {
    WORLD_ROOM_NAME,
    isAuthCreateCharacterInput,
    type AuthLoginInput,
    type AuthCreateCharacterInput,
    type AuthCharactersResponse,
    type AuthCreateCharacterResponse,
    type AuthRegisterInput
} from '@tibia-like/shared';

import {
    createCharacterFromSessionToken,
    getCharactersFromSessionToken,
    loginAccount,
    registerAccount
} from './auth/AuthService';
import { WorldRoom } from './rooms/WorldRoom';

const DEFAULT_PORT = 2567;
const DEFAULT_AUTH_PORT = 3567;

const parsePort = (
    value: string | undefined,
    fallback: number
): number => {
    const parsedPort = Number.parseInt(value ?? '', 10);

    if (Number.isNaN(parsedPort)) {
        return fallback;
    }

    return parsedPort;
};

const port = parsePort(process.env.PORT, DEFAULT_PORT);
const authPort = parsePort(process.env.AUTH_PORT, DEFAULT_AUTH_PORT);

const authApp = express();

authApp.use(express.json());

authApp.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});

const respondAuthError = (
    res: Response,
    error: unknown
): void => {
    const message =
        error instanceof Error
            ? error.message
            : 'Unexpected auth error.';

    res.status(400).json({ error: message });
};

const parseLoginPayload = (
    req: Request
): AuthLoginInput => {
    const body = req.body as Record<string, unknown>;

    const username = body.username;
    const password = body.password;

    if (
        typeof username !== 'string' ||
        typeof password !== 'string'
    ) {
        throw new Error('Invalid auth payload.');
    }

    return { username, password };
};

const parseRegisterPayload = (
    req: Request
): AuthRegisterInput => {
    const body = req.body as Record<string, unknown>;

    const username = body.username;
    const password = body.password;
    const characterName = body.characterName;

    if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        typeof characterName !== 'string'
    ) {
        throw new Error('Invalid register payload.');
    }

    return {
        username,
        password,
        characterName
    };
};

const parseCreateCharacterPayload = (
    req: Request
): AuthCreateCharacterInput => {
    const body = req.body as unknown;

    if (!isAuthCreateCharacterInput(body)) {
        throw new Error('Invalid create character payload.');
    }

    return body;
};

authApp.post('/auth/register', (req: Request, res: Response) => {
    try {
        const payload = parseRegisterPayload(req);
        const result = registerAccount(
            payload.username,
            payload.password,
            payload.characterName
        );

        res.status(201).json({
            accountId: result.session.accountId,
            username: result.session.username,
            token: result.token,
            createdCharacter: result.createdCharacter
        });
    } catch (error: unknown) {
        respondAuthError(res, error);
    }
});

authApp.post('/auth/login', (req: Request, res: Response) => {
    try {
        const payload = parseLoginPayload(req);
        const result = loginAccount(payload.username, payload.password);

        res.status(200).json({
            accountId: result.session.accountId,
            username: result.session.username,
            token: result.token,
            characters: result.characters
        });
    } catch (error: unknown) {
        respondAuthError(res, error);
    }
});

authApp.post('/characters/create', (req: Request, res: Response) => {
    try {
        const payload = parseCreateCharacterPayload(req);
        const character = createCharacterFromSessionToken(
            payload.authToken,
            payload.characterName
        );

        const response: AuthCreateCharacterResponse = {
            character
        };

        res.status(201).json(response);
    } catch (error: unknown) {
        respondAuthError(res, error);
    }
});

authApp.get('/characters', (req: Request, res: Response) => {
    try {
        const token = req.query.token;

        if (typeof token !== 'string') {
            throw new Error('Missing token query parameter.');
        }

        const characters = getCharactersFromSessionToken(token);

        const response: AuthCharactersResponse = {
            characters
        };

        res.status(200).json(response);
    } catch (error: unknown) {
        respondAuthError(res, error);
    }
});

authApp.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});

const gameServer = new Server({
    transport: new WebSocketTransport({})
});

gameServer.define(WORLD_ROOM_NAME, WorldRoom);

authApp.listen(authPort, () => {
    console.info(`Auth API listening on http://localhost:${authPort}`);
});

await gameServer.listen(port);

console.info(`Colyseus listening on ws://localhost:${port}`);
