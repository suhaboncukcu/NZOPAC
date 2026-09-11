/* ============================================================
   NZOPAC // GRID 64
   A neon grid-runner on a floating 8x8 circuit, seeded by a
   64-character alphanumeric string.

   Seed decoded:
     - 64 chars            -> 8x8 board (2^6)
     - 7 digits 6 4 8 4 9 9 3
       * first six as hex  -> #648499 (steel blue)  -> palette
       * trailing "3"      -> a recurring motif
       * 7 digits          -> 7 cores / 7 notes / up to 7 glitches
     - case pattern        -> the 8x8 "sigil" rendered in the HUD
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------
   0. Seed + deterministic random
------------------------------------------------------------------ */
const FALLBACK_SEED = 'NzopacbAmWFrlER6vV48ZbqKEqJEqrM4CZl9XuJ9lbyTYasTcVnHoav3BQBWMGBv';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function isValidSeed(s) { return typeof s === 'string' && /^[A-Za-z0-9]{16,128}$/.test(s); }

function readSeed() {
  const q = new URLSearchParams(location.search).get('seed');
  return isValidSeed(q) ? q : FALLBACK_SEED;
}

let SEED = readSeed();

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh deterministic RNG for the current seed. `salt` gives independent streams. */
function rngFor(salt = '') {
  return mulberry32(xmur3(SEED + '::' + salt)());
}

const rnd = Math.random; // used only for purely cosmetic effects

/* ------------------------------------------------------------------
   1. Palette — derived from the seed's digits
------------------------------------------------------------------ */
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** target += color * s  (three's Color has no addScaledVector) */
function addScaled(target, color, s) {
  target.r += color.r * s;
  target.g += color.g * s;
  target.b += color.b * s;
  return target;
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16) || 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function rgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb({ h, s, l }) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue2rgb(p, q, h + 1 / 3), g: hue2rgb(p, q, h), b: hue2rgb(p, q, h - 1 / 3) };
}

const rgbToHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');

function buildPalette(seed) {
  const digits = (seed.match(/\d/g) || []).join('').padEnd(6, '6');
  const baseHex = '#' + digits.slice(0, 6);
  const { h: H, s: S } = rgbToHsl(hexToRgb(baseHex));
  const Hc = (d) => ((H + d) % 1 + 1) % 1;

  return {
    base: baseHex,
    hue: H,
    primary: rgbToHex(hslToRgb({ h: H, s: Math.max(0.72, S), l: 0.6 })),
    primarySoft: rgbToHex(hslToRgb({ h: H, s: Math.max(0.5, S), l: 0.34 })),
    collect: rgbToHex(hslToRgb({ h: Hc(0.5), s: 0.92, l: 0.62 })),
    danger: rgbToHex(hslToRgb({ h: Hc(1 / 3), s: 0.8, l: 0.6 })),
    bg: rgbToHex(hslToRgb({ h: H, s: 0.42, l: 0.045 })),
    tileA: rgbToHex(hslToRgb({ h: H, s: 0.38, l: 0.078 })),
    tileB: rgbToHex(hslToRgb({ h: H, s: 0.32, l: 0.052 })),
    ink: rgbToHex(hslToRgb({ h: H, s: 0.3, l: 0.93 })),
    dim: rgbToHex(hslToRgb({ h: H, s: 0.24, l: 0.54 })),
  };
}

const P = buildPalette(SEED);
const C = {
  primary: new THREE.Color(P.primary),
  primarySoft: new THREE.Color(P.primarySoft),
  collect: new THREE.Color(P.collect),
  danger: new THREE.Color(P.danger),
  bg: new THREE.Color(P.bg),
  tileA: new THREE.Color(P.tileA),
  tileB: new THREE.Color(P.tileB),
  ink: new THREE.Color(P.ink),
  dim: new THREE.Color(P.dim),
};

function injectCssVars() {
  const r = document.documentElement.style;
  r.setProperty('--c-primary', P.primary);
  r.setProperty('--c-accent', P.collect);
  r.setProperty('--c-danger', P.danger);
  r.setProperty('--c-bg', P.bg);
  r.setProperty('--c-ink', P.ink);
  r.setProperty('--c-dim', P.dim);
}
injectCssVars();

/* ------------------------------------------------------------------
   2. Constants
------------------------------------------------------------------ */
const N = 8;                 // board is N x N = 64 cells
const HALF = (N - 1) / 2;    // 3.5
const TILE = 1;
const PLAYER_DUR = 0.115;    // seconds per tile step
const MAX_ENEMIES = 7;       // the seed's motif

const DIGITS = (SEED.match(/\d/g) || []).map(Number); // e.g. [6,4,8,4,9,9,3]
const CORE_DIGITS = (DIGITS.length >= 3 ? DIGITS : [6, 4, 8, 4, 9, 9, 3]).slice(0, 8);

/** Cap resolution on small screens — bloom is fill-rate hungry. */
const dprCap = () => Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.6 : 2);

const gridToWorld = (gx, gz) => new THREE.Vector3(gx - HALF, 0, gz - HALF);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

