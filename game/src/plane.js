// The courier plane itself: an arcade flight model with throttle,
// pitch, bank, lift and stall, fuel, damage, ring scoring and landings.
//
// The plane flies over the terrain in terrain.js. Heading 0 is north,
// pitch positive climbs, bank positive rolls right and turns right.

import {
  CENTER_BONUS, CENTER_RADIUS, FUEL_BURN_FULL, FUEL_BURN_IDLE, FUEL_START,
  LANDING_POINTS, MAX_BANK, MAX_PITCH_DOWN, MAX_PITCH_UP, MAX_SPEED,
  MISSIONS, RING_POINTS, RING_RADIUS, RUNWAY, STALL_SPEED, TAKEOFF_SPEED,
  TIME_BONUS_PER_SECOND,
} from './config.js';
import { groundHeightAt } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_CENTER = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASH = 8;
export const EVENT_FUEL_LOW = 16;
export const EVENT_COMPLETE = 32;

export const PHASE_TAXI = 'taxi';
export const PHASE_FLYING = 'flying';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';
export const PHASE_COMPLETE = 'complete';

/** A fresh flight on the chosen mission, sitting at the runway threshold. */
export function createFlight(missionIndex, seed) {
  const mission = MISSIONS[missionIndex] ?? MISSIONS[0];
  return {
    missionIndex,
    mission,
    seed,
    x: RUNWAY.x,
    z: RUNWAY.zStart + 60,
    alt: groundHeightAt(RUNWAY.x, RUNWAY.zStart + 60),
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: FUEL_START,
    damage: 0,
    score: 0,
    ringsPassed: 0,
    centerHits: 0,
    time: 0,
    phase: PHASE_TAXI,
    airborne: false,
    verticalSpeed: 0,
    message: '',
    messageTime: 0,
    crashReason: '',
    fuelWarned: false,
    landedOnce: false,
    ringStates: mission.rings.map(() => ({ passed: false, best: Infinity })),
  };
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function angleDifference(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** The next ring the pilot has to fly through, or null when done. */
export function nextRing(flight) {
  return flight.mission.rings[flight.ringsPassed] ?? null;
}

/** Where the runway threshold is, for the "return home" pointer. */
export function homePoint() {
  return { x: RUNWAY.x, z: (RUNWAY.zStart + RUNWAY.zEnd) / 2, alt: 0 };
}

function onRunway(flight) {
  return (
    Math.abs(flight.x - RUNWAY.x) < RUNWAY.halfWidth + 4 &&
    flight.z > RUNWAY.zStart - 20 &&
    flight.z < RUNWAY.zEnd + 20
  );
}

/**
 * One fixed step of flight. `stick` carries the pilot's inputs:
 * pitch -1..1 (pull up is positive), bank -1..1 (right is positive),
 * throttleDelta -1..1 (held throttle keys), and wheel for the mouse wheel.
 * Returns an event bitmask for sounds and announcements.
 */
export function stepFlight(flight, stick, dt) {
  if (flight.phase === PHASE_CRASHED || flight.phase === PHASE_COMPLETE) return EVENT_NONE;
  let events = EVENT_NONE;
  flight.time += dt;
  if (flight.messageTime > 0) flight.messageTime -= dt;

  // Throttle: held keys move it, the wheel nudges it, empty tanks kill it.
  flight.throttle = clamp(
    flight.throttle + (stick.throttleDelta || 0) * 0.55 * dt + (stick.wheel || 0),
    0,
    1,
  );
  const effectiveThrottle = flight.fuel > 0 ? flight.throttle : 0;
  flight.fuel = Math.max(0, flight.fuel - (FUEL_BURN_IDLE + effectiveThrottle * FUEL_BURN_FULL) * dt);
  if (flight.fuel < 20 && !flight.fuelWarned) {
    flight.fuelWarned = true;
    events |= EVENT_FUEL_LOW;
    flight.message = 'LOW FUEL — head for the runway';
    flight.messageTime = 4;
  }

  const ground = groundHeightAt(flight.x, flight.z);
  const airborne = flight.alt > ground + 0.6;

  // Speed chases the throttle, climbing bleeds a little of it away.
  const targetSpeed = 10 + effectiveThrottle * (MAX_SPEED - 10);
  flight.speed += (targetSpeed - flight.speed) * 0.45 * dt;
  flight.speed -= Math.sin(flight.pitch) * 4.5 * dt;
  flight.speed = Math.max(0, flight.speed);

  // Pitch and bank ease toward what the stick asks for.
  const pitchTarget = clamp((stick.pitch || 0) * MAX_PITCH_UP, MAX_PITCH_DOWN, MAX_PITCH_UP);
  const bankTarget = clamp(stick.bank || 0, -1, 1) * MAX_BANK;
  const authority = airborne && flight.speed > STALL_SPEED ? 1 : 0.35;
  flight.pitch += clamp(pitchTarget - flight.pitch, -1.9 * authority * dt, 1.9 * authority * dt);
  flight.bank += clamp(bankTarget - flight.bank, -2.6 * dt, 2.6 * dt);

  // A banked turn: the heading follows the bank, faster when slow.
  // Bank right (positive) turns right, toward a larger heading.
  if (airborne && flight.speed > 8) {
    flight.heading += (Math.tan(flight.bank) * 9.81) / Math.max(flight.speed, 12) * dt;
  }

  // Climb, sink, stall and the wind's push.
  const stalled = airborne && flight.speed < STALL_SPEED;
  let vertical = flight.speed * Math.sin(flight.pitch);
  if (stalled) vertical -= (STALL_SPEED - flight.speed) * 0.9;
  if (!airborne && flight.speed < TAKEOFF_SPEED) vertical = 0;
  flight.verticalSpeed = vertical;
  flight.alt += vertical * dt;
  const forward = Math.cos(flight.pitch) * flight.speed;
  flight.x += Math.sin(flight.heading) * forward * dt + flight.mission.wind.x * dt;
  flight.z += Math.cos(flight.heading) * forward * dt + flight.mission.wind.z * dt;

  // Ring checks: a sphere around each ring's centre, closest pass kept.
  const ring = nextRing(flight);
  if (ring && airborne) {
    const state = flight.ringStates[flight.ringsPassed];
    const dx = flight.x - ring.x;
    const dy = flight.alt - ring.alt;
    const dz = flight.z - ring.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < state.best) state.best = distance;
    if (distance < RING_RADIUS) {
      state.passed = true;
      flight.ringsPassed += 1;
      flight.score += RING_POINTS;
      events |= EVENT_RING;
      if (state.best < CENTER_RADIUS) {
        flight.centerHits += 1;
        flight.score += CENTER_BONUS;
        events |= EVENT_CENTER;
        flight.message = `DEAD CENTRE! +${RING_POINTS + CENTER_BONUS}`;
      } else {
        flight.message = `RING ${flight.ringsPassed}/${flight.mission.rings.length}! +${RING_POINTS}`;
      }
      flight.messageTime = 2.5;
      if (flight.ringsPassed === flight.mission.rings.length) {
        flight.message = 'ALL RINGS — land on the runway to finish!';
        flight.messageTime = 5;
      }
    }
  }

  // Touching the ground: a gentle runway touchdown lands, anything
  // else is a crash, and rough ground at speed wears the plane down.
  // `flight.airborne` is a latch: it sets once the plane is clearly
  // flying and clears only on the ground and slow, so a touchdown can
  // never slip through a one-step skim just above the ground.
  const wasFlying = flight.airborne;
  const newGround = groundHeightAt(flight.x, flight.z);
  if (flight.alt <= newGround + 0.05) {
    flight.alt = newGround;
    const hard = flight.verticalSpeed < -9;
    const sideways = Math.abs(flight.bank) > 0.5;
    const tooFast = flight.speed > 62;
    if (wasFlying && (hard || sideways || tooFast)) {
      flight.phase = PHASE_CRASHED;
      flight.crashReason = hard
        ? 'Came down too hard — the landing gear gave way.'
        : sideways
          ? 'Touched down banked over — a wingtip caught the ground.'
          : 'Landed far too fast and ran out of runway.';
      return events | EVENT_CRASH;
    }
    if (wasFlying && onRunway(flight)) {
      flight.phase = PHASE_LANDED;
      flight.landedOnce = true;
      if (flight.ringsPassed === flight.mission.rings.length) {
        const timeBonus = Math.max(
          0,
          Math.round((flight.mission.parSeconds - flight.time) * TIME_BONUS_PER_SECOND),
        );
        flight.score += LANDING_POINTS + timeBonus;
        flight.phase = PHASE_COMPLETE;
        flight.message = `MISSION COMPLETE — landing +${LANDING_POINTS}, time +${timeBonus}`;
        flight.messageTime = 8;
        return events | EVENT_LANDED | EVENT_COMPLETE;
      }
      flight.message = 'Down safe — but rings remain. Take off and finish the course!';
      flight.messageTime = 5;
      return events | EVENT_LANDED;
    }
    if (wasFlying) {
      // Rough ground, not the runway: a crash, however gentle it felt.
      flight.phase = PHASE_CRASHED;
      flight.crashReason = 'Put it down off the runway — the field is no place to land.';
      return events | EVENT_CRASH;
    }
    // Rolling on the ground: bumps off the strip wear the plane down,
    // faster the faster it rolls.
    if (!onRunway(flight) && flight.speed > 18) {
      flight.damage = Math.min(100, flight.damage + flight.speed * 0.8 * dt);
      if (flight.damage >= 100) {
        flight.phase = PHASE_CRASHED;
        flight.crashReason = 'Shook apart taxiing across rough ground.';
        return events | EVENT_CRASH;
      }
    }
  }

  // The airborne latch: clearly flying sets it, ground and slow clears it.
  if (flight.alt > groundHeightAt(flight.x, flight.z) + 5) flight.airborne = true;
  else if (flight.alt <= groundHeightAt(flight.x, flight.z) + 0.05 && flight.speed < TAKEOFF_SPEED) {
    flight.airborne = false;
  }

  if (airborne && (flight.phase === PHASE_TAXI || flight.phase === PHASE_LANDED)) {
    flight.phase = PHASE_FLYING;
  }
  return events;
}

/** The score breakdown shown on the mission-complete screen. */
export function scoreBreakdown(flight) {
  const timeBonus = Math.max(
    0,
    Math.round((flight.mission.parSeconds - flight.time) * TIME_BONUS_PER_SECOND),
  );
  return {
    rings: flight.ringsPassed * RING_POINTS,
    centres: flight.centerHits * CENTER_BONUS,
    landing: flight.phase === PHASE_COMPLETE ? LANDING_POINTS : 0,
    time: flight.phase === PHASE_COMPLETE ? timeBonus : 0,
    total: flight.score,
  };
}
