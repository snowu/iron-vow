import * as THREE from "three";
import {
  bout,
  step,
  command,
  feint,
  disengage,
  geometry,
  extension,
  MOVES,
  RULES,
} from "./fencing.js";
import {
  fencingController,
  stepFencingAI,
  stepFencingPair,
  fencingState,
  names,
} from "./fencing-ai.js";
import {
  createBrain,
  requestDecision,
  liveDecision,
  decisionDue,
  requestDecisionPair,
} from "./brain.js";
const $ = (id) => document.getElementById(id),
  canvas = $("arena");
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const localOnly = import.meta.env.VITE_STATIC_HOST === "true" && !apiBase;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
let retro = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#101820");
scene.fog = new THREE.Fog("#101820", 50, 100);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 3.1, 10.8);
camera.lookAt(0, 0.9, 0);
scene.add(new THREE.HemisphereLight("#e6f5ff", "#233442", 2));
const sun = new THREE.DirectionalLight("#ffffff", 2.2);
sun.position.set(-3, 8, 4);
scene.add(sun);
const material = (color) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true });
const white = material("#e2e8e8"),
  dark = material("#15232e"),
  steel = material("#a6bac5");
function mesh(geo, mat, parent = scene) {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}
function box(w, h, d, mat, x, y, z, parent = scene) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, parent);
  m.position.set(x, y, z);
  return m;
}
// A small evening fencing salle: wood floor, plaster walls, and a clear piste.
const wood = material("#51463e"),
  wall = material("#343f45"),
  trim = material("#1c282f");
box(30, 0.12, 18, wood, 0, -0.19, 0);
for (let z = -8; z <= 8; z += 0.65)
  box(30, 0.008, 0.018, material("#3e3935"), 0, -0.122, z);
box(17, 0.1, 2.1, material("#687477"), 0, -0.06, 0);
for (const z of [-1, 1])
  box(17, 0.012, 0.032, material("#b7b9aa"), 0, 0.002, z);
for (const x of [-6.5, -4, -2, 0, 2, 4, 6.5])
  box(
    0.035,
    0.012,
    2,
    material(Math.abs(x) === 6.5 ? "#9a6a5a" : "#9ba7a5"),
    x,
    0.004,
    0,
  );
for (let x = -8; x <= 8; x += 0.5)
  box(0.008, 0.008, 2, material("#58676b"), x, 0.002, 0);
box(30, 7, 0.2, wall, 0, 3.2, -4.5);
box(30, 0.22, 0.12, trim, 0, 0.1, -4.32);
box(30, 0.08, 0.12, material("#79837f"), 0, 2.5, -4.32);
for (const x of [-10, -5, 0, 5, 10]) {
  box(0.18, 6, 0.18, trim, x, 2.8, -4.25);
  box(2.7, 2.6, 0.08, material("#182a34"), x + 2.45, 3.4, -4.32);
  for (const shift of [-0.85, 0, 0.85])
    box(0.035, 2.6, 0.07, material("#839595"), x + 2.45 + shift, 3.4, -4.25);
  box(2.7, 0.035, 0.08, steel, x + 2.45, 3.45, -4.23);
}
for (const x of [-6, 6]) {
  box(2.4, 0.12, 0.6, wood, x, 0.43, -3.25);
  for (const dx of [-0.8, 0.8]) box(0.07, 0.43, 0.45, trim, x + dx, 0.2, -3.25);
  box(2.4, 0.12, 0.12, wood, x, 0.8, -3.47);
}
for (const x of [-3.5, 3.5]) {
  box(2.7, 0.04, 0.6, trim, x, 4.9, 0);
  box(
    2.5,
    0.025,
    0.4,
    new THREE.MeshBasicMaterial({ color: "#eadfc6" }),
    x,
    4.87,
    0,
  );
}
const warmLight = new THREE.DirectionalLight("#efd6aa", 0.55);
warmLight.position.set(2, 5, 1);
scene.add(warmLight);
const unitY = new THREE.Vector3(0, 1, 0);
function segment(radius, mat, parent) {
  return mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius, 1, 8),
    mat,
    parent,
  );
}
function placeSegment(m, a, b) {
  const delta = b.clone().sub(a);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.y = delta.length();
  m.quaternion.setFromUnitVectors(unitY, delta.normalize());
}
function point(x, y, z = 0) {
  return new THREE.Vector3(x, y, z);
}
// Two-bone geometry: hands are reachable targets, not independent cosmetic objects.
function elbow(shoulder, hand, a = 0.38, b = 0.36) {
  const delta = hand.clone().sub(shoulder),
    distance = delta.length();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const direction = delta.normalize(),
    bend = new THREE.Vector3(direction.y, -direction.x, 0).normalize();
  return shoulder
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(bend, height);
}
const glowCanvas = document.createElement("canvas");
glowCanvas.width = 64;
glowCanvas.height = 64;
const glowContext = glowCanvas.getContext("2d"),
  gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