/* ------------------------------------------------------------------
   3. DOM
------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const app = $('app');
const el = {
  score: $('score'), best: $('best'), level: $('level'), lives: $('lives'),
  cores: $('cores'), combo: $('combo'), seedText: $('seedText'),
  finalScore: $('finalScore'), finalLevel: $('finalLevel'), finalBest: $('finalBest'),
  startOverlay: $('startOverlay'), overOverlay: $('overOverlay'),
  seedText2: $('seedText2'), seedText3: $('seedText3'),
  banner: $('banner'), toast: $('toast'),
  muteBtn: $('muteBtn'), seedBtn: $('seedBtn'), pauseBtn: $('pauseBtn'),
  seedBtn2: $('seedBtn2'), seedBtn3: $('seedBtn3'), muteBtn2: $('muteBtn2'),
};

/* Render the seed itself as an 8x8 sigil: uppercase = lit, lowercase = dim, digit = amber. */
function paintSigil(host, seed) {
  host.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const ch of seed.slice(0, 64)) {
    const i = document.createElement('i');
    i.className = /[0-9]/.test(ch) ? 'c-digit' : /[A-Z]/.test(ch) ? 'c-up' : 'c-low';
    frag.appendChild(i);
  }
  host.appendChild(frag);
}
paintSigil($('logoGrid'), SEED);
paintSigil($('logoGridLg'), SEED);
el.seedText.textContent = SEED;
el.seedText2.textContent = SEED;
el.seedText3.textContent = SEED;

/* ------------------------------------------------------------------
   4. Audio — small procedural synth (the 7 digits become 7 notes)
------------------------------------------------------------------ */
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19]; // minor pentatonic semitones
let audioCtx = null, master = null, muted = false;

function initAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  master = audioCtx.createGain();
  master.gain.value = 0.5;
  master.connect(audioCtx.destination);
}

function noteFreq(n) {
  return 196 * Math.pow(2, PENTA[((n % PENTA.length) + PENTA.length) % PENTA.length] / 12);
}

