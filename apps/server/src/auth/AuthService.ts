import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { CharacterSummary } from '@tibia-like/shared';

export type AuthSession = {
    accountId: string;
    username: string;
    role: 'player' | 'gm';
};

type StoredAccount = {
    accountId: string;
    username: string;
    passwordSalt: string;
    passwordHash: string;
};

type StoredCharacter = CharacterSummary & {
    accountId: string;
};

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const MIN_PASSWORD_LENGTH = 6;
const MIN_CHARACTER_NAME_LENGTH = 3;
const MAX_CHARACTER_NAME_LENGTH = 20;
const GM_USERNAMES = new Set<string>(['ekkel']);

const accountsByUsername = new Map<string, StoredAccount>();
const sessionsByToken = new Map<string, AuthSession>();
const charactersByAccountId = new Map<string, StoredCharacter[]>();

const normalizeUsername = (username: string): string => {
    return username.trim().toLowerCase();
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

const hashPassword = (password: string, salt: string): string => {
    return scryptSync(password, salt, 64).toString('hex');
};

const createAccountId = (): string => {
    return `acc_${randomBytes(8).toString('hex')}`;
};

const createToken = (): string => {
    return `tok_${randomBytes(24).toString('hex')}`;
};

const createCharacterId = (): string => {
    return `chr_${randomBytes(8).toString('hex')}`;
};

const normalizeCharacterName = (value: string): string => {
    return value.trim().slice(0, MAX_CHARACTER_NAME_LENGTH);
};

const isValidCharacterName = (value: string): boolean => {
    return (
        value.length >= MIN_CHARACTER_NAME_LENGTH &&
        value.length <= MAX_CHARACTER_NAME_LENGTH
    );
};

const verifyPassword = (
    candidatePassword: string,
    account: StoredAccount
): boolean => {
    const candidateHash = hashPassword(
        candidatePassword,
        account.passwordSalt
    );

    const left = Buffer.from(candidateHash, 'hex');
    const right = Buffer.from(account.passwordHash, 'hex');

    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
};

const createCharacterForAccount = (
    accountId: string,
    characterNameInput: string
): CharacterSummary => {
    const characterName = normalizeCharacterName(characterNameInput);

    if (!isValidCharacterName(characterName)) {
        throw new Error('Character name must be 3-20 characters.');
    }

    const characters = charactersByAccountId.get(accountId) ?? [];

    const alreadyExists = characters.some(
        (character) => character.name.toLowerCase() === characterName.toLowerCase()
    );

    if (alreadyExists) {
        throw new Error('Character name already exists in this account.');
    }

    const createdCharacter: StoredCharacter = {
        id: createCharacterId(),
        name: characterName,
        accountId
    };

    characters.push(createdCharacter);
    charactersByAccountId.set(accountId, characters);

    return {
        id: createdCharacter.id,
        name: createdCharacter.name
    };
};

const issueSession = (account: StoredAccount): { token: string; session: AuthSession } => {
    const token = createToken();

    const normalizedUsername = account.username.toLowerCase();

    const role: 'player' | 'gm' = (
        normalizedUsername.startsWith('gm_') ||
        GM_USERNAMES.has(normalizedUsername)
    )
        ? 'gm'
        : 'player';

    const session: AuthSession = {
        accountId: account.accountId,
        username: account.username,
        role
    };

    sessionsByToken.set(token, session);

    return { token, session };
};

export const registerAccount = (
    usernameInput: string,
    password: string,
    characterNameInput: string
): {
    token: string;
    session: AuthSession;
    createdCharacter: CharacterSummary;
} => {
    const username = normalizeUsername(usernameInput);

    if (!isValidUsername(username)) {
        throw new Error(
            'Username must be 3-20 chars and use only a-z, 0-9 or _.'
        );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error('Password must have at least 6 characters.');
    }

    if (accountsByUsername.has(username)) {
        throw new Error('Username is already registered.');
    }

    const passwordSalt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, passwordSalt);

    const account: StoredAccount = {
        accountId: createAccountId(),
        username,
        passwordSalt,
        passwordHash
    };

    accountsByUsername.set(username, account);

    const createdCharacter = createCharacterForAccount(
        account.accountId,
        characterNameInput
    );

    const auth = issueSession(account);

    return {
        token: auth.token,
        session: auth.session,
        createdCharacter
    };
};

export const loginAccount = (
    usernameInput: string,
    password: string
): {
    token: string;
    session: AuthSession;
    characters: CharacterSummary[];
} => {
    const username = normalizeUsername(usernameInput);
    const account = accountsByUsername.get(username);

    if (!account || !verifyPassword(password, account)) {
        throw new Error('Invalid username or password.');
    }

    const storedCharacters =
        charactersByAccountId.get(account.accountId) ?? [];

    if (storedCharacters.length === 0) {
        throw new Error('This account has no characters yet.');
    }

    const auth = issueSession(account);

    return {
        token: auth.token,
        session: auth.session,
        characters: storedCharacters.map((character) => ({
            id: character.id,
            name: character.name
        }))
    };
};

export const getSessionByToken = (token: string): AuthSession | null => {
    return sessionsByToken.get(token) ?? null;
};

export const getAccountCharacter = (
    accountId: string,
    characterId: string
): CharacterSummary | null => {
    const characters = charactersByAccountId.get(accountId);

    if (!characters) {
        return null;
    }

    const character = characters.find((entry) => entry.id === characterId);

    if (!character) {
        return null;
    }

    return {
        id: character.id,
        name: character.name
    };
};

export const createCharacterFromSessionToken = (
    authToken: string,
    characterName: string
): CharacterSummary => {
    const session = getSessionByToken(authToken);

    if (session === null) {
        throw new Error('Authentication required.');
    }

    return createCharacterForAccount(session.accountId, characterName);
};

export const getCharactersFromSessionToken = (
    authToken: string
): CharacterSummary[] => {
    const session = getSessionByToken(authToken);

    if (session === null) {
        throw new Error('Authentication required.');
    }

    const characters = charactersByAccountId.get(session.accountId) ?? [];

    return characters.map((character) => ({
        id: character.id,
        name: character.name
    }));
};