gradient.addColorStop(0, "rgba(240,250,255,0.95)");
gradient.addColorStop(0.18, "rgba(150,210,235,0.5)");
gradient.addColorStop(1, "rgba(100,180,220,0)");
glowContext.fillStyle = gradient;
glowContext.fillRect(0, 0, 64, 64);
const glowTexture = new THREE.CanvasTexture(glowCanvas);
const spark = mesh(
  new THREE.SphereGeometry(0.03, 6, 4),
  new THREE.MeshBasicMaterial({
    color: "#ffe8b8",
    transparent: true,
    opacity: 0,
  }),
  scene,
);
let sparkUntil = 0;
function fencerModel(color) {
  const root = new THREE.Group();
  scene.add(root);
  const body = new THREE.Group();
  root.add(body);
  const suit = white.clone(),
    accent = material(color);
  const torso = mesh(new THREE.CapsuleGeometry(0.22, 0.26, 4, 10), suit, body);
  torso.position.set(-0.02, 1.24, 0);
  torso.scale.set(0.9, 0.82, 0.85);
  torso.rotation.z = -0.08;
  const hips = mesh(new THREE.SphereGeometry(0.2, 10, 7), suit, body);
  hips.position.set(-0.04, 0.94, 0);
  hips.scale.set(0.85, 0.62, 0.88);
  box(0.015, 0.42, 0.022, material("#b0bdb9"), 0.175, 1.2, 0, body);
  box(0.045, 0.17, 0.3, accent, -0.17, 1.31, 0, body);
  const hood = mesh(new THREE.SphereGeometry(0.205, 12, 9), suit, body);
  hood.position.set(-0.025, 1.74, 0);
  hood.scale.set(0.93, 1.1, 0.86);
  const mask = mesh(new THREE.SphereGeometry(0.22, 12, 9), dark, body);
  mask.position.set(0.1, 1.75, 0);
  mask.scale.set(0.72, 1.05, 0.83);
  const bib = mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.18, 9), suit, body);
  bib.position.set(0, 1.51, 0);
  // Curved mesh follows the face rather than a flat robot visor.
  for (let dy = -0.15; dy <= 0.15; dy += 0.045) {
    const points = [];
    for (let z = -0.13; z <= 0.13; z += 0.026) {
      const q = 1 - (dy / 0.23) ** 2 - (z / 0.183) ** 2;
      if (q > 0) points.push(point(0.1 + 0.159 * Math.sqrt(q), 1.75 + dy, z));
    }
    const curve = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: "#82918e" }),
    );
    body.add(curve);
  }
  const arms = [segment(0.075, suit, body), segment(0.065, suit, body)];
  const free = [segment(0.07, suit, body), segment(0.06, suit, body)];
  const legs = [
    segment(0.095, suit, root),
    segment(0.075, suit, root),
    segment(0.095, suit, root),
    segment(0.075, suit, root),
  ];
  const feet = [
    box(0.29, 0.085, 0.16, material("#c4d0ca"), 0, 0, 0, root),
    box(0.29, 0.085, 0.16, material("#c4d0ca"), 0, 0, 0, root),
  ];
  const joints = Array.from({ length: 4 }, (_, i) =>
    mesh(
      new THREE.SphereGeometry(i < 2 ? 0.072 : 0.075, 8, 6),
      suit,
      i < 2 ? body : root,
    ),
  );
  const freeHand = mesh(new THREE.SphereGeometry(0.062, 8, 6), suit, body);
  for (const foot of feet) box(0.1, 0.055, 0.165, accent, 0.075, 0.01, 0, foot);
  const hand = mesh(new THREE.SphereGeometry(0.075, 8, 6), suit, body);
  const guard = mesh(new THREE.SphereGeometry(0.12, 10, 7), steel, body);
  guard.scale.set(0.3, 1, 1);
  const blade = segment(0.012, steel, body),
    grip = segment(0.027, dark, body);
  const tip = mesh(
    new THREE.SphereGeometry(0.025, 6, 4),
    new THREE.MeshBasicMaterial({ color: "#eaf8ff" }),
    body,
  );
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.set(0.23, 0.23, 1);
  body.add(glow);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(48), 3),
  );
  trailGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(48), 3),
  );
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color,
      vertexColors: true,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  trail.frustumCulled = false;
  scene.add(trail);
  const shadow = mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({
      color: "#060c12",
      transparent: true,
      opacity: 0.4,
    }),
    root,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.scale.set(1.5, 0.6, 1);
  return {
    root,
    body,
    torso,
    suit,
    arms,
    free,
    legs,
    feet,
    hand,
    joints,
    freeHand,
    mask,
    guard,
    blade,
    grip,
    tip,
    glow,
    trail,
    trace: [],
  };
}
const visuals = [fencerModel("#57c5da"), fencerModel("#ef776d")];
let state = bout(),
  mode = "menu",
  battleMode = "human",
  persona = "warden",
  playerPersona = "warden",
  paused = false,
  generation = 0,
  clock = 0,
  accumulator = 0;