function tone(freq, dur = 0.2, type = 'triangle', vol = 0.22, slide = 0) {
  if (muted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur = 0.25, vol = 0.25) {
  if (muted) return;
  initAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = vol;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1400;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/* ------------------------------------------------------------------
   5. Renderer / scene / camera / post
------------------------------------------------------------------ */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(dprCap());
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = C.bg.clone();
scene.fog = new THREE.FogExp2(C.bg.clone(), 0.021);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 300);
const CAM_BASE = new THREE.Vector3(0, 11.6, 9.6);
camera.position.copy(CAM_BASE);
camera.lookAt(0, 0.2, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength
  0.5,  // radius
  0.34  // threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* lights */
scene.add(new THREE.AmbientLight(0x223344, 0.7));
const keyLight = new THREE.DirectionalLight(0xbcd8ff, 0.4);
keyLight.position.set(4, 12, 6);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(C.primary.getHex(), 0.35);
rimLight.position.set(-8, 5, -7);
scene.add(rimLight);

/* ------------------------------------------------------------------
   6. Shared art helpers
------------------------------------------------------------------ */
function glowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW_TEX = glowTexture();

function makeGlow(color, scale, opacity = 0.85) {
  const m = new THREE.SpriteMaterial({
    map: GLOW_TEX, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(scale, scale, 1);
  return s;
}

const digitTexCache = new Map();
function digitTexture(d) {
  if (digitTexCache.has(d)) return digitTexCache.get(d);
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  // dark token face so the numeral stays legible over the glowing gem
  x.beginPath();
  x.arc(s / 2, s / 2, 50, 0, Math.PI * 2);
  x.fillStyle = 'rgba(5, 9, 14, 0.86)';
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = P.collect;
  x.shadowColor = P.collect;
  x.shadowBlur = 16;
  x.stroke();
  // numeral
  x.font = '700 70px "Chakra Petch", ui-monospace, monospace';
  x.shadowColor = P.collect;
  x.shadowBlur = 22;
  x.fillStyle = P.collect;
  x.fillText(String(d), s / 2, s / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  digitTexCache.set(d, t);
  return t;
}

/* ------------------------------------------------------------------
   7. World: board, grid, void
------------------------------------------------------------------ */
const world = new THREE.Group();
scene.add(world);

const tileGeo = new THREE.BoxGeometry(TILE * 0.92, 0.09, TILE * 0.92);
const tiles = [];
const tileGroup = new THREE.Group();
world.add(tileGroup);

for (let gz = 0; gz < N; gz++) {
  for (let gx = 0; gx < N; gx++) {
    const checker = (gx + gz) % 2 === 0;
    const mat = new THREE.MeshStandardMaterial({
      color: (checker ? C.tileA : C.tileB).clone(),
      emissive: C.primary.clone().multiplyScalar(0.04),
      roughness: 0.62,
      metalness: 0.34,
      emissiveIntensity: 1,
    });
    const m = new THREE.Mesh(tileGeo, mat);
    const p = gridToWorld(gx, gz);
    m.position.set(p.x, 0, p.z);
    tileGroup.add(m);
    tiles.push({ gx, gz, mesh: m, mat, heat: 0, hazard: 0, checker });
  }
}

/* grid lines */
(function buildGridLines() {
  const pts = [];
  const h = N / 2;
  for (let i = 0; i <= N; i++) {
    const p = i - h;
    pts.push(p, 0, -h, p, 0, h);
    pts.push(-h, 0, p, h, 0, p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: C.primary, transparent: true, opacity: 0.34 });
  const lines = new THREE.LineSegments(g, lineMat);
  lines.position.y = 0.075;
  world.add(lines);

  // brighter outer frame
  const b = N / 2;
  const bp = [
    -b, 0, -b, b, 0, -b, b, 0, -b, b, 0, b,
    b, 0, b, -b, 0, b, -b, 0, b, -b, 0, -b,
  ];
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  const frame = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({
    color: C.primary, transparent: true, opacity: 0.85,
  }));
  frame.position.y = 0.075;
  world.add(frame);
})();

/* under-plate + pedestal for depth */
(function buildBase() {
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(N + 0.7, 0.5, N + 0.7),
    new THREE.MeshStandardMaterial({ color: C.bg.clone().multiplyScalar(1.6), roughness: 0.5, metalness: 0.6 })
  );
  plate.position.y = -0.36;
  world.add(plate);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(plate.geometry),
    new THREE.LineBasicMaterial({ color: C.primary, transparent: true, opacity: 0.5 })
  );
  edge.position.copy(plate.position);
  world.add(edge);
})();

/* starfield / void dust */
const voidPoints = (function buildVoid() {
  const rng = rngFor('void');
  const count = 1300;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 22 + rng() * 58;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.55 + 4;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: C.primary, size: 0.14, sizeAttenuation: true,
    transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const p = new THREE.Points(g, m);
  scene.add(p);
  return p;
})();

/* ------------------------------------------------------------------
   8. Particles (single additive Points pool)
------------------------------------------------------------------ */
const PARTICLE_MAX = 900;
const particles = (function buildParticles() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PARTICLE_MAX * 3);
  const col = new Float32Array(PARTICLE_MAX * 3);
  const size = new Float32Array(PARTICLE_MAX);
  const alpha = new Float32Array(PARTICLE_MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uScale: { value: 10 } },
    vertexShader: `
      uniform float uScale;
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / max(0.001, -mv.z), 1.0, 72.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * vAlpha);
      }`,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const vel = new Float32Array(PARTICLE_MAX * 3);
  const life = new Float32Array(PARTICLE_MAX);
  const maxLife = new Float32Array(PARTICLE_MAX);
  let cursor = 0;

  function spawn(p, color, count, speed, sizePx, lifeSec = 0.75, spread = 0.25) {
    for (let i = 0; i < count; i++) {
      const k = cursor;
      cursor = (cursor + 1) % PARTICLE_MAX;
      // random direction on a sphere, flattened a touch
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      const sp = speed * (0.35 + rnd() * 0.85);
      pos[k * 3] = p.x + (rnd() - 0.5) * spread;
      pos[k * 3 + 1] = p.y + (rnd() - 0.5) * spread;
      pos[k * 3 + 2] = p.z + (rnd() - 0.5) * spread;
      vel[k * 3] = Math.sin(ph) * Math.cos(th) * sp;
      vel[k * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.9 + 0.6;
      vel[k * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      col[k * 3] = color.r;
      col[k * 3 + 1] = color.g;
      col[k * 3 + 2] = color.b;
      size[k] = sizePx * (0.6 + rnd() * 0.9);
      maxLife[k] = lifeSec * (0.6 + rnd() * 0.8);
      life[k] = maxLife[k];
      alpha[k] = 1;
    }
  }

  function update(dt) {
    let active = false;
    for (let i = 0; i < PARTICLE_MAX; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; active = true; } continue; }
      active = true;
      life[i] -= dt;
      const nx = pos[i * 3] + vel[i * 3] * dt;
      const ny = pos[i * 3 + 1] + vel[i * 3 + 1] * dt;
      const nz = pos[i * 3 + 2] + vel[i * 3 + 2] * dt;
      pos[i * 3] = nx;
      pos[i * 3 + 1] = Math.max(0.05, ny);
      pos[i * 3 + 2] = nz;
      vel[i * 3 + 1] -= 3.2 * dt;
      vel[i * 3] *= 1 - 1.6 * dt;
      vel[i * 3 + 2] *= 1 - 1.6 * dt;
      const lf = Math.max(0, life[i] / maxLife[i]);
      alpha[i] = lf * lf;
    }
    if (active) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    }
  }

  /** Keep point sprites resolution-independent: px = worldSize * (bufferH / (2*tan(fov/2))) / dist */
  function setHeight(cssHeight) {
    mat.uniforms.uScale.value = 0.01124 * cssHeight * dprCap();
  }

  setHeight(window.innerHeight);
  return { spawn, update, setHeight };
})();

/* ------------------------------------------------------------------
   9. Player
------------------------------------------------------------------ */
const player = {
  gx: 3, gz: 4,
  fromG: new THREE.Vector3(3, 0, 4),
  toG: new THREE.Vector3(3, 0, 4),
  t: 1, moving: false,
  dur: PLAYER_DUR,
  dir: new THREE.Vector3(1, 0, 0),
  invuln: 0,
  group: new THREE.Group(),
  core: null,
  inner: null,
  glow: null,
  ring: null,
  shield: null,
  light: null,
};

