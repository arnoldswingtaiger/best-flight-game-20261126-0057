// Everything the eye sees: sky, a distant ridge, a projected ground
// mesh of the valley, the glowing rings, the courier plane from
// behind, the lit instruments, the HUD and the title, pause, crash
// and mission-complete screens.
//
// The ground is a mesh of quads in front of the plane, projected with
// a small pinhole camera that sits behind and above the aircraft.

import { MISSIONS, RUNWAY } from './config.js';
import { fieldShade, groundHeightAt, landKindAt, makeClouds } from './terrain.js';
import { nextRing, scoreBreakdown } from './plane.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_COMPLETE = 'complete';

const FIELD_COLOURS = ['#86b04a', '#9cbf57', '#b5c25a', '#6da344', '#c9b968', '#7fb069'];
const GRID_ROWS = 31;
const GRID_COLS = 21;
const GRID_STEP = 45;
const GRID_LATERAL = 42;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function shade(hex, factor) {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `rgb(${r},${g},${b})`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function compassLabel(degrees) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(degrees / 22.5) % 16];
}

function groundColour(kind, x, z, height) {
  switch (kind) {
    case 'water': return '#3f8fd2';
    case 'sand': return '#d9c48f';
    case 'runway': {
      if (Math.abs(x - RUNWAY.x) < 1.4 && Math.floor(z / 40) % 2 === 0) return '#e8e8e8';
      if (Math.abs(x - RUNWAY.x) > 12.5) return '#e8e8e8';
      return '#3a3f46';
    }
    case 'road':
      if ((Math.abs(x + 200) < 1 || Math.abs(z - 1200) < 1) && Math.floor((Math.abs(x + 200) < 1 ? z : x) / 24) % 2 === 0) return '#e8e8e8';
      return '#6b6f75';
    case 'town': return '#b09a7a';
    case 'forest': return '#2f6b2f';
    case 'rock': return shade('#8a7f74', 0.9 + clamp(height / 400, 0, 0.25));
    case 'field': return FIELD_COLOURS[Math.floor(fieldShade(x, z) * FIELD_COLOURS.length) % FIELD_COLOURS.length];
    default: return '#7fb069';
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const clouds = makeClouds(26);
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cameraFor(flight) {
    const h = flight.heading;
    const p = flight.pitch;
    const plane = { x: flight.x, y: flight.alt, z: flight.z };
    const fwd = { x: Math.sin(h) * Math.cos(p), y: Math.sin(p), z: Math.cos(h) * Math.cos(p) };
    const eye = {
      x: plane.x - fwd.x * 20,
      y: Math.max(plane.y - fwd.y * 20 + 6.5, groundHeightAt(plane.x - fwd.x * 20, plane.z - fwd.z * 20) + 3),
      z: plane.z - fwd.z * 20,
    };
    const target = { x: plane.x + fwd.x * 90, y: plane.y + fwd.y * 90, z: plane.z + fwd.z * 90 };
    const forward = normalise({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
    const right = normalise(cross(forward, { x: 0, y: 1, z: 0 }));
    const up = cross(right, forward);
    return { eye, forward, right, up, focal: height * 1.05, cx: width / 2, cy: height * 0.44 };
  }

  function normalise(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function project(camera, point) {
    const vx = point.x - camera.eye.x;
    const vy = point.y - camera.eye.y;
    const vz = point.z - camera.eye.z;
    const depth = vx * camera.forward.x + vy * camera.forward.y + vz * camera.forward.z;
    if (depth < 2) return null;
    const across = vx * camera.right.x + vy * camera.right.y + vz * camera.right.z;
    const up = vx * camera.up.x + vy * camera.up.y + vz * camera.up.z;
    return {
      x: camera.cx + (camera.focal * across) / depth,
      y: camera.cy - (camera.focal * up) / depth,
      depth,
    };
  }

  function drawSky(flight, now) {
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.62);
    sky.addColorStop(0, '#4f8fd0');
    sky.addColorStop(0.55, '#8fc3e8');
    sky.addColorStop(1, '#d8ecf7');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    // Morning sun, fixed in the east, drifting a touch with the heading.
    const sunX = width * 0.8 - Math.sin(flight.heading) * 40;
    const sunY = height * 0.13;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,226,140,0.55)');
    glow.addColorStop(1, 'rgba(255,226,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 95, sunY - 95, 190, 190);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();
    void now;
  }

  function drawRidge(flight, camera) {
    ctx.beginPath();
    ctx.moveTo(-4, height * 0.62);
    let started = false;
    for (let k = 0; k <= 48; k += 1) {
      const bearing = flight.heading - 0.85 + (k * 1.7) / 48;
      const px = flight.x + Math.sin(bearing) * 1500;
      const pz = flight.z + Math.cos(bearing) * 1500;
      const py = groundHeightAt(px, pz) + 26;
      const p = project(camera, { x: px, y: py, z: pz });
      if (!p) continue;
      const sx = -4 + ((k / 48) * (width + 8));
      if (!started) {
        ctx.lineTo(sx, p.y);
        started = true;
      } else {
        ctx.lineTo(sx, p.y);
      }
    }
    ctx.lineTo(width + 4, height * 0.62);
    ctx.closePath();
    const ridge = ctx.createLinearGradient(0, height * 0.2, 0, height * 0.62);
    ridge.addColorStop(0, '#7d9bb5');
    ridge.addColorStop(1, '#a9bed2');
    ctx.fillStyle = ridge;
    ctx.fill();
  }

  function drawClouds(camera) {
    for (const cloud of clouds) {
      const p = project(camera, cloud);
      if (!p || p.x < -260 || p.x > width + 260 || p.y < -80 || p.y > height * 0.7) continue;
      const scale = clamp(420 / p.depth, 0.12, 1.4) * (cloud.size / 140);
      const alpha = clamp(1.15 - p.depth / 1600, 0.25, 0.9);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 95 * scale, 26 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - 55 * scale, p.y + 8 * scale, 55 * scale, 18 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + 58 * scale, p.y + 7 * scale, 60 * scale, 19 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround(flight, camera) {
    const fwdX = Math.sin(flight.heading);
    const fwdZ = Math.cos(flight.heading);
    const rightX = Math.cos(flight.heading);
    const rightZ = -Math.sin(flight.heading);
    // Project every lattice point once, then paint the quads far to near.
    const points = [];
    for (let i = 0; i < GRID_ROWS; i += 1) {
      const row = [];
      const dist = i * GRID_STEP;
      for (let j = 0; j < GRID_COLS; j += 1) {
        const lateral = (j - (GRID_COLS - 1) / 2) * GRID_LATERAL;
        const wx = flight.x + fwdX * dist + rightX * lateral;
        const wz = flight.z + fwdZ * dist + rightZ * lateral;
        const wy = groundHeightAt(wx, wz);
        row.push({ projected: project(camera, { x: wx, y: wy, z: wz }), x: wx, z: wz, y: wy });
      }
      points.push(row);
    }
    for (let i = GRID_ROWS - 2; i >= 0; i -= 1) {
      for (let j = 0; j < GRID_COLS - 1; j += 1) {
        const a = points[i][j];
        const b = points[i][j + 1];
        const c = points[i + 1][j + 1];
        const d = points[i + 1][j];
        if (!a.projected || !b.projected || !c.projected || !d.projected) continue;
        const minX = Math.min(a.projected.x, b.projected.x, c.projected.x, d.projected.x);
        const maxX = Math.max(a.projected.x, b.projected.x, c.projected.x, d.projected.x);
        const minY = Math.min(a.projected.y, b.projected.y, c.projected.y, d.projected.y);
        const maxY = Math.max(a.projected.y, b.projected.y, c.projected.y, d.projected.y);
        if (maxX < -60 || minX > width + 60 || maxY < -60 || minY > height + 60) continue;
        const midX = (a.x + c.x) / 2;
        const midZ = (a.z + c.z) / 2;
        const kind = landKindAt(midX, midZ);
        ctx.fillStyle = groundColour(kind, midX, midZ, (a.y + c.y) / 2);
        ctx.beginPath();
        ctx.moveTo(a.projected.x, a.projected.y);
        ctx.lineTo(b.projected.x, b.projected.y);
        ctx.lineTo(c.projected.x, c.projected.y);
        ctx.lineTo(d.projected.x, d.projected.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRings(flight, camera, now) {
    const rings = flight.mission.rings;
    for (let index = rings.length - 1; index >= 0; index -= 1) {
      if (flight.ringStates[index].passed) continue;
      const ring = rings[index];
      const isNext = index === flight.ringsPassed;
      const centre = { x: ring.x, y: ring.alt, z: ring.z };
      const depthPoint = project(camera, centre);
      if (!depthPoint) continue;
      const prev = index === 0
        ? { x: RUNWAY.x, y: 120, z: 300 }
        : { x: rings[index - 1].x, y: rings[index - 1].alt, z: rings[index - 1].z };
      let normal = normalise({ x: ring.x - prev.x, y: ring.alt - prev.y, z: ring.z - prev.z });
      const helper = Math.abs(normal.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const axisA = normalise(cross(normal, helper));
      const axisB = cross(normal, axisA);
      const pulse = isNext ? 1 + 0.08 * Math.sin(now * 4) : 1;
      const radius = 20 * pulse;
      ctx.beginPath();
      let first = null;
      for (let s = 0; s <= 28; s += 1) {
        const angle = (s / 28) * Math.PI * 2;
        const px = centre.x + (axisA.x * Math.cos(angle) + axisB.x * Math.sin(angle)) * radius;
        const py = centre.y + (axisA.y * Math.cos(angle) + axisB.y * Math.sin(angle)) * radius;
        const pz = centre.z + (axisA.z * Math.cos(angle) + axisB.z * Math.sin(angle)) * radius;
        const p = project(camera, { x: px, y: py, z: pz });
        if (!p) continue;
        if (!first) {
          first = p;
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      const lineWidth = clamp(420 / depthPoint.depth, 2, 9);
      ctx.save();
      ctx.shadowColor = isNext ? '#ffb020' : '#ffd27a';
      ctx.shadowBlur = isNext ? 16 : 6;
      ctx.strokeStyle = isNext ? '#ffb020' : 'rgba(255,178,32,0.55)';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.restore();
      if (isNext) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.max(13, clamp(300 / depthPoint.depth, 13, 22))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const dist = Math.round(Math.hypot(flight.x - ring.x, flight.alt - ring.alt, flight.z - ring.z));
        const labelY = clamp(depthPoint.y - radius * (camera.focal / depthPoint.depth) * 0.55 - 14, 112, height - 140);
        ctx.fillText(`${dist} m`, depthPoint.x, labelY);
      }
    }
  }

  function drawPlaneShadow(flight, camera) {
    const ground = groundHeightAt(flight.x, flight.z);
    if (flight.alt - ground < 1) return;
    const p = project(camera, { x: flight.x, y: ground + 0.6, z: flight.z });
    if (!p) return;
    const size = clamp(900 / p.depth, 8, 60);
    ctx.fillStyle = 'rgba(10,20,30,0.28)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlane(flight, now, screen) {
    const cx = width / 2;
    // On the title screen the plane sits below the title panel, in the
    // open strip above the instruments, so it stays in frame.
    const cy = (screen === SCREEN_TITLE ? height * 0.75 : height * 0.60) - flight.pitch * 70;
    const scale = clamp(1 - flight.pitch * 0.15, 0.9, 1.1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(flight.bank * 0.85);
    ctx.scale(scale, scale);
    // Wings, seen from behind: broad, with teal tips and nav lights.
    ctx.fillStyle = '#e8ddc0';
    ctx.beginPath();
    ctx.moveTo(-88, -6);
    ctx.quadraticCurveTo(-88, 10, -70, 12);
    ctx.lineTo(70, 12);
    ctx.quadraticCurveTo(88, 10, 88, -6);
    ctx.lineTo(30, -14);
    ctx.lineTo(-30, -14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1f7a6d';
    ctx.fillRect(-88, -6, 16, 14);
    ctx.fillRect(72, -6, 16, 14);
    // Fuselage, tail near and nose far: a tapered body with a teal stripe.
    ctx.fillStyle = '#f2ead8';
    ctx.beginPath();
    ctx.moveTo(-20, 34);
    ctx.quadraticCurveTo(-24, -18, -9, -52);
    ctx.lineTo(9, -52);
    ctx.quadraticCurveTo(24, -18, 20, 34);
    ctx.quadraticCurveTo(0, 42, -20, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1f7a6d';
    ctx.beginPath();
    ctx.moveTo(-22, 6);
    ctx.lineTo(22, 6);
    ctx.lineTo(20, 16);
    ctx.lineTo(-20, 16);
    ctx.closePath();
    ctx.fill();
    // Tail fin and tailplane.
    ctx.fillStyle = '#1f7a6d';
    ctx.beginPath();
    ctx.moveTo(-8, 30);
    ctx.lineTo(-7, -2);
    ctx.lineTo(0, -14);
    ctx.lineTo(7, -2);
    ctx.lineTo(8, 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8ddc0';
    ctx.fillRect(-34, 26, 68, 8);
    // Cockpit glass glint and tail number.
    ctx.fillStyle = '#9fd4e8';
    ctx.beginPath();
    ctx.ellipse(0, -38, 7, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#274b5f';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SK-7', 0, 30);
    // Nav lights blink once a second.
    if (Math.floor(now * 2) % 2 === 0) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(-88, 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#34d17b';
      ctx.beginPath();
      ctx.arc(88, 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDial(cx, cy, radius, label, valueText) {
    ctx.fillStyle = '#101820';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8c98a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + radius + 13);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(valueText, cx, cy + radius - 6);
  }

  function drawNeedle(cx, cy, radius, angle, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(angle) * (radius - 6), cy - Math.cos(angle) * (radius - 6));
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawInstruments(flight) {
    const panelTop = height - 118;
    ctx.fillStyle = 'rgba(8,16,26,0.88)';
    ctx.fillRect(0, panelTop, width, 118);
    ctx.fillStyle = '#d8c98a';
    ctx.fillRect(0, panelTop, width, 2);

    // Artificial horizon: sky above, ground below, rolled by the bank.
    const hx = 72;
    const hy = panelTop + 56;
    const hr = 42;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-flight.bank);
    ctx.translate(0, flight.pitch * 90);
    ctx.fillStyle = '#5aa3d8';
    ctx.fillRect(-hr - 2, -hr - 2, (hr + 2) * 2, hr + 2);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-hr - 2, 0, (hr + 2) * 2, hr + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-hr - 2, -1, (hr + 2) * 2, 2);
    ctx.restore();
    ctx.strokeStyle = '#d8c98a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed aircraft symbol over the horizon.
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy);
    ctx.lineTo(hx - 5, hy);
    ctx.moveTo(hx + 5, hy);
    ctx.lineTo(hx + 18, hy);
    ctx.moveTo(hx, hy - 4);
    ctx.lineTo(hx, hy + 4);
    ctx.stroke();
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HORIZON', hx, hy + hr + 13);

    // Altimeter and airspeed dials.
    const altFt = Math.round(flight.alt * 3.281);
    const altX = 178;
    const altY = panelTop + 52;
    drawDial(altX, altY, 38, 'ALTITUDE', `${altFt} FT`);
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      ctx.strokeStyle = '#cfe3ef';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(altX + Math.sin(a) * 30, altY - Math.cos(a) * 30);
      ctx.lineTo(altX + Math.sin(a) * 36, altY - Math.cos(a) * 36);
      ctx.stroke();
    }
    drawNeedle(altX, altY, 38, ((altFt % 1000) / 1000) * Math.PI * 2, '#ffd94a');

    const spdKt = Math.round(flight.speed * 1.944);
    const spdX = 272;
    const spdY = panelTop + 52;
    drawDial(spdX, spdY, 38, 'AIRSPEED', `${spdKt} KT`);
    for (let k = 0; k <= 8; k += 1) {
      const a = -Math.PI * 0.75 + (k / 8) * Math.PI * 1.5;
      ctx.strokeStyle = '#cfe3ef';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(spdX + Math.sin(a) * 30, spdY - Math.cos(a) * 30);
      ctx.lineTo(spdX + Math.sin(a) * 36, spdY - Math.cos(a) * 36);
      ctx.stroke();
    }
    drawNeedle(spdX, spdY, 38, -Math.PI * 0.75 + clamp(spdKt / 200, 0, 1) * Math.PI * 1.5, '#7ee787');

    // Compass tape across the middle of the panel.
    const tapeX = 340;
    const tapeW = Math.max(220, width - 700);
    const tapeY = panelTop + 52;
    const headingDeg = ((flight.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.save();
    ctx.beginPath();
    ctx.rect(tapeX, tapeY - 34, tapeW, 68);
    ctx.clip();
    ctx.fillStyle = '#101820';
    ctx.fillRect(tapeX, tapeY - 34, tapeW, 68);
    for (let offset = -90; offset <= 90; offset += 15) {
      const deg = Math.round((headingDeg + offset) / 15) * 15;
      const norm = ((deg % 360) + 360) % 360;
      const dx = ((norm - headingDeg + 540) % 360) - 180;
      const sx = tapeX + tapeW / 2 + (dx / 90) * (tapeW / 2);
      if (sx < tapeX - 10 || sx > tapeX + tapeW + 10) continue;
      const major = norm % 45 === 0;
      ctx.strokeStyle = '#cfe3ef';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(sx, tapeY - 26);
      ctx.lineTo(sx, tapeY - (major ? 8 : 16));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const label = norm % 90 === 0 ? compassLabel(norm) : String(norm).padStart(3, '0');
        ctx.fillText(label, sx, tapeY + 24);
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#d8c98a';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX, tapeY - 34, tapeW, 68);
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.moveTo(tapeX + tapeW / 2, tapeY - 34);
    ctx.lineTo(tapeX + tapeW / 2 - 6, tapeY - 44 < panelTop ? panelTop + 2 : tapeY - 44);
    ctx.lineTo(tapeX + tapeW / 2 + 6, tapeY - 44 < panelTop ? panelTop + 2 : tapeY - 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COMPASS', tapeX + tapeW / 2, tapeY + 44);

    // Fuel, throttle and damage bars on the right.
    const bar = (x, label, fraction, colour) => {
      ctx.fillStyle = '#101820';
      ctx.fillRect(x, panelTop + 14, 18, 76);
      ctx.fillStyle = colour;
      const filled = Math.round(76 * clamp(fraction, 0, 1));
      ctx.fillRect(x, panelTop + 14 + (76 - filled), 18, filled);
      ctx.strokeStyle = '#d8c98a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, panelTop + 14, 18, 76);
      ctx.fillStyle = '#cfe3ef';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 9, panelTop + 104);
    };
    const fuelX = width - 236;
    bar(fuelX, 'FUEL', flight.fuel / 100, flight.fuel > 40 ? '#7ee787' : flight.fuel > 20 ? '#ffb020' : '#ff5a4a');
    bar(fuelX + 56, 'THR', flight.throttle, '#5aa3d8');
    bar(fuelX + 112, 'DMG', flight.damage / 100, '#ff8a5a');
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`V/S ${flight.verticalSpeed >= 0 ? '+' : ''}${flight.verticalSpeed.toFixed(1)} m/s`, fuelX + 150, panelTop + 30);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`WIND ${Math.round(Math.hypot(flight.mission.wind.x, flight.mission.wind.z) * 1.94)} kt`, fuelX + 150, panelTop + 50);
    ctx.fillText(flight.phase.toUpperCase(), fuelX + 150, panelTop + 70);
  }

  function drawHud(flight, now, screen) {
    const altFt = Math.round(flight.alt * 3.281);
    const spdKt = Math.round(flight.speed * 1.944);
    const headingDeg = Math.round(((flight.heading * 180) / Math.PI % 360 + 360) % 360);
    ctx.fillStyle = 'rgba(8,16,26,0.72)';
    ctx.fillRect(0, 0, width, 58);
    ctx.fillStyle = '#d8c98a';
    ctx.fillRect(0, 58, width, 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SKYLINE COURIER', 16, 24);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(flight.mission.name.toUpperCase(), 16, 44);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText(
      `ALT ${altFt} FT    SPD ${spdKt} KT    HDG ${String(headingDeg).padStart(3, '0')}°`,
      width / 2,
      36,
    );
    ctx.textAlign = 'right';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(`SCORE ${flight.score}`, width - 16, 24);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      `RINGS ${flight.ringsPassed}/${flight.mission.rings.length}    TIME ${formatTime(flight.time)}`,
      width - 16,
      44,
    );
    // The ring pointer and centre messages belong to flight, not the
    // title screen, where the panel would cover them anyway.
    if (screen === SCREEN_TITLE) return;
    const ring = nextRing(flight);
    if (ring && flight.phase !== 'complete' && flight.phase !== 'crashed') {
      const targetHeading = Math.atan2(ring.x - flight.x, ring.z - flight.z);
      let diff = targetHeading - flight.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const arrow = diff > 0.25 ? '▶ TURN RIGHT' : diff < -0.25 ? '◀ TURN LEFT' : '▲ STRAIGHT ON';
      const dist = Math.round(Math.hypot(ring.x - flight.x, ring.alt - flight.alt, ring.z - flight.z));
      ctx.fillStyle = 'rgba(8,16,26,0.72)';
      const label = `NEXT RING ${dist} m  ${arrow}`;
      ctx.font = '700 14px system-ui, sans-serif';
      const labelW = ctx.measureText(label).width + 28;
      ctx.fillRect(width / 2 - labelW / 2, 66, labelW, 28);
      ctx.fillStyle = '#ffd94a';
      ctx.textAlign = 'center';
      ctx.fillText(label, width / 2, 85);
    } else if (flight.ringsPassed === flight.mission.rings.length && flight.phase !== 'complete') {
      ctx.fillStyle = 'rgba(8,16,26,0.72)';
      const label = 'ALL RINGS DONE — LAND ON THE RUNWAY';
      ctx.font = '700 14px system-ui, sans-serif';
      const labelW = ctx.measureText(label).width + 28;
      ctx.fillRect(width / 2 - labelW / 2, 66, labelW, 28);
      ctx.fillStyle = '#7ee787';
      ctx.textAlign = 'center';
      ctx.fillText(label, width / 2, 85);
    }
    if (flight.messageTime > 0 && flight.message) {
      ctx.fillStyle = '#ffd94a';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(flight.message, width / 2, 140);
    }
    void now;
  }

  function dimScreen() {
    ctx.fillStyle = 'rgba(6,14,24,0.55)';
    ctx.fillRect(0, 0, width, height);
  }

  function drawPanel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,18,30,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d8c98a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawTitle(flight, best, selectedMission) {
    dimScreen();
    const panelW = Math.min(720, width - 80);
    const panelH = 430;
    const px = (width - panelW) / 2;
    const py = 64;
    drawPanel(px, py, panelW, panelH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText('SKYLINE COURIER', width / 2, py + 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('Fly the mail plane through the rings — then bring her home.', width / 2, py + 86);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('A 2D chase-view flight game. Throttle, pitch and bank — no autopilot, just you.', width / 2, py + 108);
    for (let i = 0; i < MISSIONS.length; i += 1) {
      const mission = MISSIONS[i];
      const rowY = py + 126 + i * 50;
      const selected = i === selectedMission;
      ctx.fillStyle = selected ? 'rgba(255,217,74,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(px + 24, rowY, panelW - 48, 44);
      if (selected) {
        ctx.strokeStyle = '#ffd94a';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 24, rowY, panelW - 48, 44);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${mission.name} — ${mission.rings.length} rings`, px + 40, rowY + 18);
      ctx.fillStyle = '#cfe3ef';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(mission.blurb, px + 40, rowY + 36);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↑ ↓ pitch      ← → bank      SHIFT / CTRL throttle      mouse steers too', width / 2, py + 300);
    ctx.fillText('P pause      R restart      M mute      1 / 2 / 3 choose a mission', width / 2, py + 324);
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO FLY', width / 2, py + 362);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Best score: ${best}`, width / 2, py + 388);
    ctx.fillText('Land gently on the runway, on the centreline, under 62 m/s.', width / 2, py + 412);
  }

  function drawPaused() {
    dimScreen();
    const panelW = 420;
    const panelH = 150;
    drawPanel((width - panelW) / 2, (height - panelH) / 2, panelW, panelH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px system-ui, sans-serif';
    ctx.fillText('PAUSED', width / 2, height / 2 - 8);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('P to resume    •    R to restart', width / 2, height / 2 + 28);
  }

  function drawCrashed(flight, best) {
    dimScreen();
    const panelW = 560;
    const panelH = 240;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    drawPanel(px, py, panelW, panelH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a4a';
    ctx.font = '700 36px system-ui, sans-serif';
    ctx.fillText('CRASHED', width / 2, py + 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui, sans-serif';
    const words = flight.crashReason.split(' ');
    let line = '';
    let lineY = py + 92;
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > panelW - 80 && line) {
        ctx.fillText(line.trim(), width / 2, lineY);
        lineY += 24;
        line = word;
      } else {
        line += ` ${word}`;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), width / 2, lineY);
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(`Score ${flight.score}   •   Rings ${flight.ringsPassed}/${flight.mission.rings.length}   •   Best ${best}`, width / 2, py + 168);
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('Press R to fly again', width / 2, py + 204);
  }

  function drawComplete(flight, best) {
    dimScreen();
    const parts = scoreBreakdown(flight);
    const panelW = 560;
    const panelH = 300;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    drawPanel(px, py, panelW, panelH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7ee787';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText('MISSION COMPLETE', width / 2, py + 54);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`${flight.mission.name} — ${flight.mission.rings.length} rings, safe on runway 09`, width / 2, py + 84);
    const rows = [
      ['Rings flown', `+${parts.rings}`],
      ['Dead-centre bonuses', `+${parts.centres}`],
      ['Landing', `+${parts.landing}`],
      ['Time bonus', `+${parts.time}`],
      ['TOTAL', `${parts.total}`],
    ];
    rows.forEach(([label, value], i) => {
      const rowY = py + 122 + i * 28;
      ctx.fillStyle = i === rows.length - 1 ? '#ffd94a' : '#cfe3ef';
      ctx.font = i === rows.length - 1 ? '700 18px system-ui, sans-serif' : '15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, px + 60, rowY);
      ctx.textAlign = 'right';
      ctx.fillText(value, px + panelW - 60, rowY);
    });
    ctx.fillStyle = '#cfe3ef';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Best score: ${best}    •    Time ${formatTime(flight.time)}`, width / 2, py + 262);
    ctx.fillStyle = '#ffd94a';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText('R — fly again      1 / 2 / 3 — another mission', width / 2, py + 288);
  }

  return {
    draw(flight, screen, best, selectedMission, now) {
      resize();
      const camera = cameraFor(flight);
      drawSky(flight, now);
      drawRidge(flight, camera);
      drawClouds(camera);
      drawGround(flight, camera);
      drawRings(flight, camera, now);
      drawPlaneShadow(flight, camera);
      drawPlane(flight, now, screen);
      drawHud(flight, now, screen);
      drawInstruments(flight);
      if (screen === SCREEN_TITLE) drawTitle(flight, best, selectedMission);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_CRASHED) drawCrashed(flight, best);
      else if (screen === SCREEN_COMPLETE) drawComplete(flight, best);
    },
  };
}
