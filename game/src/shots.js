// The screenshot scenes behind ?shot=start|play|rings|end. Each one
// flies the real flight model forward from a fresh flight, steered by
// a small autopilot, so the frame is what a short game really looks
// like and the same seed always gives the same frame. The rings and
// end scenes set the flight state directly, then let the renderer
// paint it — the same code path the game itself draws.

import { STEP } from './config.js';
import {
  EVENT_COMPLETE, EVENT_CRASH, EVENT_LANDED, PHASE_COMPLETE, PHASE_CRASHED,
  createFlight, nextRing, stepFlight,
} from './plane.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 58;

/** Steer toward the next ring: bank hard into the turn, pitch for its
 *  height, and ease off the throttle when the turn is tight or the
 *  ring is close, so the turn tightens instead of overshooting. */
function autopilotStick(flight) {
  const ring = nextRing(flight);
  if (!ring) return { pitch: 0, bank: 0, throttleDelta: 0, wheel: 0 };
  const targetHeading = Math.atan2(ring.x - flight.x, ring.z - flight.z);
  let error = targetHeading - flight.heading;
  while (error > Math.PI) error -= Math.PI * 2;
  while (error < -Math.PI) error += Math.PI * 2;
  const distance = Math.hypot(ring.x - flight.x, ring.alt - flight.alt, ring.z - flight.z);
  const desiredSpeed = distance < 500 || Math.abs(error) > 1.0 ? 50 : 68;
  let bank = Math.max(-0.95, Math.min(0.95, error * 2.2));
  // Slow and wings-level to recover: never stall in a circling turn.
  if (flight.speed < 32) bank *= 0.3;
  const heightError = ring.alt - flight.alt;
  const pitch = Math.max(-0.6, Math.min(0.6, heightError * 0.02));
  const throttleDelta = flight.speed < desiredSpeed - 3 ? 1 : flight.speed > desiredSpeed + 3 ? -1 : 0;
  return { pitch, bank, throttleDelta, wheel: 0 };
}

/** Run the autopilot for up to `seconds`, stopping on a crash or landing. */
function flyForward(flight, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = stepFlight(flight, autopilotStick(flight), STEP);
    if (events & (EVENT_CRASH | EVENT_LANDED | EVENT_COMPLETE)) break;
    if (flight.phase === PHASE_CRASHED || flight.phase === PHASE_COMPLETE) break;
  }
}

/**
 * Set `flight` to the named scene and return the screen to draw over
 * it and the best score to show.
 */
export function stageShot(name, seed) {
  if (name === 'rings') {
    // Mid-course on Harbour Run: two rings banked, a third glowing
    // ahead, the runway still visible down to the left.
    const flight = createFlight(0, seed);
    flight.x = 150;
    flight.z = 1080;
    flight.alt = 175;
    flight.heading = -0.45;
    flight.pitch = 0.06;
    flight.bank = -0.1;
    flight.speed = 58;
    flight.throttle = 0.82;
    flight.fuel = 78;
    flight.time = 62;
    flight.score = 250;
    flight.ringsPassed = 2;
    flight.centerHits = 1;
    flight.ringStates[0].passed = true;
    flight.ringStates[0].best = 6;
    flight.ringStates[1].passed = true;
    flight.ringStates[1].best = 15;
    flight.phase = 'flying';
    flight.message = 'RING 2/6! +100';
    flight.messageTime = 2;
    return { flight, screen: SCREEN_PLAY, best: 480 };
  }

  if (name === 'end') {
    // Harbour Run finished: every ring flown, wheels on the runway,
    // the mission-complete panel up with the score breakdown.
    const flight = createFlight(0, seed);
    flight.x = 2;
    flight.z = 420;
    flight.alt = 0;
    flight.heading = 0;
    flight.pitch = 0;
    flight.bank = 0;
    flight.speed = 0;
    flight.throttle = 0;
    flight.fuel = 41;
    flight.time = 138;
    flight.score = 400 + 6 * 100 + 50 + 48;
    flight.ringsPassed = 6;
    flight.centerHits = 1;
    for (const state of flight.ringStates) {
      state.passed = true;
      state.best = 9;
    }
    flight.phase = PHASE_COMPLETE;
    return { flight, screen: SCREEN_COMPLETE, best: 1098 };
  }

  if (name === 'play') {
    // The autopilot joins Harbour Run already airborne and climbing
    // gently toward the first ring, so the frame is a real moment of
    // flight, not a pose: rings ahead, terrain below, speed on.
    const flight = createFlight(0, seed);
    flight.x = 0;
    flight.z = 250;
    flight.alt = 122;
    flight.heading = 0.04;
    flight.pitch = 0.05;
    flight.bank = 0;
    flight.speed = 55;
    flight.throttle = 0.8;
    flight.fuel = 88;
    flight.time = 12;
    flight.phase = 'flying';
    flyForward(flight, 20);
    if (flight.phase === PHASE_CRASHED || flight.ringsPassed === 0) {
      // A gentler retry from closer in, in case the first run missed.
      const retry = createFlight(0, seed);
      retry.x = 0;
      retry.z = 300;
      retry.alt = 128;
      retry.heading = 0;
      retry.pitch = 0.02;
      retry.speed = 50;
      retry.throttle = 0.75;
      retry.fuel = 90;
      retry.time = 14;
      retry.phase = 'flying';
      flyForward(retry, 16);
      if (retry.phase !== PHASE_CRASHED && retry.ringsPassed > 0) {
        return { flight: retry, screen: SCREEN_PLAY, best: 480 };
      }
    }
    return { flight, screen: SCREEN_PLAY, best: 480 };
  }

  // start: the courier sits on the runway, engine off, title up.
  const flight = createFlight(0, seed);
  flight.throttle = 0;
  return { flight, screen: SCREEN_TITLE, best: 480 };
}