(function buildPlayer() {
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32, 0),
    new THREE.MeshStandardMaterial({
      color: 0x0a1622, emissive: C.primary, emissiveIntensity: 1.5,
      roughness: 0.2, metalness: 0.7,
    })
  );
  core.position.y = 0.46;
  player.core = core;
  player.group.add(core);

  const inner = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  inner.position.y = 0.46;
  player.inner = inner;
  player.group.add(inner);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(core.geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, toneMapped: false })
  );
  edges.position.copy(core.position);
  player.group.add(edges);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.022, 8, 40),
    new THREE.MeshBasicMaterial({ color: C.primary, transparent: true, opacity: 0.9, toneMapped: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.09;
  player.ring = ring;
  player.group.add(ring);

  const glow = makeGlow(C.primary, 1.5, 0.62);
  glow.position.y = 0.46;
  player.glow = glow;
  player.group.add(glow);

  const shield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.48, 1),
    new THREE.MeshBasicMaterial({
      color: C.primary, wireframe: true, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  shield.position.y = 0.46;
  shield.visible = false;
  player.shield = shield;
  player.group.add(shield);

  const light = new THREE.PointLight(C.primary.getHex(), 4, 7, 2);
  light.position.y = 0.7;
  player.light = light;
  player.group.add(light);

  const p = gridToWorld(player.gx, player.gz);
  player.group.position.copy(p);
  world.add(player.group);
})();

/* ------------------------------------------------------------------
   10. Cores
------------------------------------------------------------------ */
const cores = [];
const coreGroup = new THREE.Group();
world.add(coreGroup);

function freeTiles(exclude, minPlayerDist) {
  const out = [];
  const taken = new Set(exclude.map((c) => c.gx + ',' + c.gz));
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      if (taken.has(gx + ',' + gz)) continue;
      if (Math.hypot(gx - player.gx, gz - player.gz) < minPlayerDist) continue;
      out.push({ gx, gz });
    }
  }
  return out;
}

function spawnCores() {
  for (const c of cores) coreGroup.remove(c.group);
  cores.length = 0;

  const rng = rngFor('cores:' + level);
  const exclude = [{ gx: player.gx, gz: player.gz }, ...enemies];
  const pool = freeTiles(exclude, 2);
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  if (pool.length === 0) return;
  const n = Math.min(CORE_DIGITS.length, pool.length);
  for (let i = 0; i < n; i++) {
    const cell = pool[i];
    const digit = CORE_DIGITS[i];

    const group = new THREE.Group();
    const pos = gridToWorld(cell.gx, cell.gz);
    group.position.copy(pos);

    const gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 0),
      new THREE.MeshStandardMaterial({
        color: 0x100a02, emissive: C.collect, emissiveIntensity: 1.3,
        roughness: 0.25, metalness: 0.6,
      })
    );
    gem.position.y = 0.5;
    group.add(gem);

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(gem.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false })
    );
    wire.position.copy(gem.position);
    group.add(wire);

    const digitPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.72),
      new THREE.MeshBasicMaterial({
        map: digitTexture(digit), color: 0xffffff, transparent: true,
        depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.96,
        side: THREE.DoubleSide,
      })
    );
    digitPlane.position.y = 0.52;
    digitPlane.renderOrder = 6;
    group.add(digitPlane);

    const glow = makeGlow(C.collect, 1.05, 0.55);
    glow.position.y = 0.5;
    group.add(glow);

    coreGroup.add(group);
    cores.push({
      gx: cell.gx, gz: cell.gz, digit, group, gem, wire, digitPlane, glow,
      collected: false, death: 0, floatPhase: rng() * Math.PI * 2,
    });
  }
  updateCoresHud();
}

function updateCoresHud() {
  const left = cores.filter((c) => !c.collected).length;
  el.cores.innerHTML = `${left}<i>/${CORE_DIGITS.length}</i>`;
}

/* ------------------------------------------------------------------
   11. Enemies ("glitches")
------------------------------------------------------------------ */
const enemies = [];
const enemyGroup = new THREE.Group();
world.add(enemyGroup);

function spawnEnemy() {
  const rng = rngFor('enemy:' + level + ':' + enemies.length);
  const far = [];
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      const d = Math.hypot(gx - player.gx, gz - player.gz);
      if (d >= 3.2) far.push({ gx, gz });
    }
  }
  const cell = far[Math.floor(rng() * far.length)] || { gx: 0, gz: 0 };

  const group = new THREE.Group();
  group.position.copy(gridToWorld(cell.gx, cell.gz));

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.66, 0.66),
    new THREE.MeshStandardMaterial({
      color: 0x140207, emissive: C.danger, emissiveIntensity: 1.1,
      roughness: 0.3, metalness: 0.5,
    })
  );
  body.position.y = 0.5;
  group.add(body);

  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, toneMapped: false })
  );
  wire.position.copy(body.position);
  group.add(wire);

  const glow = makeGlow(C.danger, 1.25, 0.6);
  glow.position.y = 0.5;
  group.add(glow);

  enemyGroup.add(group);
  enemies.push({
    gx: cell.gx, gz: cell.gz,
    fromG: group.position.clone(),
    toG: group.position.clone(),
    t: 1, moving: false, stepTimer: 0.5 + rng() * 0.4,
    dir: { x: 1, z: 0 }, stunned: 0,
    group, body, wire, glow, spin: rng() * Math.PI * 2,
  });
}

