// Boot and the one loop: input is read every frame, the flight
// advances in fixed 1/60 s steps, and the renderer paints what is
// there. The game moves between five screens: title, play, paused,
// crashed and mission complete.
//
// ?shot=start|play|rings|end stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import {
  EVENT_COMPLETE, EVENT_CRASH, EVENT_FUEL_LOW, EVENT_LANDED, EVENT_RING,
  createFlight, stepFlight,
} from './plane.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { playBeep, playCrash, playRingChime, playTouchdown, setEngineSound, toggleMute, unlockAudio } from './audio.js';
import {
  SCREEN_COMPLETE, SCREEN_CRASHED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '7', 10);
const seed = Number.isFinite(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, seed);
  let painted = 0;
  function paint() {
    renderer.draw(scene.flight, scene.screen, scene.best, 0, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let flight = createFlight(0, seed);
  let screen = SCREEN_TITLE;
  let selectedMission = 0;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startFlight(missionIndex) {
    unlockAudio();
    flight = createFlight(missionIndex, seed);
    selectedMission = missionIndex;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${flight.mission.name}. ${flight.mission.rings.length} rings, then land on the runway.`);
  }

  function bankBest() {
    if (flight.score > best) {
      best = flight.score;
      saveBest(best);
    }
  }

  function handleEvents(events) {
    if (events & EVENT_RING) playRingChime(Boolean(events & 2));
    if (events & EVENT_LANDED) playTouchdown();
    if (events & EVENT_CRASH) playCrash();
    if (events & EVENT_FUEL_LOW) playBeep();
    if (events & EVENT_COMPLETE) {
      bankBest();
      screen = SCREEN_COMPLETE;
      announce(`Mission complete! Score ${flight.score}. Best ${best}.`);
    } else if (events & EVENT_CRASH) {
      bankBest();
      screen = SCREEN_CRASHED;
      announce(`Crashed. ${flight.crashReason} Score ${flight.score}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_MUTE) {
      const muted = toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startFlight(selectedMission);
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
      return;
    }
    if (screen === SCREEN_TITLE) {
      const picked = input.missionKey();
      if (picked >= 0 && picked < MISSIONS.length) selectedMission = picked;
      if (actions & ACTION_CONFIRM || click) startFlight(selectedMission);
      return;
    }
    if ((screen === SCREEN_CRASHED || screen === SCREEN_COMPLETE) && (actions & ACTION_CONFIRM || click)) {
      const picked = input.missionKey();
      startFlight(picked >= 0 ? picked : selectedMission);
    }
  }

  function step() {
    const stick = input.readStick(canvas.clientWidth, canvas.clientHeight);
    const events = stepFlight(flight, stick, STEP);
    handleEvents(events);
    setEngineSound(flight.throttle, flight.speed, flight.alt > 2);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(flight, screen, best, selectedMission, now / 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Skyline Courier. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