let brains = [createBrain(), createBrain()],
  controllers = [fencingController(playerPersona), fencingController(persona)],
  keys = new Set(),
  noticeUntil = 0,
  lastEvent = 0,
  autoUntil = 0,
  soundOn = false,
  audio = null;
function tone(frequency, duration = 0.06) {
  if (!soundOn) return;
  audio ??= new AudioContext();
  audio.resume();
  const o = audio.createOscillator(),
    gain = audio.createGain();
  o.frequency.value = frequency;
  gain.gain.setValueAtTime(0.04, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  o.connect(gain).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + duration);
}
function announce(text, duration = 0.6) {
  $("notice").textContent = text;
  noticeUntil = clock + duration;
}
function reset() {
  generation++;
  state = bout();
  brains = [createBrain(), createBrain()];
  controllers = [fencingController(playerPersona), fencingController(persona)];
  lastEvent = 0;
  keys.clear();
  paused = false;
  mode = "play";
  accumulator = 0;
  autoUntil = 0;
  $("intro").classList.add("hidden");
  $("result").classList.add("hidden");
  $("paused").classList.add("hidden");
  for (const id of ["hud", "controls", "readout", "brain"])
    $(id).classList.remove("hidden");
  $("brain-player").classList.toggle("hidden", battleMode !== "ai");
  $("blue-name").textContent =
    battleMode === "ai" ? names[playerPersona] : "YOU";
  $("red-name").textContent = names[persona];
  announce("ALLEZ", 0.65);
}
function input(type) {
  if (
    mode !== "play" ||
    paused ||
    battleMode === "ai" ||
    state.phase !== "fence"
  )
    return;
  const f = state.fencers[0],
    foe = state.fencers[1];
  if (type === "parry" && ["thrust", "lunge"].includes(foe.action))
    f.line = foe.attackLine;
  if (command(f, type)) tone(type === "lunge" ? 170 : 240);
  else if (f.stamina < (MOVES[type]?.cost || 0))
    announce("RECOVER YOUR FOOTWORK", 0.3);
}
function keydown(e) {
  const key = e.key.toLowerCase();
  if ([" ", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
  if (e.repeat) return;
  if (!$("instructions").classList.contains("hidden")) {
    if (key === "escape") $("close-help").click();
    return;
  }
  if (key === "escape" && mode === "play") {
    paused = !paused;
    keys.clear();
    $("paused").classList.toggle("hidden", !paused);
    return;
  }
  if (mode !== "play" || paused) return;
  keys.add(key);
  if (battleMode === "ai") return;
  const f = state.fencers[0];
  if (key === "j") input("thrust");
  if (key === "k") input("lunge");
  if (key === "shift") input("parry");
  if (key === " ") input("retreat");
  if (key === "g") input("beat");
  if (key === "f" && state.phase === "fence" && feint(f))
    announce("FEINT", 0.25);
  if (key === "e" && state.phase === "fence" && disengage(f))
    announce("DISENGAGE", 0.25);
  if (["1", "2", "3"].includes(key)) {
    const line = ["high", "inside", "outside"][Number(key) - 1];
    if (["ready", "recover"].includes(f.action)) f.line = line;
    else if (state.phase === "fence") disengage(f, line);
  }
}
window.addEventListener("keydown", keydown);
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  if (mode === "play" && !paused) {
    paused = true;
    $("paused").classList.remove("hidden");
  }
});
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 0) input("thrust");
  if (e.button === 2) input("lunge");
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
$("start").onclick = () => {
  playerPersona = $("player-persona").value;
  reset();
};
$("next").onclick = reset;
$("menu").onclick = () => {
  generation++;
  mode = "menu";
  keys.clear();
  $("result").classList.add("hidden");
  $("intro").classList.remove("hidden");
  for (const id of ["hud", "controls", "readout", "brain", "brain-player"])
    $(id).classList.add("hidden");
};
for (const b of document.querySelectorAll("[data-persona]"))
  b.onclick = () => {
    persona = b.dataset.persona;
    for (const p of document.querySelectorAll("[data-persona]"))
      p.classList.toggle("selected", p === b);
  };
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    battleMode = b.dataset.mode;
    for (const p of document.querySelectorAll("[data-mode]"))
      p.classList.toggle("selected", p === b);
    $("blue-select").classList.toggle("hidden", battleMode !== "ai");
  };
