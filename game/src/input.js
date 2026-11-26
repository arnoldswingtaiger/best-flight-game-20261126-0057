// Keyboard and mouse: arrows or WASD fly the plane, Shift and Ctrl
// work the throttle, the mouse steers when it moves, and the wheel
// trims the throttle. Clicks, Enter, P and R are read as actions.

export const ACTION_NONE = 0;
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = ACTION_NONE;
  let click = null;
  let wheel = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseMovedAt = 0;
  let mouseActive = false;

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseMovedAt = performance.now();
    mouseActive = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    const rect = canvas.getBoundingClientRect();
    click = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    mouseX = click.x;
    mouseY = click.y;
    mouseActive = true;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    wheel += event.deltaY < 0 ? 0.06 : -0.06;
  }, { passive: false });

  const held = (...codes) => codes.some((c) => keys.has(c));

  return {
    /** Stick deflection from keys, or from the mouse when it is the fresher input. */
    readStick(width, height) {
      let pitch = 0;
      let bank = 0;
      if (held('ArrowUp', 'KeyW')) pitch += 1;
      if (held('ArrowDown', 'KeyS')) pitch -= 1;
      if (held('ArrowLeft', 'KeyA')) bank -= 1;
      if (held('ArrowRight', 'KeyD')) bank += 1;
      const keysUsed = pitch !== 0 || bank !== 0;
      if (!keysUsed && mouseActive && performance.now() - mouseMovedAt < 2500) {
        bank = Math.max(-1, Math.min(1, (mouseX - width / 2) / (width * 0.32)));
        pitch = Math.max(-1, Math.min(1, -(mouseY - height / 2) / (height * 0.32)));
        // A centred mouse means hands off: only steer past a dead zone.
        if (Math.abs(bank) < 0.08) bank = 0;
        if (Math.abs(pitch) < 0.08) pitch = 0;
      }
      let throttleDelta = 0;
      if (held('ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd')) throttleDelta += 1;
      if (held('ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract')) throttleDelta -= 1;
      const wheelDelta = wheel;
      wheel = 0;
      return { pitch, bank, throttleDelta, wheel: wheelDelta };
    },
    takeActions() {
      const taken = actions;
      actions = ACTION_NONE;
      return taken;
    },
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    missionKey() {
      if (keys.has('Digit1')) return 0;
      if (keys.has('Digit2')) return 1;
      if (keys.has('Digit3')) return 2;
      return -1;
    },
    codeOf,
  };
}
