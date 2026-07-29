export type AuthToken = string;
export type CharacterId = string;

export type AuthCredentials = {
    username: string;
    password: string;
};

export type CharacterSummary = {
    id: CharacterId;
    name: string;
};

export type AuthRegisterInput = AuthCredentials & {
    characterName: string;
};
export type AuthLoginInput = AuthCredentials;

export type AuthSuccessResponse = {
    accountId: string;
    username: string;
    token: AuthToken;
};

export type AuthRegisterResponse = AuthSuccessResponse & {
    createdCharacter: CharacterSummary;
};

export type AuthLoginResponse = AuthSuccessResponse & {
    characters: CharacterSummary[];
};

export type AuthCreateCharacterInput = {
    authToken: AuthToken;
    characterName: string;
};

export type AuthCreateCharacterResponse = {
    character: CharacterSummary;
};

export type AuthCharactersResponse = {
    characters: CharacterSummary[];
};

export type AuthErrorResponse = {
    error: string;
};

export type WorldJoinOptions = {
    authToken: AuthToken;
    characterId: CharacterId;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const isAuthCredentials = (
    value: unknown
): value is AuthCredentials => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.username === 'string' &&
        typeof value.password === 'string'
    );
};

export const isAuthRegisterInput = (
    value: unknown
): value is AuthRegisterInput => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.username === 'string' &&
        typeof value.password === 'string' &&
        typeof value.characterName === 'string'
    );
};

export const isWorldJoinOptions = (
    value: unknown
): value is WorldJoinOptions => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.authToken === 'string' &&
        typeof value.characterId === 'string'
    );
};

export const isAuthCreateCharacterInput = (
    value: unknown
): value is AuthCreateCharacterInput => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.authToken === 'string' &&
        typeof value.characterName === 'string'
    );
};