function enemyInterval() {
  return Math.max(0.30, 0.68 - (level - 1) * 0.045);
}
function enemyChase() {
  return Math.min(0.82, 0.52 + (level - 1) * 0.035);
}

function stepEnemy(e, dt) {
  if (e.stunned > 0) { e.stunned -= dt; return; }
  if (e.moving) {
    e.t += dt / enemyInterval();
    if (e.t >= 1) {
      e.t = 1;
      e.gx = e.toG.x + HALF;
      e.gz = e.toG.z + HALF;
      e.moving = false;
      heatTile(e.gx, e.gz, 0.28, 2.4);
    }
    const k = easeOutCubic(e.t);
    e.group.position.lerpVectors(e.fromG, e.toG, k);
    return;
  }
  e.stepTimer -= dt;
  if (e.stepTimer > 0) return;
  e.stepTimer = enemyInterval();

  const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  const valid = dirs.filter((d) => {
    const nx = e.gx + d.x, nz = e.gz + d.z;
    return nx >= 0 && nx < N && nz >= 0 && nz < N;
  });
  const noReverse = valid.filter((d) => !(d.x === -e.dir.x && d.z === -e.dir.z));
  const pool = noReverse.length ? noReverse : valid;

  let choice;
  if (rnd() < enemyChase()) {
    let best = Infinity;
    const scored = pool.map((d) => {
      const dist = Math.abs(e.gx + d.x - player.gx) + Math.abs(e.gz + d.z - player.gz);
      const tie = rnd() * 0.6;
      if (dist + tie < best) best = dist + tie;
      return { d, v: dist + tie };
    });
    choice = scored.find((s) => s.v === best).d;
  } else {
    choice = pool[Math.floor(rnd() * pool.length)];
  }
  if (!choice) return;

  e.dir = choice;
  e.fromG = e.group.position.clone();
  e.toG = gridToWorld(e.gx + choice.x, e.gz + choice.z);
  e.t = 0;
  e.moving = true;
}

/* ------------------------------------------------------------------
   12. Tile heat (ripples, ambience, hazard glow)
------------------------------------------------------------------ */
function tileAt(gx, gz) {
  if (gx < 0 || gx >= N || gz < 0 || gz >= N) return null;
  return tiles[gz * N + gx];
}

function heatTile(gx, gz, amount, radius = 2.4, hazard = 0) {
  for (const t of tiles) {
    const d = Math.hypot(t.gx - gx, t.gz - gz);
    if (d > radius) continue;
    const f = (1 - d / radius) * amount;
    if (hazard) t.hazard = Math.min(1.1, t.hazard + f * 1.5);
    else t.heat = Math.min(1.15, t.heat + f);
  }
}

/* ------------------------------------------------------------------
   13. Game state
------------------------------------------------------------------ */
let state = 'menu'; // menu | playing | paused | over
let score = 0, best = 0, level = 1, lives = 3, combo = 1, coresLeft = CORE_DIGITS.length;
let freeze = 0, shake = 0, elapsed = 0, time = 0, camScale = 1;
let bestKey = 'nzopac.best.' + SEED.slice(0, 8);

try { best = parseInt(localStorage.getItem(bestKey) || '0', 10) || 0; } catch (_) { best = 0; }

const tmpV = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const shakeOffset = new THREE.Vector3();

function setScore(v) {
  score = v;
  el.score.textContent = score.toLocaleString();
  if (score > best) {
    best = score;
    el.best.textContent = best.toLocaleString();
    try { localStorage.setItem(bestKey, String(best)); } catch (_) {}
  }
}

function setLives(v, animate) {
  lives = v;
  el.lives.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('b');
    if (i >= lives) b.className = 'off' + (animate ? ' lost' : '');
    el.lives.appendChild(b);
  }
}

function bump(node) {
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

let bannerTimer = 0;
function showBanner(text, kind = '', ms = 1400) {
  el.banner.textContent = text;
  el.banner.className = 'banner show' + (kind ? ' ' + kind : '');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
}

let toastTimer = 0;
function showToast(text, ms = 1500) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function flashDamage() {
  app.classList.remove('hit');
  void app.offsetWidth;
  app.classList.add('hit');
  setTimeout(() => app.classList.remove('hit'), 450);
}

/* ------------------------------------------------------------------
   14. Input
------------------------------------------------------------------ */
const DIRS = {
  up: { x: 0, z: -1 }, down: { x: 0, z: 1 },
  left: { x: -1, z: 0 }, right: { x: 1, z: 0 },
};
const heldList = [];
let buffer = null, bufferTime = 0;

function pressDir(name) {
  const d = DIRS[name];
  if (!d) return;
  if (!heldList.some((h) => h.name === name)) heldList.push({ name, d });
  buffer = d;
  bufferTime = 0.3;
}
function releaseDir(name) {
  const i = heldList.findIndex((h) => h.name === name);
  if (i >= 0) heldList.splice(i, 1);
}
function desiredDir() {
  if (heldList.length) return heldList[heldList.length - 1].d;
  if (bufferTime > 0 && buffer) return buffer;
  return null;
}
function clearInput() { heldList.length = 0; buffer = null; bufferTime = 0; }

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { e.preventDefault(); pressDir(KEYMAP[e.code]); return; }
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'menu' || state === 'over') startGame();
    else if (state === 'paused') togglePause();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) { e.preventDefault(); releaseDir(KEYMAP[e.code]); }
});

