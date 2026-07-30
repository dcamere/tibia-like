export type FriendEntry = {
    characterId: string;
    name: string;
    online: boolean;
};

export type PendingFriendInvite = {
    requestId: string;
    fromCharacterId: string;
    fromName: string;
    createdAt: string;
};

export type FriendListSyncPayload = {
    friends: FriendEntry[];
    pendingInvites: PendingFriendInvite[];
};

export type FriendRequestCreateInput = {
    targetName: string;
};

export type FriendRequestRespondInput = {
    requestId: string;
    accept: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isFriendEntry = (value: unknown): value is FriendEntry => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.characterId === 'string' &&
        typeof value.name === 'string' &&
        typeof value.online === 'boolean'
    );
};

const isPendingFriendInvite = (value: unknown): value is PendingFriendInvite => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.requestId === 'string' &&
        typeof value.fromCharacterId === 'string' &&
        typeof value.fromName === 'string' &&
        typeof value.createdAt === 'string'
    );
};

export const isFriendListSyncPayload = (
    value: unknown
): value is FriendListSyncPayload => {
    if (!isRecord(value)) {
        return false;
    }

    if (!Array.isArray(value.friends) || !Array.isArray(value.pendingInvites)) {
        return false;
    }

    return (
        value.friends.every((entry) => isFriendEntry(entry)) &&
        value.pendingInvites.every((invite) => isPendingFriendInvite(invite))
    );
};

export const isFriendRequestCreateInput = (
    value: unknown
): value is FriendRequestCreateInput => {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.targetName === 'string';
};

export const isFriendRequestRespondInput = (
    value: unknown
): value is FriendRequestRespondInput => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.requestId === 'string' &&
        typeof value.accept === 'boolean'
    );
};
