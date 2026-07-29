import { prisma } from '../src/db';

const seed = async (): Promise<void> => {
    const definitions = [
        {
            slug: 'copper_coin',
            name: 'Copper Coin',
            stackable: true,
            maxStack: 100
        },
        {
            slug: 'silver_coin',
            name: 'Silver Coin',
            stackable: true,
            maxStack: 100
        },
        {
            slug: 'gold_coin',
            name: 'Gold Coin',
            stackable: true,
            maxStack: 100
        },
        {
            slug: 'health_potion',
            name: 'Health Potion',
            stackable: true,
            maxStack: 20
        },
        {
            slug: 'short_sword',
            name: 'Short Sword',
            stackable: false,
            maxStack: 1,
            equipSlot: 'hand_right' as const
        }
    ];

    for (const definition of definitions) {
        await prisma.itemDefinition.upsert({
            where: {
                slug: definition.slug
            },
            update: {
                name: definition.name,
                stackable: definition.stackable,
                maxStack: definition.maxStack,
                equipSlot: definition.equipSlot ?? null
            },
            create: {
                slug: definition.slug,
                name: definition.name,
                stackable: definition.stackable,
                maxStack: definition.maxStack,
                equipSlot: definition.equipSlot ?? null
            }
        });
    }
};

void seed()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
        console.error('Prisma seed failed', error);
        await prisma.$disconnect();
        process.exit(1);
    });