/* touch / swipe */
let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  if (state !== 'playing') return;
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!touchStart || state !== 'playing') return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) return;
  const name = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  pressDir(name);
  releaseDir(name);
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
}, { passive: true });
canvas.addEventListener('touchend', () => { touchStart = null; }, { passive: true });

/* buttons */
el.muteBtn.addEventListener('click', toggleMute);
el.pauseBtn.addEventListener('click', togglePause);
el.seedBtn.addEventListener('click', newSeed);
el.muteBtn2.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
el.seedBtn2.addEventListener('click', (e) => { e.stopPropagation(); newSeed(); });
el.seedBtn3.addEventListener('click', (e) => { e.stopPropagation(); newSeed(); });
el.seedBtn2.addEventListener('pointerdown', (e) => e.stopPropagation());
el.seedBtn3.addEventListener('pointerdown', (e) => e.stopPropagation());
el.muteBtn2.addEventListener('pointerdown', (e) => e.stopPropagation());
el.startOverlay.addEventListener('pointerdown', () => { if (state === 'menu') startGame(); });
el.overOverlay.addEventListener('pointerdown', () => { if (state === 'over') startGame(); });

function toggleMute() {
  muted = !muted;
  el.muteBtn.textContent = muted ? 'SOUND\u00A0OFF' : 'SOUND\u00A0ON';
  showToast(muted ? 'AUDIO MUTED' : 'AUDIO LIVE');
  if (!muted) tone(noteFreq(2), 0.14, 'triangle', 0.18);
}

function newSeed() {
  let s = '';
  for (let i = 0; i < 64; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const url = location.pathname + '?seed=' + s;
  showToast('RESEEDING ' + s.slice(0, 8).toUpperCase() + '…');
  setTimeout(() => { location.href = url; }, 220);
}

/* ------------------------------------------------------------------
   15. Game flow
------------------------------------------------------------------ */
function resetGame() {
  enemies.length = 0;
  enemyGroup.clear();
  cores.length = 0;
  coreGroup.clear();

  level = 1;
  combo = 1;
  freeze = 1.1;
  shake = 0;
  elapsed = 0;
  player.gx = 3; player.gz = 4;
  player.moving = false; player.t = 1;
  player.invuln = 1.2;
  player.group.position.copy(gridToWorld(player.gx, player.gz));
  clearInput();

  setScore(0);
  el.best.textContent = best.toLocaleString();
  setLives(3, false);
  el.level.textContent = '01';
  el.combo.textContent = 'x1';

  for (let i = 0; i < 2; i++) spawnEnemy(); // level 1 starts with two
  spawnCores();
  heatTile(player.gx, player.gz, 1.2, 3);
}

function startGame() {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  resetGame();
  state = 'playing';
  el.startOverlay.classList.add('hidden');
  el.overOverlay.classList.add('hidden');
  showBanner('LEVEL 01', 'accent', 1200);
  tone(noteFreq(0), 0.18, 'square', 0.16);
  setTimeout(() => tone(noteFreq(3), 0.22, 'square', 0.16), 110);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showBanner('PAUSED', '', 99999);
    el.pauseBtn.textContent = 'RESUME';
  } else if (state === 'paused') {
    state = 'playing';
    el.banner.classList.remove('show');
    el.pauseBtn.textContent = 'PAUSE';
  }
}

function gameOver() {
  state = 'over';
  shake = 1.4;
  noise(0.5, 0.35);
  tone(140, 0.7, 'sawtooth', 0.22, -90);
  el.finalScore.textContent = score.toLocaleString();
  el.finalLevel.textContent = String(level).padStart(2, '0');
  el.finalBest.textContent = best.toLocaleString();
  el.overOverlay.classList.remove('hidden');
  el.pauseBtn.textContent = 'PAUSE';
}

function hitPlayer(e) {
  setLives(lives - 1, true);
  combo = 1;
  el.combo.textContent = 'x1';
  player.invuln = 2.2;
  shake = 1.0;
  flashDamage();
  noise(0.32, 0.3);
  tone(90, 0.34, 'sawtooth', 0.24, -40);
  tmpV.copy(player.group.position);
  particles.spawn(tmpV, C.danger, 46, 5.2, 26, 0.8, 0.35);
  heatTile(player.gx, player.gz, 1.4, 3, 1);

  // shove the attacker to a far tile so it can't immediately re-hit
  const far = freeTiles([{ gx: player.gx, gz: player.gz }], 3.4);
  if (far.length) {
    const cell = far[Math.floor(rnd() * far.length)];
    e.gx = cell.gx; e.gz = cell.gz;
    e.group.position.copy(gridToWorld(cell.gx, cell.gz));
    e.fromG.copy(e.group.position); e.toG.copy(e.group.position);
    e.moving = false; e.t = 1; e.stunned = 1.2; e.stepTimer = 0.5;
  }
  if (lives <= 0) gameOver();
}

