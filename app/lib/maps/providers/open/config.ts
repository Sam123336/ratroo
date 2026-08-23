export const openMapConfig = {
  styleUrl: process.env.NEXT_PUBLIC_OPEN_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty",
  rasterTileUrl: process.env.NEXT_PUBLIC_OPEN_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: process.env.NEXT_PUBLIC_OPEN_MAP_ATTRIBUTION || "© OpenStreetMap contributors",
  primarySourceId: process.env.NEXT_PUBLIC_OPEN_MAP_PRIMARY_SOURCE_ID || "openmaptiles",
};
