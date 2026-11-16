// Server settings. Environment variables override the defaults.

// How many baked planets to keep in the library (see planets.js): new games
// draw their systems' planets from it, so it needs at least a universe's
// worth (40), and more makes games look less alike.
export const PLANET_LIBRARY = Number(process.env.PLANET_LIBRARY ?? 200);
