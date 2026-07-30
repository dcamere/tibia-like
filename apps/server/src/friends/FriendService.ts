import { type FriendListSyncPayload } from '@tibia-like/shared';

import { prisma } from '../db';

const normalizeCharacterPair = (
    leftCharacterId: string,
    rightCharacterId: string
): { characterAId: string; characterBId: string } => {
    if (leftCharacterId < rightCharacterId) {
        return {
            characterAId: leftCharacterId,
            characterBId: rightCharacterId
        };
    }

    return {
        characterAId: rightCharacterId,
        characterBId: leftCharacterId
    };
};

const resolveOtherCharacterId = (
    currentCharacterId: string,
    friendship: {
        characterAId: string;
        characterBId: string;
    }
): string => {
    return friendship.characterAId === currentCharacterId
        ? friendship.characterBId
        : friendship.characterAId;
};

export const getFriendCharacterIds = async (
    characterId: string
): Promise<string[]> => {
    const friendships = await prisma.friendship.findMany({
        where: {
            OR: [{ characterAId: characterId }, { characterBId: characterId }]
        },
        select: {
            characterAId: true,
            characterBId: true
        }
    });

    return friendships.map((friendship) =>
        resolveOtherCharacterId(characterId, friendship)
    );
};

export const listFriendSnapshot = async (
    characterId: string,
    onlineCharacterIds: ReadonlySet<string>
): Promise<FriendListSyncPayload> => {
    const [friendships, pendingInvites] = await Promise.all([
        prisma.friendship.findMany({
            where: {
                OR: [{ characterAId: characterId }, { characterBId: characterId }]
            },
            include: {
                characterA: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                characterB: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        }),
        prisma.friendRequest.findMany({
            where: {
                toCharacterId: characterId,
                status: 'pending'
            },
            include: {
                fromCharacter: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        })
    ]);

    return {
        friends: friendships
            .map((friendship) => {
                const friendCharacter =
                    friendship.characterAId === characterId
                        ? friendship.characterB
                        : friendship.characterA;

                return {
                    characterId: friendCharacter.id,
                    name: friendCharacter.name,
                    online: onlineCharacterIds.has(friendCharacter.id)
                };
            })
            .sort((left, right) => left.name.localeCompare(right.name)),
        pendingInvites: pendingInvites.map((invite) => ({
            requestId: invite.id,
            fromCharacterId: invite.fromCharacter.id,
            fromName: invite.fromCharacter.name,
            createdAt: invite.createdAt.toISOString()
        }))
    };
};

export const createFriendRequestByName = async (
    fromCharacterId: string,
    targetNameInput: string
): Promise<{
    requestId: string;
    targetCharacterId: string;
    targetCharacterName: string;
}> => {
    const targetName = targetNameInput.trim();

    if (targetName.length < 3) {
        throw new Error('Nombre de amigo invalido.');
    }

    const sourceCharacter = await prisma.character.findUnique({
        where: { id: fromCharacterId },
        select: {
            id: true,
            name: true
        }
    });

    if (!sourceCharacter) {
        throw new Error('No se pudo resolver tu personaje.');
    }

    const targets = await prisma.character.findMany({
        where: {
            name: targetName
        },
        select: {
            id: true,
            name: true
        },
        take: 2
    });

    if (targets.length === 0) {
        throw new Error('No existe un personaje con ese nombre.');
    }

    if (targets.length > 1) {
        throw new Error('Nombre ambiguo. Pide al jugador que cambie de nombre.');
    }

    const targetCharacter = targets[0];

    if (targetCharacter.id === sourceCharacter.id) {
        throw new Error('No puedes agregarte a ti mismo.');
    }

    const pair = normalizeCharacterPair(sourceCharacter.id, targetCharacter.id);

    const existingFriendship = await prisma.friendship.findUnique({
        where: {
            characterAId_characterBId: {
                characterAId: pair.characterAId,
                characterBId: pair.characterBId
            }
        },
        select: { id: true }
    });

    if (existingFriendship) {
        throw new Error('Ya son amigos.');
    }

    const reversePending = await prisma.friendRequest.findFirst({
        where: {
            fromCharacterId: targetCharacter.id,
            toCharacterId: sourceCharacter.id,
            status: 'pending'
        },
        select: { id: true }
    });

    if (reversePending) {
        throw new Error('Ese jugador ya te envio una solicitud. Revisa invitaciones pendientes.');
    }

    const samePending = await prisma.friendRequest.findFirst({
        where: {
            fromCharacterId: sourceCharacter.id,
            toCharacterId: targetCharacter.id,
            status: 'pending'
        },
        select: { id: true }
    });

    if (samePending) {
        throw new Error('Ya enviaste una solicitud a ese jugador.');
    }

    const request = await prisma.friendRequest.create({
        data: {
            fromCharacterId: sourceCharacter.id,
            toCharacterId: targetCharacter.id,
            status: 'pending'
        }
    });

    return {
        requestId: request.id,
        targetCharacterId: targetCharacter.id,
        targetCharacterName: targetCharacter.name
    };
};

export const respondToFriendRequest = async (
    toCharacterId: string,
    requestId: string,
    accept: boolean
): Promise<{
    requesterCharacterId: string;
    requesterCharacterName: string;
    accepted: boolean;
}> => {
    const request = await prisma.friendRequest.findFirst({
        where: {
            id: requestId,
            toCharacterId,
            status: 'pending'
        },
        include: {
            fromCharacter: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });

    if (!request) {
        throw new Error('Invitacion pendiente no encontrada.');
    }

    if (!accept) {
        await prisma.friendRequest.update({
            where: { id: request.id },
            data: { status: 'rejected' }
        });

        return {
            requesterCharacterId: request.fromCharacter.id,
            requesterCharacterName: request.fromCharacter.name,
            accepted: false
        };
    }

    const pair = normalizeCharacterPair(request.fromCharacterId, request.toCharacterId);

    await prisma.$transaction(async (tx) => {
        await tx.friendRequest.update({
            where: { id: request.id },
            data: { status: 'accepted' }
        });

        await tx.friendship.upsert({
            where: {
                characterAId_characterBId: {
                    characterAId: pair.characterAId,
                    characterBId: pair.characterBId
                }
            },
            update: {},
            create: {
                characterAId: pair.characterAId,
                characterBId: pair.characterBId
            }
        });
    });

    return {
        requesterCharacterId: request.fromCharacter.id,
        requesterCharacterName: request.fromCharacter.name,
        accepted: true
    };
};