$("help").onclick = () => {
  if (mode === "play") {
    paused = true;
    keys.clear();
    $("paused").classList.add("hidden");
  }
  $("instructions").classList.remove("hidden");
};
$("close-help").onclick = () => {
  $("instructions").classList.add("hidden");
  if (mode === "play") paused = false;
};
$("insights").onclick = () => document.body.classList.toggle("show-insights");
$("sound").onclick = () => {
  soundOn = !soundOn;
  $("sound").textContent = soundOn ? "SOUND ON" : "SOUND OFF";
};
function observedState(side) {
  const f = state.fencers[side],
    foe = state.fencers[1 - side];
  const history = [
    ...controllers[side].history.slice(-3),
    ...state.events
      .slice(-2)
      .map((e) => `${e.side === side ? "self" : "opponent"}: ${e.type}`),
    `Distance ${Math.abs(f.x - foe.x).toFixed(1)}m; score self ${state.score[side]} opponent ${state.score[1 - side]}; foe ${foe.action} ${foe.elapsed.toFixed(2)}s; ${controllers[side].engaged ? "engaged" : "opening measure"}`,
  ];
  return fencingState(f, foe, side === 0 ? playerPersona : persona, history);
}
async function think(side) {
  const token = generation,
    brain = brains[side];
  const status = await requestDecision(brain, observedState(side), {
    apiBase,
    now: () => clock,
    isCurrent: () => token === generation && mode === "play",
  });
  showDecision(side, status, brain);
}
async function thinkPair() {
  const token = generation,
    pair = brains;
  const status = await requestDecisionPair(
    pair,
    [observedState(0), observedState(1)],
    {
      apiBase,
      now: () => clock,
      isCurrent: () => token === generation && mode === "play",
    },
  );
  pair.forEach((brain, side) => showDecision(side, status, brain));
}
function showDecision(side, status, brain) {
  if (status === "stale" || status === "busy") return;
  const prefix = side === 0 ? "player-" : "";
  const d = brain.decision;
  if (status === "live") {
    const terms = {
      light: "THRUST",
      heavy: "LUNGE",
      guardbreak: "BLADE BEAT",
      dodge: "RETREAT",
      feint: "FEINT",
      defend: "DRAW THE ATTACK",
    };
    $(prefix + "intent").textContent =
      `${terms[d.tactic] || d.tactic} · ${d.movement.replaceAll("_", " ")}`;
    $(prefix + "latency").textContent =
      `${d.latency} ms · ${d.model} · ${brain.liveCount} decisions`;
  } else
    $(prefix + "latency").textContent =
      battleMode === "ai"
        ? "Waiting for JEV · retrying"
        : "Local sparring · retrying JEV";
}
const fallback = {
  tactic: "light",
  movement: "advance",
  attack_direction: "left",
  on_light: "parry",
  on_heavy: "dodge",
  source: "local",
};
function simulate(dt) {
  let movements = [0, 0];
  const red = liveDecision(brains[1], clock),
    blue = liveDecision(brains[0], clock);
  if (battleMode === "ai" && (!red || !blue)) return;
  if (state.phase === "fence") {
    if (battleMode === "ai")
      movements = stepFencingPair(controllers, state.fencers, [blue, red], dt);
    else {
      movements[1] = stepFencingAI(
        controllers[1],
        state.fencers[1],
        state.fencers[0],
        red || fallback,
        dt,
      );
      movements[0] =
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    }
  }
  const previousExchange = state.exchange;
  step(state, dt, movements);
  if (state.exchange !== previousExchange)
    controllers = [
      fencingController(
        playerPersona,
        controllers[0].history,
        controllers[0].random,
      ),
      fencingController(persona, controllers[1].history, controllers[1].random),
    ];
  for (const e of state.events) {
    if (e.time <= lastEvent) continue;
    const who =
      battleMode === "ai"
        ? e.side === 0
          ? "BLUE"
          : "RED"
        : e.side === 0
          ? "YOU"
          : "OPPONENT";
    if (e.type === "touch") {
      announce(`${who} · TOUCH`, 0.7);
      tone(e.side === 0 ? 1000 : 700, 0.15);
    }
    if (e.type === "double") announce("DOUBLE TOUCH", 1);
    if (e.type === "parry") {
      announce(
        `${who} · ${e.technique === "counter-parry" ? "COUNTER-PARRY" : "PARRY"} — RIPOSTE`,
        0.35,
      );
      tone(1300);
    }
    if (e.point) {
      spark.position.set(e.point.x, e.point.y, 0);
      sparkUntil = clock + 0.09;
    }
    if (e.type === "beat") {
      announce("BLADE BEAT", 0.3);
      tone(500);
    }
    if (e.type === "miss" && e.side === 0) announce("SHORT · RECOVER", 0.3);
  }
  lastEvent = state.time;
  if (state.phase === "finished" && mode === "play") {
    mode = "result";
    keys.clear();
    $("result").classList.remove("hidden");
    $("result-title").textContent =
      battleMode === "ai"
        ? `${state.winner === 0 ? "BLUE" : "RED"} WINS`
        : state.winner === 0
          ? "YOUR BOUT."
          : "REMATCH?";
    $("result-detail").textContent =
      `${state.score[0]} — ${state.score[1]} · ${state.exchange} exchanges`;
    autoUntil = clock + 3;
  }
}
function animate(v, f, other, dt) {
  const g = geometry(f, other),
    ext = g.extension;
  v.root.position.set(f.x, 0, 0);
  v.root.rotation.y = f.side === 1 ? 0 : Math.PI;
  v.body.position.x = g.lunge * 0.18;
  v.body.position.y = 0;
  v.torso.rotation.z = -0.08 - g.lunge * 0.22;
  v.suit.emissive.setRGB(f.flash * 0.5, f.flash * 0.6, f.flash * 0.8);
  const shoulder = point(0.18, 1.45, 0.09),
    hand = point(g.hand.x - g.lunge * 0.18, g.hand.y, 0);
  const joint = elbow(shoulder, hand);
  placeSegment(v.arms[0], shoulder, joint);
  placeSegment(v.arms[1], joint, hand);
  v.hand.position.copy(hand);
  v.joints[0].position.copy(joint);
  const tip = point(g.localTip.x - g.lunge * 0.18, g.localTip.y, 0);
  const direction = tip.clone().sub(hand).normalize();
  v.guard.position.copy(hand).addScaledVector(direction, 0.075);
  v.guard.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
  v.tip.position.copy(tip);
  v.glow.position.copy(tip);
  v.tip.scale.setScalar(f.contactFlash > 0 ? 1.3 : 1);
  v.tip.material.color.set(f.contactFlash > 0 ? "#ffe5a1" : "#eaf8ff");
  placeSegment(v.blade, hand.clone().addScaledVector(direction, 0.09), tip);
  placeSegment(v.grip, hand.clone().addScaledVector(direction, -0.1), hand);
  const freeShoulder = point(-0.08, 1.46, -0.12),
    freeElbow = point(-0.3, 1.37 + ext * 0.06, -0.16),
    freeHand = point(-0.43 - ext * 0.12, 1.6 + ext * 0.12, -0.12);
  placeSegment(v.free[0], freeShoulder, freeElbow);
  placeSegment(v.free[1], freeElbow, freeHand);
  v.freeHand.position.copy(freeHand);
  v.joints[1].position.copy(freeElbow);
  v.mask.rotation.z = -0.03 - ext * 0.06;
  const walk =
    f.moving && f.action !== "lunge" ? Math.sin(f.travel * 9) * 0.16 : 0;
  const hip = point(-0.04 + g.lunge * 0.12, 0.91, 0);
  const front = point(0.35 + g.lunge * 0.34 + walk, 0.08, 0.13),
    back = point(-0.35 - walk, 0.08, -0.13);
  const frontKnee = point(0.26 + g.lunge * 0.18, 0.48, 0.13),
    backKnee = point(-0.24, 0.44, -0.13);
  placeSegment(v.legs[0], hip.clone().add(point(0, 0, 0.12)), frontKnee);
  placeSegment(v.legs[1], frontKnee, front);
  placeSegment(v.legs[2], hip.clone().add(point(0, 0, -0.12)), backKnee);
  placeSegment(v.legs[3], backKnee, back);
  v.joints[2].position.copy(frontKnee);
  v.joints[3].position.copy(backKnee);
  v.feet[0].position.copy(front);
  v.feet[1].position.copy(back);
  v.feet[1].rotation.y = Math.PI / 2;
  v.root.updateMatrixWorld(true);
  const worldTip = v.tip.getWorldPosition(new THREE.Vector3());
  v.trace = v.trace.filter((p) => clock - p.time < 0.17);
  if (
    mode === "play" &&
    !paused &&
    state.phase === "fence" &&
    (!v.trace.length || worldTip.distanceTo(v.trace[0].point) > 0.01)
  )
    v.trace.unshift({ point: worldTip, time: clock });
  v.trace.length = Math.min(v.trace.length, 16);
  const positions = v.trail.geometry.attributes.position,
    colors = v.trail.geometry.attributes.color;
  v.trace.forEach((p, i) => {
    positions.setXYZ(i, p.point.x, p.point.y, p.point.z);
    const fade = Math.max(0, 1 - (clock - p.time) / 0.17);
    colors.setXYZ(i, fade, fade, fade);
  });
  positions.needsUpdate = true;
  colors.needsUpdate = true;
  v.trail.geometry.setDrawRange(0, v.trace.length);
  v.trail.visible = v.trace.length > 1;
}
function resize() {
  const ratio = retro
    ? Math.min(1, 720 / innerWidth, 480 / innerHeight)
    : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  canvas.style.imageRendering = retro ? "pixelated" : "auto";
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
$("style").onclick = () => {
  retro = !retro;
  $("style").textContent = retro ? "STYLE PS1" : "STYLE CLEAN";
  resize();
};
window.addEventListener("resize", resize);
resize();
function hud() {
  const [a, b] = state.fencers;
  $("blue-score").textContent = state.score[0];
  $("red-score").textContent = state.score[1];
  $("blue-energy").style.width = `${a.stamina}%`;
  $("red-energy").style.width = `${b.stamina}%`;
  for (let i = 0; i < 2; i++)
    $(i === 0 ? "blue-light" : "red-light").classList.toggle(
      "lit",
      state.lights[i],
    );
  $("phase").textContent =
    state.phase === "fence"
      ? "ALLEZ"
      : state.phase === "halt"
        ? "HALT"
        : "BOUT COMPLETE";
  const gap = Math.abs(a.x - b.x);
  $("distance").textContent =
    gap > 3.1
      ? "OUTSIDE LUNGE DISTANCE"
      : gap > 2
        ? "LUNGE DISTANCE"
        : "THRUST DISTANCE";
  $("readout").textContent =
    battleMode === "ai"
      ? "JEV vs JEV · ESC TO PAUSE"
      : a.riposte > 0
        ? "RIPOSTE · THRUST NOW"
        : a.bladeLost > 0
          ? a.displacement === "parry"
            ? "SHIFT COUNTER-PARRY · SPACE RETREAT"
            : "BLADE DISPLACED · RECOVER"
          : ["thrust", "lunge"].includes(b.action)
            ? `${b.action.toUpperCase()} · ${b.attackLine.toUpperCase()} · SHIFT TO PARRY`
            : `${a.line.toUpperCase()} LINE · ${a.action === "ready" ? "EN GARDE" : a.action.toUpperCase()}`;
  const fresh = liveDecision(brains[1], clock),
    both = fresh && liveDecision(brains[0], clock);
  $("connection").textContent =
    battleMode === "ai"
      ? both
        ? "JEV vs JEV · LIVE"
        : "JEV vs JEV · WAITING"
      : fresh
        ? "JEV · LIVE"
        : brains[1].failures || localOnly
          ? "LOCAL SPARRING · RETRYING JEV"
          : "JEV · CONNECTING";
}
let previous = performance.now(),
  fps = 60;
function frame(now) {
  const raw = (now - previous) / 1000,
    dt = Math.min(0.1, raw);
  previous = now;
  clock += dt;
  fps = fps * 0.95 + (1 / Math.max(raw, 0.001)) * 0.05;
  if (mode === "play" && !paused) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      simulate(1 / 120);
      accumulator -= 1 / 120;
      if (mode !== "play") break;
    }
    if (!localOnly) {
      if (battleMode === "ai") {
        if (brains.every((brain) => decisionDue(brain, clock))) thinkPair();
      } else if (decisionDue(brains[1], clock)) think(1);
    }
  }
  if (
    mode === "result" &&
    battleMode === "ai" &&
    $("auto-rounds").checked &&
    clock >= autoUntil
  )
    reset();
  if (clock > noticeUntil) $("notice").textContent = "";
  hud();
  for (let i = 0; i < 2; i++)
    animate(visuals[i], state.fencers[i], state.fencers[1 - i], dt);
  const middle = (state.fencers[0].x + state.fencers[1].x) / 2,
    gap = Math.abs(state.fencers[1].x - state.fencers[0].x),
    distance = Math.max(
      8.8,
      gap * 1.15 + 4.5,
      (gap + 2.8) /
        (2 * Math.tan(THREE.MathUtils.degToRad(20)) * camera.aspect),
    );
  camera.position.x = THREE.MathUtils.damp(camera.position.x, middle, 5, dt);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, distance, 5, dt);
  camera.lookAt(middle, 0.95, 0);
  spark.material.opacity = Math.max(0, (sparkUntil - clock) / 0.09) * 0.7;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.__IRON_VOW__ = {
  getState: () => ({
    mode,
    battleMode,
    paused,
    persona,
    playerPersona,
    fps,
    phase: state.phase,
    score: [...state.score],
    winner: state.winner,
    exchange: state.exchange,
    player: { ...state.fencers[0] },
    enemy: { ...state.fencers[1] },
    lights: [...state.lights],
    events: state.events.map((e) => ({ ...e })),
    brains: { player: { ...brains[0] }, enemy: { ...brains[1] } },
    expectedTips: state.fencers.map(
      (f, i) => geometry(f, state.fencers[1 - i]).tip,
    ),
    retro,
    rig: visuals.map((v) => ({
      hand: v.hand.getWorldPosition(new THREE.Vector3()).toArray(),
      tip: v.tip.getWorldPosition(new THREE.Vector3()).toArray(),
    })),
  }),
};
requestAnimationFrame(frame);
