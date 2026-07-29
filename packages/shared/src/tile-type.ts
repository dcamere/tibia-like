export enum TileType {
    Grass = 0,
    Wall = 1,
    Tree = 2,
    Rock = 3,
    Road = 4
}

export const isBlockingTile = (tile: TileType): boolean => {
    return tile === TileType.Wall || tile === TileType.Tree || tile === TileType.Rock;
};