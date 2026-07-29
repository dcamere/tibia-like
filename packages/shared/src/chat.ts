export type ChatChannel = 'local' | 'world' | 'private' | 'system';

export type ChatSendInput = {
    text: string;
};

export type ChatMessagePayload = {
    channel: ChatChannel;
    from: string;
    text: string;
    target?: string;
};

export type AnnouncementPayload = {
    text: string;
    from: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const isChatSendInput = (value: unknown): value is ChatSendInput => {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.text === 'string';
};

export const isChatMessagePayload = (
    value: unknown
): value is ChatMessagePayload => {
    if (!isRecord(value)) {
        return false;
    }

    const channel = value.channel;

    if (
        channel !== 'local' &&
        channel !== 'world' &&
        channel !== 'private' &&
        channel !== 'system'
    ) {
        return false;
    }

    if (typeof value.from !== 'string' || typeof value.text !== 'string') {
        return false;
    }

    return value.target === undefined || typeof value.target === 'string';
};

export const isAnnouncementPayload = (
    value: unknown
): value is AnnouncementPayload => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.text === 'string' &&
        typeof value.from === 'string'
    );
};
