import { randomBytes } from 'node:crypto';

import { verify, hash } from '@node-rs/argon2';
import {
    type Character,
    type Prisma,
    type Session
} from '@prisma/client';

import type { CharacterSummary } from '@tibia-like/shared';
import { STARTER_CITY_DEFAULT_SPAWN } from '@tibia-like/shared';

import { prisma } from '../db';

export type AuthSession = {
    accountId: string;
    username: string;
    role: 'player' | 'gm';
};

export type CharacterSelection = CharacterSummary;
type AccountRole = 'player' | 'gm';

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const MIN_PASSWORD_LENGTH = 6;
const MIN_CHARACTER_NAME_LENGTH = 3;
const MAX_CHARACTER_NAME_LENGTH = 20;
const SESSION_SELECT = {
    token: true,
    accountId: true,
    expiresAt: true,
    revokedAt: true,
    account: {
        select: {
            username: true,
            role: true
        }
    }
} satisfies Prisma.SessionSelect;

const tokenTtlHours = Number.parseInt(process.env.TOKEN_TTL_HOURS ?? '168', 10);

const normalizeUsername = (username: string): string => {
    return username.trim().toLowerCase();
};

const normalizeCharacterName = (value: string): string => {
    return value.trim().slice(0, MAX_CHARACTER_NAME_LENGTH);
};

const isValidUsername = (username: string): boolean => {
    if (
        username.length < MIN_USERNAME_LENGTH ||
        username.length > MAX_USERNAME_LENGTH
    ) {
        return false;
    }

    return /^[a-z0-9_]+$/.test(username);
};

const isValidCharacterName = (value: string): boolean => {
    return (
        value.length >= MIN_CHARACTER_NAME_LENGTH &&
        value.length <= MAX_CHARACTER_NAME_LENGTH
    );
};

const createToken = (): string => {
    return `tok_${randomBytes(24).toString('hex')}`;
};

const toRole = (role: AccountRole): 'player' | 'gm' => {
    return role === 'gm' ? 'gm' : 'player';
};

const toCharacterSummary = (character: Character): CharacterSummary => {
    return {
        id: character.id,
        name: character.name,
        tileX: character.tileX,
        tileY: character.tileY,
        level: character.level,
        experience: character.experience,
        goldCopper: character.goldCopper
    };
};

const resolveAccountRole = (normalizedUsername: string): AccountRole => {
    const fromEnv = (process.env.GM_USERNAMES ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);

    const gmUsernames = new Set<string>(['ekkel', ...fromEnv]);

    if (normalizedUsername.startsWith('gm_') || gmUsernames.has(normalizedUsername)) {
        return 'gm';
    }

    return 'player';
};

const createSession = async (accountId: string): Promise<string> => {
    const token = createToken();
    const ttl = Number.isFinite(tokenTtlHours) && tokenTtlHours > 0 ? tokenTtlHours : 168;

    const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);

    await prisma.session.create({
        data: {
            token,
            accountId,
            expiresAt
        }
    });

    return token;
};

const getValidSessionByToken = async (token: string): Promise<(Session & {
    account: {
        username: string;
        role: AccountRole;
    };
}) | null> => {
    const session = await prisma.session.findUnique({
        where: { token },
        select: SESSION_SELECT
    });

    if (!session) {
        return null;
    }

    if (session.revokedAt !== null) {
        return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
        return null;
    }

    return session as Session & {
        account: {
            username: string;
            role: AccountRole;
        };
    };
};

