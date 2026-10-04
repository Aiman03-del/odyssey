// Colors and fog settings for each world.
export const WORLDS = {
  space: { background: "#000005", fog: 0 },
  underwater: { background: "#04324d", fog: 0.035 },
  mountains: { background: "#a9c4dc", fog: 0.01 },
};

// Depth ranges (-z) for world color transitions.
// These transitions happen behind the veil.
export const SPACE_TO_WATER = { from: 50, to: 60 };
export const WATER_TO_MOUNTAIN = { from: 158, to: 174 };

// Depth range where the human stops floating and starts walking.
export const WALK = { from: 180, to: 200 };