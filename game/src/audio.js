// All sound is synthesised live with WebAudio: an engine hum that
// follows the throttle, wind that follows the speed, and short cues
// for rings, landings and crashes. There are no audio files.

let context = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let windSource = null;
let windGain = null;
let windFilter = null;
let muted = false;

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (engineGain) engineGain.gain.value = muted ? 0 : 0.05;
  if (windGain) windGain.gain.value = muted ? 0 : 0;
  return muted;
}

/** Start the audio graph. Call from a user gesture (starting the game). */
export function unlockAudio() {
  try {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      context = new AudioContextClass();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 35;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      engineOsc2.start();

      const length = context.sampleRate;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(context.destination);
      windSource.start();
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    // No audio on this machine: the game plays on silently.
  }
}

/** Keep the hum and wind in step with the flight, every frame. */
export function setEngineSound(throttle, speed, airborne) {
  if (!context || muted) return;
  try {
    const now = context.currentTime;
    const hum = 55 + throttle * 95 + speed * 0.35;
    engineOsc.frequency.setTargetAtTime(hum, now, 0.08);
    engineOsc2.frequency.setTargetAtTime(hum / 2, now, 0.08);
    engineGain.gain.setTargetAtTime(airborne ? 0.045 + throttle * 0.05 : 0.03 + throttle * 0.03, now, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.09, (speed / 96) * 0.11), now, 0.15);
    windFilter.frequency.setTargetAtTime(320 + speed * 9, now, 0.15);
  } catch {
    // A hiccup in the graph must never stop the game.
  }
}

function tone(frequency, seconds, type, volume, when = 0) {
  if (!context || muted) return;
  try {
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  } catch {
    // Ignore audio failures.
  }
}

/** Two bright notes when a ring is flown through. */
export function playRingChime(centre) {
  tone(880, 0.35, 'sine', 0.16);
  tone(1318, 0.45, 'sine', 0.12, 0.07);
  if (centre) tone(1760, 0.5, 'sine', 0.1, 0.14);
}

/** A soft thump for a good touchdown. */
export function playTouchdown() {
  tone(90, 0.3, 'sine', 0.3);
  tone(660, 0.25, 'sine', 0.1, 0.05);
}

/** A low crunch for a crash. */
export function playCrash() {
  tone(55, 0.7, 'sawtooth', 0.25);
  tone(38, 0.9, 'sine', 0.3, 0.05);
}

/** A short click for starting and for the low-fuel warning. */
export function playBeep() {
  tone(520, 0.16, 'square', 0.07);
  tone(520, 0.16, 'square', 0.07, 0.22);
}
