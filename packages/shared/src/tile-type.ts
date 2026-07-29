export enum TileType {
    Grass = 0,
    Wall = 1,
    Tree = 2,
    Rock = 3
}

export const isBlockingTile = (tile: TileType): boolean => {
    return tile !== TileType.Grass;
};