function collectCore(c) {
  c.collected = true;
  c.death = 0.001;
  const gain = c.digit * 10 * combo;
  setScore(score + gain);
  combo = Math.min(99, combo + 1);
  el.combo.textContent = 'x' + combo;
  bump(el.combo);
  bump(el.score);

  tmpV.copy(c.group.position); tmpV.y += 0.5;
  particles.spawn(tmpV, C.collect, 34, 4.4, 24, 0.7, 0.3);
  tone(noteFreq(c.digit - 3 + combo), 0.22, 'triangle', 0.2);
  heatTile(c.gx, c.gz, 1.1, 2.6);
  updateCoresHud();

  coresLeft = cores.filter((cc) => !cc.collected).length;
  if (coresLeft === 0) levelUp();
}

function levelUp() {
  level += 1;
  freeze = 1.15;
  player.invuln = Math.max(player.invuln, 1.4);
  el.level.textContent = String(level).padStart(2, '0');
  bump(el.level);
  showBanner('LEVEL ' + String(level).padStart(2, '0'), 'accent', 1150);
  tone(noteFreq(4), 0.16, 'square', 0.18);
  setTimeout(() => tone(noteFreq(7), 0.16, 'square', 0.18), 110);
  setTimeout(() => tone(noteFreq(9), 0.3, 'square', 0.18), 220);

  const want = Math.min(MAX_ENEMIES, 1 + level);
  while (enemies.length < want) spawnEnemy();
  spawnCores();
}

/* ------------------------------------------------------------------
   16. Update
------------------------------------------------------------------ */
function tryMove(dir) {
  const nx = player.gx + dir.x, nz = player.gz + dir.z;
  if (nx < 0 || nx >= N || nz < 0 || nz >= N) {
    shake = Math.max(shake, 0.16);
    tone(70, 0.08, 'square', 0.07);
    return false;
  }
  player.dir.copy(dir);
  player.fromG.copy(player.group.position);
  player.toG.copy(gridToWorld(nx, nz));
  player.nextGX = nx;
  player.nextGZ = nz;
  player.t = 0;
  player.moving = true;
  return true;
}

function updatePlayer(dt) {
  if (player.moving) {
    player.t += dt / player.dur;
    if (player.t >= 1) {
      player.t = 1;
      player.gx = player.nextGX;
      player.gz = player.nextGZ;
      player.moving = false;
      heatTile(player.gx, player.gz, 0.7, 2.2);
    }
    const k = easeOutCubic(player.t);
    player.group.position.lerpVectors(player.fromG, player.toG, k);
  } else {
    const d = desiredDir();
    if (d && tryMove(d)) {
      if (heldList.length) buffer = null;
    }
  }
  // idle animation
  const spin = time * 1.6;
  player.core.rotation.y = spin;
  player.core.rotation.x = Math.sin(spin * 0.7) * 0.25;
  player.inner.rotation.y = -spin * 1.4;
  player.inner.rotation.x = spin * 0.5;
  player.ring.rotation.z = time * 2.2;
  const pulse = 1 + Math.sin(time * 6) * 0.05;
  player.core.scale.setScalar(pulse);
  player.glow.scale.setScalar(1.5 * pulse);
  player.light.intensity = 4 + Math.sin(time * 6) * 1.2;

  if (player.invuln > 0) {
    player.invuln -= dt;
    player.shield.visible = player.invuln > 0;
    player.shield.rotation.y += dt * 3;
    player.shield.rotation.x += dt * 1.7;
    const a = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(time * 22));
    player.shield.material.opacity = a;
    player.core.material.emissiveIntensity = 1.0 + Math.sin(time * 24) * 0.6;
  } else {
    player.shield.visible = false;
    player.core.material.emissiveIntensity = 1.5;
  }
}

function checkHits() {
  if (player.invuln > 0) return;
  for (const e of enemies) {
    const dx = e.group.position.x - player.group.position.x;
    const dz = e.group.position.z - player.group.position.z;
    if (dx * dx + dz * dz < 0.62 * 0.62) { hitPlayer(e); return; }
  }
}

function checkCores() {
  for (const c of cores) {
    if (c.collected) continue;
    const dx = c.group.position.x - player.group.position.x;
    const dz = c.group.position.z - player.group.position.z;
    if (dx * dx + dz * dz < 0.6 * 0.6) collectCore(c);
  }
}

function updateGame(dt) {
  elapsed += dt;
  updatePlayer(dt);
  if (freeze > 0) {
    freeze -= dt; // board is live, the swarm holds still for a beat
  } else {
    for (const e of enemies) stepEnemy(e, dt);
    checkHits();
  }
  checkCores();
}