export const registerAccount = async (
    usernameInput: string,
    password: string,
    characterNameInput: string
): Promise<{
    token: string;
    session: AuthSession;
    createdCharacter: CharacterSummary;
}> => {
    const username = normalizeUsername(usernameInput);

    if (!isValidUsername(username)) {
        throw new Error('Username must be 3-20 chars and use only a-z, 0-9 or _.');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error('Password must have at least 6 characters.');
    }

    const characterName = normalizeCharacterName(characterNameInput);

    if (!isValidCharacterName(characterName)) {
        throw new Error('Character name must be 3-20 characters.');
    }

    const existing = await prisma.account.findUnique({
        where: { username },
        select: { id: true }
    });

    if (existing) {
        throw new Error('Username is already registered.');
    }

    const passwordHash = await hash(password);
    const role = resolveAccountRole(username);

    const created = await prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
            data: {
                username,
                passwordHash,
                role
            }
        });

        const character = await tx.character.create({
            data: {
                accountId: account.id,
                name: characterName,
                tileX: STARTER_CITY_DEFAULT_SPAWN.tileX,
                tileY: STARTER_CITY_DEFAULT_SPAWN.tileY,
                level: 1,
                experience: 0,
                goldCopper: 0
            }
        });

        return { account, character };
    });

    const token = await createSession(created.account.id);

    return {
        token,
        session: {
            accountId: created.account.id,
            username: created.account.username,
            role: toRole(created.account.role)
        },
        createdCharacter: toCharacterSummary(created.character)
    };
};

export const loginAccount = async (
    usernameInput: string,
    password: string
): Promise<{
    token: string;
    session: AuthSession;
    characters: CharacterSummary[];
}> => {
    const username = normalizeUsername(usernameInput);

    const account = await prisma.account.findUnique({
        where: { username },
        include: {
            characters: {
                orderBy: {
                    createdAt: 'asc'
                }
            }
        }
    });

    if (!account) {
        throw new Error('Invalid username or password.');
    }

    const isPasswordValid = await verify(account.passwordHash, password);

    if (!isPasswordValid) {
        throw new Error('Invalid username or password.');
    }

    if (account.characters.length === 0) {
        throw new Error('This account has no characters yet.');
    }

    const token = await createSession(account.id);

    return {
        token,
        session: {
            accountId: account.id,
            username: account.username,
            role: toRole(account.role)
        },
        characters: account.characters.map(toCharacterSummary)
    };
};

export const getSessionByToken = async (token: string): Promise<AuthSession | null> => {
    const session = await getValidSessionByToken(token);

    if (!session) {
        return null;
    }

    return {
        accountId: session.accountId,
        username: session.account.username,
        role: toRole(session.account.role)
    };
};

export const getAccountCharacter = async (
    accountId: string,
    characterId: string
): Promise<CharacterSelection | null> => {
    const character = await prisma.character.findFirst({
        where: {
            id: characterId,
            accountId
        }
    });

    if (!character) {
        return null;
    }

    return toCharacterSummary(character);
};

export const createCharacterFromSessionToken = async (
    authToken: string,
    characterNameInput: string
): Promise<CharacterSummary> => {
    const session = await getValidSessionByToken(authToken);

    if (!session) {
        throw new Error('Authentication required.');
    }

    const characterName = normalizeCharacterName(characterNameInput);

    if (!isValidCharacterName(characterName)) {
        throw new Error('Character name must be 3-20 characters.');
    }

    const duplicate = await prisma.character.findFirst({
        where: {
            accountId: session.accountId,
            name: characterName
        },
        select: { id: true }
    });

    if (duplicate) {
        throw new Error('Character name already exists in this account.');
    }

    const character = await prisma.character.create({
        data: {
            accountId: session.accountId,
            name: characterName,
            tileX: STARTER_CITY_DEFAULT_SPAWN.tileX,
            tileY: STARTER_CITY_DEFAULT_SPAWN.tileY,
            level: 1,
            experience: 0,
            goldCopper: 0
        }
    });

    return toCharacterSummary(character);
};

export const getCharactersFromSessionToken = async (
    authToken: string
): Promise<CharacterSummary[]> => {
    const session = await getValidSessionByToken(authToken);

    if (!session) {
        throw new Error('Authentication required.');
    }

    const characters = await prisma.character.findMany({
        where: {
            accountId: session.accountId
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    return characters.map(toCharacterSummary);
};

export const persistCharacterProgress = async (
    characterId: string,
    payload: {
        tileX: number;
        tileY: number;
        level: number;
        experience: number;
        goldCopper: number;
    }
): Promise<void> => {
    await prisma.character.update({
        where: { id: characterId },
        data: {
            tileX: payload.tileX,
            tileY: payload.tileY,
            level: payload.level,
            experience: payload.experience,
            goldCopper: payload.goldCopper
        }
    });
};
