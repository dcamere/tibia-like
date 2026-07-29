export enum TileType {
    Grass = 0,
    Wall = 1,
    Tree = 2,
    Rock = 3,
    Road = 4,
    Water = 5,
    Bridge = 6,
    Fence = 7,
    LampPost = 8,
    Fountain = 9,
    MarketStall = 10,
    HouseRoof = 11,
    HouseFloor = 12,
    Garden = 13,
    Statue = 14,
    Banner = 15,
    Crate = 16,
    Bush = 17,
    Flower = 18
}

export const isBlockingTile = (tile: TileType): boolean => {
    return (
        tile === TileType.Wall ||
        tile === TileType.Tree ||
        tile === TileType.Rock ||
        tile === TileType.Water ||
        tile === TileType.Fence ||
        tile === TileType.LampPost ||
        tile === TileType.Fountain ||
        tile === TileType.MarketStall ||
        tile === TileType.HouseRoof ||
        tile === TileType.Statue ||
        tile === TileType.Crate ||
        tile === TileType.Bush
    );
};