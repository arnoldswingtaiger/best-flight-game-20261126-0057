// The numbers the whole game agrees on: the fixed step, the flight
// envelope, the fuel budget and the three courier missions.
export const STEP = 1 / 60;
export const BEST_KEY = 'skyline-courier-best';

// Flight envelope (metres, metres per second, radians).
export const MAX_SPEED = 96;
export const CRUISE_SPEED = 62;
export const STALL_SPEED = 27;
export const TAKEOFF_SPEED = 34;
export const MAX_BANK = 0.95;
export const MAX_PITCH_UP = 0.42;
export const MAX_PITCH_DOWN = -0.38;
export const RING_RADIUS = 20;
export const CENTER_RADIUS = 8;

// Fuel: 100 units, about two and a half minutes at full throttle,
// longer when gentle — full throttle the whole way risks dry tanks.
export const FUEL_START = 100;
export const FUEL_BURN_IDLE = 0.15;
export const FUEL_BURN_FULL = 0.55;

// Scoring.
export const RING_POINTS = 100;
export const CENTER_BONUS = 50;
export const LANDING_POINTS = 400;
export const TIME_BONUS_PER_SECOND = 4;

// The runway: a strip along the north axis, centred on x = 0.
export const RUNWAY = { x: 0, zStart: -120, zEnd: 780, halfWidth: 15 };

// Wind is in metres per second, blowing toward +x / +z.
export const MISSIONS = [
  {
    name: 'Harbour Run',
    blurb: 'Six rings down the valley, then home to runway 09.',
    wind: { x: 2, z: -1 },
    parSeconds: 150,
    rings: [
      { x: 0, alt: 130, z: 420 },
      { x: 130, alt: 160, z: 900 },
      { x: -90, alt: 190, z: 1380 },
      { x: 210, alt: 230, z: 1850 },
      { x: 10, alt: 170, z: 2280 },
      { x: -110, alt: 150, z: 2620 },
    ],
  },
  {
    name: 'Mountain Pass',
    blurb: 'Eight rings through the eastern ridge. Mind the rock.',
    wind: { x: -4, z: 2 },
    parSeconds: 210,
    rings: [
      { x: 180, alt: 200, z: 500 },
      { x: 420, alt: 280, z: 950 },
      { x: 620, alt: 360, z: 1350 },
      { x: 540, alt: 420, z: 1750 },
      { x: 700, alt: 380, z: 2150 },
      { x: 480, alt: 330, z: 2500 },
      { x: 240, alt: 240, z: 2780 },
      { x: 0, alt: 170, z: 3050 },
    ],
  },
  {
    name: 'River Low Run',
    blurb: 'Eight low rings over the river. Fast, flat and close.',
    wind: { x: 1, z: 3 },
    parSeconds: 180,
    rings: [
      { x: 250, alt: 80, z: 380 },
      { x: 330, alt: 95, z: 820 },
      { x: 260, alt: 75, z: 1240 },
      { x: 380, alt: 110, z: 1660 },
      { x: 300, alt: 85, z: 2060 },
      { x: 430, alt: 120, z: 2440 },
      { x: 350, alt: 90, z: 2800 },
      { x: 140, alt: 130, z: 3100 },
    ],
  },
];