function updateAmbient(dt) {
  // tile heat decay + emissive
  for (const t of tiles) {
    t.heat = Math.max(0, t.heat - dt * 2.0);
    t.hazard = Math.max(0, t.hazard - dt * 1.6);
    const ambient = 0.055 + 0.05 * Math.sin(time * 1.3 - (t.gx + t.gz) * 0.55);
    t.mat.emissive.copy(C.primary).multiplyScalar(ambient + t.heat);
    addScaled(t.mat.emissive, C.danger, t.hazard);
  }

  // enemies: rotate, bob, mark tiles
  for (const e of enemies) {
    e.body.rotation.y += dt * 1.9;
    e.body.rotation.x += dt * 1.1;
    e.wire.rotation.copy(e.body.rotation);
    const bob = Math.sin(time * 4 + e.spin) * 0.06;
    e.body.position.y = 0.5 + bob;
    e.wire.position.y = e.body.position.y;
    e.glow.position.y = 0.5 + bob;
    e.glow.scale.setScalar(1.25 + Math.sin(time * 5 + e.spin) * 0.14);
    const stunned = e.stunned > 0;
    e.body.material.emissiveIntensity = stunned ? 0.35 : 1.1 + Math.sin(time * 6 + e.spin) * 0.3;
    if (Math.random() < dt * 6) heatTile(e.gx, e.gz, 0.22, 1.9, 1);
  }

  // cores: float, spin, face camera, death fx
  for (let i = cores.length - 1; i >= 0; i--) {
    const c = cores[i];
    if (c.collected) {
      c.death += dt;
      const k = Math.min(1, c.death / 0.28);
      c.group.scale.setScalar(1 + k * 1.6);
      c.group.position.y = -k * 0.5;
      c.gem.material.emissiveIntensity = 1.3 * (1 - k);
      c.digitPlane.material.opacity = 0.95 * (1 - k);
      c.glow.material.opacity = 0.55 * (1 - k);
      if (k >= 1) {
        coreGroup.remove(c.group);
        cores.splice(i, 1);
      }
      continue;
    }
    c.group.position.y = Math.sin(time * 2 + c.floatPhase) * 0.07;
    c.gem.rotation.y = time * 1.3 + c.floatPhase;
    c.gem.rotation.x = time * 0.7;
    c.wire.rotation.copy(c.gem.rotation);
    c.digitPlane.quaternion.copy(camera.quaternion);
    c.glow.scale.setScalar(1.05 + Math.sin(time * 3 + c.floatPhase) * 0.12);
  }

  particles.update(dt);
  voidPoints.rotation.y = time * 0.012;
  voidPoints.rotation.x = Math.sin(time * 0.05) * 0.05;

  // camera: gentle follow + idle drift + impact shake
  const drift = state === 'menu' ? Math.sin(time * 0.15) * 1.6 : 0;
  camTarget.set(
    (player.group.position.x * 0.16 + drift) * camScale,
    (11.6 + Math.sin(time * 0.5) * 0.14) * camScale,
    (9.6 + player.group.position.z * 0.16) * camScale
  );
  const k = Math.min(1, dt * 2.6);
  camera.position.x += (camTarget.x - camera.position.x) * k;
  camera.position.y += (camTarget.y - camera.position.y) * k;
  camera.position.z += (camTarget.z - camera.position.z) * k;

  shake = Math.max(0, shake - dt * 2.4);
  const s = shake * shake;
  shakeOffset.set(
    (rnd() - 0.5) * s * 0.28,
    (rnd() - 0.5) * s * 0.22,
    (rnd() - 0.5) * s * 0.18
  );
  camera.position.add(shakeOffset);

  lookTarget.set(
    player.group.position.x * 0.22 + shakeOffset.x * 1.8,
    0.1 + shakeOffset.y * 1.8,
    player.group.position.z * 0.22 - 0.6 + shakeOffset.z * 1.8
  );
  camera.lookAt(lookTarget);

  bloom.strength = 0.55 + (player.invuln > 0 ? 0.16 : 0) + Math.min(0.22, shake * 0.28);
}

/* ------------------------------------------------------------------
   17. Resize + main loop
------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // pull the camera back on narrow/portrait screens so all 64 tiles stay in frame
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * camera.aspect;
  camScale = Math.min(2.4, Math.max(1, 5.0 / Math.max(0.001, tanH * 15)));
  renderer.setPixelRatio(dprCap());
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  particles.setHeight(h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

window.addEventListener('blur', () => { if (state === 'playing') togglePause(); });

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;

  if (state === 'playing') updateGame(dt);
  updateAmbient(dt);

  composer.render();
}

/* ------------------------------------------------------------------
   18. Boot
------------------------------------------------------------------ */
setScore(0);
el.best.textContent = best.toLocaleString();
setLives(3, false);
el.cores.innerHTML = `${CORE_DIGITS.length}<i>/${CORE_DIGITS.length}</i>`;
el.combo.textContent = 'x1';
el.level.textContent = '01';
player.invuln = 0;
resize();
requestAnimationFrame(animate);

console.log(
  '%c NZOPAC // GRID 64 ',
  'background:#648499;color:#070b10;font-weight:700;padding:2px 6px;border-radius:3px',
  '\n seed:', SEED,
  '\n palette:', P,
  '\n digits:', DIGITS.join(' '),
  '\n cores:', CORE_DIGITS.join(' ')
);
