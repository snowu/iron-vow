const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const localOnly = import.meta.env.VITE_STATIC_HOST === "true" && !apiBase;
function showLocalMode() {
  document.getElementById("connection").textContent =
    "LOCAL AI · JEV NOT CONNECTED";
  document.getElementById("connection").classList.add("offline");
  document.getElementById("brain-status").textContent = "LOCAL";
  document.getElementById("brain-name").textContent = "LOCAL AI";
  document.getElementById("enemy-brain-label").textContent = "LOCAL AI";
  document.getElementById("intro-brain-label").textContent = "LOCAL SPARRING";
  document.getElementById("latency").textContent =
    "Static demo · connect a JEV backend for live decisions";
}
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  fighter,
  requestAttack,
  requestDefense,
  switchGuard,
  counterBreak,
  feint,
  dodge,
  parry,
  specs,
  directions,
} from "./combat.js";
import { controller, stepAI } from "./ai.js";
import { stepDuel } from "./world.js";
import { yawToTarget } from "./facing.js";
import { swordPose } from "./pose.js";
const $ = (id) => document.getElementById(id),
  canvas = $("arena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#17272e");
scene.fog = new THREE.FogExp2("#17272e", 0.027);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
camera.position.set(10, 7, 12);
scene.add(new THREE.HemisphereLight("#a4d1de", "#302d27", 2.1));
const sun = new THREE.DirectionalLight("#ffdbaf", 3);
sun.position.set(-6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0003;
scene.add(sun);
const mats = {
  stone: new THREE.MeshLambertMaterial({ color: "#455358" }),
  edge: new THREE.MeshLambertMaterial({ color: "#2a3b43" }),
  metal: new THREE.MeshLambertMaterial({
    color: "#9daeb3",
  }),
  dark: new THREE.MeshLambertMaterial({
    color: "#1f2c32",
  }),
  gold: new THREE.MeshLambertMaterial({
    color: "#a68a55",
  }),
  player: new THREE.MeshLambertMaterial({ color: "#527e8a" }),
  enemy: new THREE.MeshLambertMaterial({ color: "#9a4b39" }),
  skin: new THREE.MeshLambertMaterial({ color: "#a9967a" }),
};
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent = scene) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
}
mesh(new THREE.CylinderGeometry(9, 9.5, 0.8, 64), mats.edge, 0, -0.45, 0);
mesh(new THREE.CylinderGeometry(8.9, 8.9, 0.12, 64), mats.stone, 0, -0.02, 0);
// Stone joints and inlaid circular dueling lines.
for (let r of [3.3, 6.1, 8.5]) {
  const ring = mesh(
    new THREE.TorusGeometry(r, 0.025, 4, 100),
    mats.gold,
    0,
    0.05,
    0,
  );
  ring.rotation.x = Math.PI / 2;
}
for (let i = 0; i < 36; i++) {
  const a = (i * Math.PI * 2) / 36;
  const b = box(
    0.026,
    0.008,
    8.8,
    mats.edge,
    Math.sin(a) * 4.4,
    0.05,
    Math.cos(a) * 4.4,
  );
  b.rotation.y = a;
}
const ground = mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshLambertMaterial({ color: "#1a282d" }),
  0,
  -1,
  0,
);
ground.rotation.x = -Math.PI / 2;
const flames = [];
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI * 2) / 12,
    x = Math.sin(a) * 10.3,
    z = Math.cos(a) * 10.3;
  box(1.15, 0.45, 1.15, mats.edge, x, -0.65, z);
  const pillar = mesh(
    new THREE.CylinderGeometry(0.4, 0.6, 4.3, 8),
    mats.stone,
    x,
    1.35,
    z,
  );
  box(1.1, 0.28, 1.1, mats.edge, x, 3.6, z);
  if (i % 3 === 0) {
    mesh(
      new THREE.CylinderGeometry(0.25, 0.13, 0.45, 8),
      mats.gold,
      x,
      3.94,
      z,
    );
    const flame = mesh(
      new THREE.ConeGeometry(0.17, 0.6, 7),
      new THREE.MeshBasicMaterial({ color: "#ffa253" }),
      x,
      4.32,
      z,
    );
    flames.push(flame);
    const light = new THREE.PointLight("#ff9b50", 12, 10);
    light.position.set(x, 4.2, z);
    scene.add(light);
  } else {
    const banner = box(
      0.8,
      2,
      0.035,
      i % 2 ? mats.player : mats.enemy,
      x,
      2.2,
      z,
    );
    banner.rotation.y = a;
  }
}
for (let i = 0; i < 16; i++) {
  const a = (i * Math.PI * 2) / 16,
    r = 18 + (i % 3) * 3;
  const tower = box(
    3,
    5 + (i % 5),
    3,
    mats.edge,
    Math.sin(a) * r,
    (5 + (i % 5)) / 2 - 1,
    Math.cos(a) * r,
  );
  tower.rotation.y = a;
}
scene.updateMatrixWorld(true);
const staticByMaterial = new Map();
for (const object of [...scene.children]) {
  if (!object.isMesh || flames.includes(object)) continue;
  const key = object.material.uuid;
  const batch = staticByMaterial.get(key) || {
    material: object.material,
    geometries: [],
  };
  batch.geometries.push(
    object.geometry.clone().applyMatrix4(object.matrixWorld),
  );
  staticByMaterial.set(key, batch);
  scene.remove(object);
  object.geometry.dispose();
}
for (const batch of staticByMaterial.values()) {
  const geometry = mergeGeometries(batch.geometries);
  if (geometry) mesh(geometry, batch.material);
  for (const g of batch.geometries) g.dispose();
}
const motes = Array.from({ length: 70 }, () => ({
  x: (Math.random() - 0.5) * 22,
  y: Math.random() * 7,
  z: (Math.random() - 0.5) * 22,
}));
const moteMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.018, 4, 3),
  new THREE.MeshBasicMaterial({ color: "#d4ad78" }),
  motes.length,
);
scene.add(moteMesh);
const moteMatrix = new THREE.Matrix4();

function batchBone(bone) {
  const batches = new Map();
  for (const child of [...bone.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    const batch = batches.get(child.material) || [];
    batch.push(child);
    batches.set(child.material, batch);
  }
  for (const [material, parts] of batches) {
    if (parts.length < 2) continue;
    const copies = parts.map((part) =>
      part.geometry.clone().applyMatrix4(part.matrix),
    );
    const geometry = mergeGeometries(copies);
    copies.forEach((copy) => copy.dispose());
    if (!geometry) continue;
    mesh(geometry, material, 0, 0, 0, bone);
    // Preserve attachment transforms used by facing diagnostics.
    parts.forEach((part) => {
      part.visible = false;
      part.geometry.dispose();
    });
  }
}

function knight(color) {
  const root = new THREE.Group();
  scene.add(root);
  const body = new THREE.Group();
  root.add(body);
  const cloth = mats[color].clone();
  box(0.62, 0.74, 0.38, cloth, 0, 1.29, 0, body);
  mesh(new THREE.CylinderGeometry(0.4, 0.28, 0.45, 8), cloth, 0, 0.8, 0, body);
  box(0.59, 0.38, 0.4, mats.metal, 0, 1.46, 0.03, body);
  box(0.13, 0.4, 0.03, mats.gold, 0, 1.45, 0.245, body);
  box(0.62, 0.1, 0.4, mats.dark, 0, 1.03, 0, body);
  const helm = mesh(
    new THREE.SphereGeometry(0.245, 12, 10),
    mats.metal,
    0,
    1.97,
    0,
    body,
  );
  helm.scale.y = 1.15;
  const visor = box(0.36, 0.08, 0.09, mats.dark, 0, 1.97, 0.215, body);
  box(0.035, 0.38, 0.025, mats.gold, 0, 2, 0.255, body);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.2, 0.82, 0);
    body.add(leg);
    box(0.23, 0.55, 0.25, mats.dark, 0, -0.28, 0, leg);
    box(0.23, 0.26, 0.29, mats.metal, 0, -0.51, 0.03, leg);
    box(0.25, 0.15, 0.43, mats.dark, 0, -0.75, 0.08, leg);
    legs.push(leg);
    mesh(
      new THREE.SphereGeometry(0.23, 8, 6),
      mats.metal,
      side * 0.45,
      1.65,
      0,
      body,
    );
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.44, 1.61, 0);
    body.add(arm);
    box(0.18, 0.47, 0.2, cloth, 0, -0.22, 0, arm);
    box(0.2, 0.26, 0.21, mats.metal, 0, -0.46, 0, arm);
    mesh(new THREE.SphereGeometry(0.12, 8, 6), mats.dark, 0, -0.61, 0, arm);
    arms.push(arm);
  }
  const sword = new THREE.Group();
  arms[1].add(sword);
  sword.position.set(0, -0.59, 0);
  sword.rotation.x = Math.PI;
  box(0.075, 0.28, 0.08, mats.dark, 0, 0.04, 0, sword);
  box(0.42, 0.06, 0.09, mats.gold, 0, 0.22, 0, sword);
  const bladeMaterial = mats.metal.clone();
  box(0.1, 1.03, 0.035, bladeMaterial, 0, 0.77, 0, sword);
  mesh(new THREE.ConeGeometry(0.075, 0.24, 4), mats.metal, 0, 1.4, 0, sword);
  const cape = box(0.57, 0.95, 0.05, cloth, 0, 1.05, -0.28, body);
  cape.rotation.x = 0.18;
  const ring = mesh(
    new THREE.TorusGeometry(0.66, 0.025, 5, 40),
    new THREE.MeshBasicMaterial({
      color: color === "player" ? "#9ad4d3" : "#e88763",
      transparent: true,
      opacity: 0.7,
    }),
    0,
    0.09,
    0,
    root,
  );
  ring.rotation.x = Math.PI / 2;
  [body, ...arms, ...legs, sword].forEach(batchBone);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(6 * 6 * 3), 3),
  );
  const trail = new THREE.Mesh(
    trailGeometry,
    new THREE.MeshBasicMaterial({
      color: color === "player" ? "#83e5f5" : "#ff9a64",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  trail.frustumCulled = false;
  scene.add(trail);
  return {
    root,
    body,
    arms,
    legs,
    sword,
    ring,
    visor,
    helm,
    cloth,
    bladeMaterial,
    trail,
    trailPoints: [],
    serial: -1,
    startPose: [0, 0, 0],
  };
}
const pVisual = knight("player"),
  eVisual = knight("enemy");
let player = fighter(-1.2, 2),
  enemy = fighter(1.2, -1.4),
  persona = "warden",
  mode = "intro",
  paused = false,
  round = 1,
  pWins = 0,
  eWins = 0,
  noticeTimer = 0,
  clock = 0,
  lastBrain = 0,
  pending = false,
  decision = null,
  decisionAt = 0,
  liveCount = 0,
  failures = 0,
  generation = 0,
  history = [],
  particles = [],
  cameraShake = 0,
  hitstop = 0,
  accumulator = 0,
  soundOn = false,
  audio;
let enemyController = controller(persona);
const keys = new Set(),
  look = new THREE.Vector3(),
  desiredCamera = new THREE.Vector3();
function announce(text, duration = 1.2) {
  $("notice").textContent = text;
  noticeTimer = duration;
}
function tone(freq = 120, type = "triangle", duration = 0.08, volume = 0.06) {
  if (!soundOn) return;
  audio ??= new AudioContext();
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(20, freq * 0.35),
    audio.currentTime + duration,
  );
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}
function burst(f, color) {
  for (let i = 0; i < 12; i++) {
    const m = mesh(
      new THREE.SphereGeometry(0.035, 4, 3),
      new THREE.MeshBasicMaterial({ color }),
      f.x,
      1.4,
      f.z,
    );
    particles.push({
      mesh: m,
      v: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4,
        (Math.random() - 0.5) * 5,
      ),
      life: 0.5,
    });
  }
}
function setGuard(dir) {
  switchGuard(player, dir);
}
function attack(type) {
  if (mode !== "play" || paused) return;
  if (type === "guardbreak" && counterBreak(player, enemy)) {
    announce("COUNTER BREAK", 0.65);
    return;
  }
  const accepted = requestAttack(player, type);
  if (accepted === "rejected" && player.stamina < (specs[type]?.cost || 0)) {
    announce("RECOVER STAMINA", 0.35);
    tone(65, "sine", 0.05);
  }
  if (accepted !== "rejected") {
    history.push(`player used ${type} from ${player.attackDir}`);
    history = history.slice(-8);
    tone(type === "heavy" ? 100 : 180, "sine", 0.09);
  }
}
function playerDodge() {
  if (mode !== "play" || paused) return;
  if (requestDefense(player, "dodge") !== "rejected") {
    const delta = movementVector();
    if (delta.length() < 0.1)
      delta.set(player.x - enemy.x, 0, player.z - enemy.z).normalize();
    player.dx = delta.x;
    player.dz = delta.z;
    tone(180, "sine");
  }
}
function movementVector() {
  const forward = new THREE.Vector3(
    enemy.x - player.x,
    0,
    enemy.z - player.z,
  ).normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  return forward
    .multiplyScalar((keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0))
    .add(
      right.multiplyScalar((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0)),
    )
    .normalize();
}
window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "Tab"].includes(e.code))
    e.preventDefault();
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "escape" && mode === "play") {
    paused = !paused;
    $("paused").classList.toggle("hidden", !paused);
  }
  if (e.repeat || paused) return;
  if (k === "arrowleft" || k === "q") setGuard("left");
  if (k === "arrowup" || k === "e") setGuard("top");
  if (k === "arrowright" || k === "r") setGuard("right");
  if (k === "j") attack("light");
  if (k === "k") attack("heavy");
  if (k === "g") attack("guardbreak");
  if (k === "f" && mode === "play" && feint(player)) {
    announce("FEINT", 0.5);
    history.push("player feinted a heavy to bait defensive reactions");
    history = history.slice(-8);
  }
  if (e.code === "Space") playerDodge();
  if (k === "shift" && mode === "play") requestDefense(player, "parry");
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  if (mode === "play") {
    paused = true;
    $("paused").classList.remove("hidden");
  }
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 0) attack("light");
  else if (e.button === 2) attack("heavy");
});
let guardMouseX = 0,
  guardMouseY = 0;
window.addEventListener("pointermove", (event) => {
  if (mode !== "play" || paused) return;
  guardMouseX += event.movementX;
  guardMouseY += event.movementY;
  if (Math.hypot(guardMouseX, guardMouseY) > 28) {
    if (guardMouseY < -Math.abs(guardMouseX) * 0.8) setGuard("top");
    else if (Math.abs(guardMouseX) > Math.abs(guardMouseY) * 0.6)
      setGuard(guardMouseX < 0 ? "left" : "right");
    guardMouseX = guardMouseY = 0;
  }
});
for (const button of document.querySelectorAll("[data-dir]"))
  button.onclick = () => setGuard(button.dataset.dir);
for (const button of document.querySelectorAll("[data-persona]"))
  button.onclick = () => {
    persona = button.dataset.persona;
    for (const b of document.querySelectorAll("[data-persona]"))
      b.classList.toggle("selected", b === button);
  };
let lowQuality = true,
  renderBudget = 750000,
  slowFramesTime = 0;
function setQuality(low) {
  lowQuality = low;
  renderBudget = low ? 750000 : 2000000;
  renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = !low;
  $("quality").textContent = low ? "QUALITY AUTO" : "QUALITY HIGH";
  resize();
}
$("quality").onclick = () => setQuality(!lowQuality);
setQuality(new URLSearchParams(location.search).get("quality") !== "high");
$("sound").onclick = () => {
  soundOn = !soundOn;
  $("sound").textContent = soundOn ? "SOUND ON" : "SOUND OFF";
  tone(300);
};
$("help").onclick = () => {
  $("instructions").classList.remove("hidden");
  if (mode === "play") paused = true;
};
$("close-help").onclick = () => {
  $("instructions").classList.add("hidden");
  paused = false;
};
function resetRound() {
  generation++;
  enemyController = controller(persona);
  enemyController.cooldown = 0.8;
  hitstop = 0;
  accumulator = 0;
  player = fighter(0, 2);
  enemy = fighter(0, -1);
  enemy.windScale =
    persona === "warden" ? 1.6 : persona === "raider" ? 1.45 : 1.3;
  mode = "play";
  paused = false;
  decision = null;
  lastBrain = -100;
  history = [];
  round = pWins + eWins + 1;
  $("round").textContent = `ROUND ${round}`;
  $("score").textContent =
    `${"● ".repeat(pWins)}${"○ ".repeat(2 - pWins)} / ${"● ".repeat(eWins)}${"○ ".repeat(2 - eWins)}`;
  $("enemy-name").textContent = `THE ${persona.toUpperCase()}`;
  for (const id of ["hud", "guard", "brain", "controls", "combat-read"])
    $(id).classList.remove("hidden");
  $("intro").classList.add("hidden");
  $("result").classList.add("hidden");
  announce("FIGHT", 0.8);
}
$("start").onclick = () => {
  pWins = eWins = 0;
  resetRound();
};
$("next").onclick = () => {
  if (pWins === 2 || eWins === 2) pWins = eWins = 0;
  resetRound();
};
$("menu").onclick = () => {
  mode = "intro";
  $("result").classList.add("hidden");
  $("intro").classList.remove("hidden");
  for (const id of ["hud", "guard", "brain", "controls", "combat-read"])
    $(id).classList.add("hidden");
};
function finish() {
  mode = "result";
  const won = enemy.hp <= 0 && player.hp > 0;
  if (won) pWins++;
  else eWins++;
  const match = pWins === 2 || eWins === 2;
  $("result-label").textContent = match
    ? "DUEL COMPLETE"
    : `ROUND ${round} COMPLETE`;
  $("result-title").textContent = won ? "VICTORY" : "DEFEATED";
  $("result-detail").textContent = match
    ? won
      ? "You held your vow. The ring is yours."
      : "The ring remembers. Return with sharper intent."
    : `${pWins} — ${eWins} · First to two victories`;
  $("next").textContent = match ? "DUEL AGAIN ↗" : "NEXT ROUND ↗";
  $("result").classList.remove("hidden");
}
const bucket = (n) => (n > 65 ? "high" : n > 30 ? "moderate" : "low");
async function think() {
  if (localOnly) {
    showLocalMode();
    return;
  }
  if (pending || mode !== "play" || paused) return;
  pending = true;
  lastBrain = clock;
  const token = generation;
  const state = {
    persona,
    distance:
      Math.hypot(player.x - enemy.x, player.z - enemy.z) < 2.7
        ? "within sword reach"
        : "outside sword reach",
    self: {
      health: bucket(enemy.hp),
      stamina: bucket(enemy.stamina),
      action: enemy.action,
      guard: enemy.guard,
      nearWall: Math.hypot(enemy.x, enemy.z) > 7,
    },
    opponent: {
      health: bucket(player.hp),
      stamina: bucket(player.stamina),
      action: player.action,
      attackDirection: player.attackDir,
      guard: player.guard,
      status:
        player.stun > 0
          ? "staggered and vulnerable"
          : player.action === "recover"
            ? "recovering from a committed action"
            : "ready",
      parryHabit:
        player.parries >= 2
          ? "frequently parries incoming attacks"
          : player.parries
            ? "has parried an attack"
            : "has not parried",
      blockedAttacks:
        player.blocks >= 3 ? "frequently blocks" : "rarely blocks",
    },
    habits: history.slice(-6),
  };
  try {
    const res = await fetch(`${apiBase}/api/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw Error("JEV unavailable");
    const result = await res.json();
    if (mode !== "play" || token !== generation) return;
    decision = result;
    decisionAt = clock;
    liveCount++;
    failures = 0;
    $("connection").textContent = "JEV · LIVE";
    $("connection").classList.remove("offline");
    $("brain-status").textContent = "LIVE";
    $("intent").textContent =
      `${result.tactic} · ${result.attack_direction} · ${result.movement.replaceAll("_", " ")}`;
    $("latency").textContent =
      `${result.latency} ms · ${result.model} · ${liveCount} decisions`;
    $("probabilities").replaceChildren();
    for (const [key, p] of Object.entries(result.probabilities.tactic)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)) {
      const row = document.createElement("div");
      row.className = "prob";
      const name = document.createElement("span");
      name.textContent = key.toUpperCase();
      const bar = document.createElement("div");
      const fill = document.createElement("i");
      fill.style.width = `${p * 100}%`;
      bar.append(fill);
      const num = document.createElement("b");
      num.textContent = `${Math.round(p * 100)}%`;
      row.append(name, bar, num);
      $("probabilities").append(row);
    }
  } catch (e) {
    failures++;
    $("connection").textContent = "JEV · OFFLINE";
    $("connection").classList.add("offline");
    $("brain-status").textContent = "LOCAL";
    $("latency").textContent = "Local sparring fallback · retrying JEV";
  } finally {
    pending = false;
  }
}
let localPlan = null,
  localPlanAt = -10;
function localDecision() {
  if (localPlan && clock - localPlanAt < 0.35) return localPlan;
  localPlanAt = clock;
  return (localPlan = {
    tactic:
      player.action !== "idle"
        ? "defend"
        : Math.random() < 0.7
          ? "light"
          : "heavy",
    attack_direction: directions[Math.floor(Math.random() * 3)],
    guard_direction: directions[Math.floor(Math.random() * 3)],
    on_light: Math.random() < 0.55 ? "block" : "interrupt",
    on_heavy: persona === "raider" ? "interrupt" : "parry",
    on_guardbreak: "counter",
    movement:
      Math.hypot(player.x - enemy.x, player.z - enemy.z) > 2.5
        ? "advance"
        : "hold",
    source: "local",
  });
}
function ai(dt) {
  const d = decision && clock - decisionAt < 5 ? decision : localDecision();
  stepAI(enemyController, enemy, player, d, dt);
}
function impact(a, b, strike, outcome) {
  if (["hit", "block", "parry", "break", "counter"].includes(outcome))
    hitstop = outcome === "parry" ? 0.025 : outcome === "hit" ? 0.012 : 0;
  if (outcome === "hit" || outcome === "break") {
    burst(b, "#e9a16e");
    cameraShake = 0.065;
    tone(75, "sawtooth", 0.16, 0.1);
    announce(
      outcome === "break"
        ? "GUARD BROKEN"
        : a === player
          ? "STRIKE"
          : "WOUNDED",
      0.25,
    );
  } else if (outcome === "block" || outcome === "parry") {
    burst(b, "#d3e8ed");
    tone(outcome === "parry" ? 850 : 570, "triangle", 0.18, 0.08);
    announce(outcome === "parry" ? "PARRY · COUNTER NOW" : "BLOCK", 0.25);
  } else if (outcome === "counter") {
    tone(400);
    announce("COUNTER BREAK", 0.6);
  } else if (outcome === "evade") announce("EVADED", 0.5);
}
function animateKnight(v, f, other, dt) {
  v.cloth.emissive.setRGB(f.hitFlash * 3, f.hitFlash * 2, f.hitFlash);
  v.root.position.set(f.x, 0, f.z);
  v.root.rotation.y = yawToTarget(f, other);
  const moving = f.moving || f.dodge > 0;
  const stride = moving ? Math.sin(clock * 10) * 0.4 : 0;
  v.legs[0].rotation.x = stride;
  v.legs[1].rotation.x = -stride;
  v.body.position.y =
    Math.sin(clock * (moving ? 10 : 2)) * (moving ? 0.035 : 0.014);
  v.body.rotation.x = f.dodge > 0 ? 0.3 : 0;
  const pose = swordPose(f);
  if (v.serial !== f.attackSerial) {
    v.serial = f.attackSerial;
    v.startPose = [
      v.arms[1].rotation.x,
      v.arms[1].rotation.z,
      v.arms[1].rotation.y,
    ];
    v.trailPoints.length = 0;
  }
  // Blend only the first 45 ms into a new swing, then follow its actual timeline.
  const entry = specs[f.action] ? Math.min(1, f.elapsed / 0.045) : 1;
  const target = pose.map((value, i) =>
    specs[f.action]
      ? THREE.MathUtils.lerp(v.startPose[i], value, entry)
      : value,
  );
  const blend =
    specs[f.action] || f.action === "recover" ? 1 : 1 - Math.exp(-dt * 30);
  ["x", "z", "y"].forEach(
    (axis, i) =>
      (v.arms[1].rotation[axis] = THREE.MathUtils.lerp(
        v.arms[1].rotation[axis],
        target[i],
        blend,
      )),
  );
  const cut = specs[f.action] && f.elapsed / f.wind > 0.32;
  v.bladeMaterial.emissive.set(
    cut ? (v === pVisual ? "#3baabf" : "#ea673d") : "#000000",
  );
  v.root.updateMatrixWorld(true);
  if (cut || (f.action === "recover" && f.elapsed < 0.07 && !f.feinted)) {
    v.trailPoints.unshift([
      v.sword.localToWorld(new THREE.Vector3(0, 0.3, 0)),
      v.sword.localToWorld(new THREE.Vector3(0, 1.48, 0)),
    ]);
    v.trailPoints.length = Math.min(v.trailPoints.length, 7);
  } else v.trailPoints.length = 0;
  const points = v.trailPoints,
    positions = v.trail.geometry.attributes.position;
  let count = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const point of [
      points[i][0],
      points[i][1],
      points[i + 1][1],
      points[i][0],
      points[i + 1][1],
      points[i + 1][0],
    ])
      positions.setXYZ(count++, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  v.trail.geometry.setDrawRange(0, count);
  v.trail.visible = count > 0;
  v.body.rotation.y =
    specs[f.action] && f.action !== "guardbreak"
      ? (f.attackDir === "left" ? -1 : f.attackDir === "right" ? 1 : 0) *
        (0.16 - 0.32 * Math.min(1, f.elapsed / f.wind))
      : THREE.MathUtils.damp(v.body.rotation.y, 0, 30, dt);
  v.arms[0].rotation.x = -0.7;
  v.arms[0].rotation.z = -0.15;
  v.root.rotation.z = f.stun > 0 ? Math.sin(clock * 25) * 0.04 : 0;
  if (f.hp <= 0) {
    v.body.rotation.z = THREE.MathUtils.damp(v.body.rotation.z, 1.3, 4, dt);
    v.body.position.y = -0.4;
  } else v.body.rotation.z = THREE.MathUtils.damp(v.body.rotation.z, 0, 8, dt);
}
function resize() {
  const budget = renderBudget;
  renderer.setPixelRatio(
    Math.min(
      lowQuality ? 1 : devicePixelRatio,
      Math.sqrt(budget / (innerWidth * innerHeight)),
    ),
  );
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
function simulate(dt) {
  if (hitstop > 0) {
    hitstop = Math.max(0, hitstop - dt);
    return;
  }
  stepDuel(player, enemy, dt, {
    move: movementVector(),
    enemyStep: ai,
    onImpact: impact,
  });
  if (player.hp <= 0 || enemy.hp <= 0) finish();
}
let frameTime = 1 / 60;
let prev = performance.now();
function frame(now) {
  const rawDt = (now - prev) / 1000;
  frameTime = frameTime * 0.9 + rawDt * 0.1;
  if (lowQuality && !document.hidden && frameTime > 0.033) {
    slowFramesTime += Math.min(rawDt, 0.1);
    if (slowFramesTime > 1 && renderBudget > 250000) {
      renderBudget = Math.max(250000, renderBudget * 0.7);
      resize();
      slowFramesTime = 0;
    }
  } else slowFramesTime = 0;
  const dt = Math.min(0.25, rawDt);
  prev = now;
  clock += dt;
  if (mode === "play" && !paused) {
    accumulator += dt;
    while (accumulator >= 1 / 120 && mode === "play") {
      accumulator -= 1 / 120;
      simulate(1 / 120);
    }
    if (clock - lastBrain > (failures ? 3 : 0.65)) think();
  } else accumulator = 0;
  if (!paused) {
    animateKnight(pVisual, player, enemy, dt);
    animateKnight(eVisual, enemy, player, dt);
  }
  if (mode === "intro") {
    desiredCamera.set(9, 5.5, 11);
    look.set(-0.5, 1, 0);
  } else {
    const offset = new THREE.Vector3(
      player.x - enemy.x,
      0,
      player.z - enemy.z,
    ).normalize();
    desiredCamera.set(
      (player.x + enemy.x) / 2 + offset.x * 2.8 + offset.z * 7.5,
      5.3,
      (player.z + enemy.z) / 2 + offset.z * 2.8 - offset.x * 7.5,
    );
    look.set((player.x + enemy.x) / 2, 1, (player.z + enemy.z) / 2);
  }
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 12));
  if (cameraShake > 0) {
    cameraShake -= dt;
    camera.position.x += (Math.random() - 0.5) * cameraShake;
  }
  camera.lookAt(look);
  for (const [id, value] of [
    ["p-health", player.hp],
    ["p-stamina", player.stamina],
    ["e-health", enemy.hp],
    ["e-stamina", enemy.stamina],
  ])
    $(id).style.width = `${value}%`;
  for (const b of document.querySelectorAll("[data-dir]")) {
    b.classList.toggle("active", b.dataset.dir === player.guard);
    b.classList.toggle(
      "threat",
      !!specs[enemy.action] && enemy.attackDir === b.dataset.dir,
    );
  }
  const incoming = specs[enemy.action];
  const enemyScreen = new THREE.Vector3(enemy.x, 2.55, enemy.z).project(camera);
  const enemyX = (enemyScreen.x * 0.5 + 0.5) * innerWidth,
    enemyY = (-enemyScreen.y * 0.5 + 0.5) * innerHeight;
  $("combat-read").style.left =
    `${Math.max(130, Math.min(innerWidth - 130, enemyX))}px`;
  $("combat-read").style.top = `${Math.max(170, enemyY - 112)}px`;
  $("enemy-guard").textContent =
    `GUARD ${enemy.guard === "left" ? "◀" : enemy.guard === "right" ? "▶" : "▲"}`;
  $("enemy-guard").classList.toggle(
    "opening",
    enemy.stun > 0 || enemy.action === "recover",
  );
  $("enemy-guard").textContent =
    enemy.stun > 0
      ? "OPEN · COUNTERATTACK"
      : enemy.action === "recover"
        ? "OPEN · RECOVERING"
        : $("enemy-guard").textContent;
  $("attack-arrow").textContent = incoming
    ? enemy.action === "guardbreak"
      ? "✊"
      : enemy.attackDir === "left"
        ? "◀"
        : enemy.attackDir === "right"
          ? "▶"
          : "▲"
    : "";
  $("combat-read").classList.toggle(
    "matched",
    !!incoming && enemy.attackDir === player.guard,
  );
  $("guard-label").textContent = `YOUR GUARD · ${player.guard.toUpperCase()}`;

  $("combat-read").classList.toggle("inactive", !incoming);
  $("attack-read").textContent = incoming
    ? enemy.action === "guardbreak"
      ? "GRAB · G TO COUNTER"
      : `${enemy.action.toUpperCase()} · ${enemy.attackDir.toUpperCase()}`
    : "";
  $("attack-progress").style.width = incoming
    ? `${Math.min(100, (enemy.elapsed / enemy.wind) * 100)}%`
    : "0%";
  $("player-read").textContent =
    player.grabbed > 0
      ? "G · COUNTER NOW"
      : player.exhausted
        ? "EXHAUSTED · RECOVER"
        : player.buffer
          ? "FOLLOW-UP BUFFERED"
          : player.action === "parry"
            ? "PARRY"
            : player.chain > 1
              ? `CHAIN ${player.chain}/4`
              : player.stamina < 20
                ? "LOW STAMINA"
                : "";
  if (noticeTimer > 0) {
    noticeTimer -= dt;
    if (noticeTimer <= 0) $("notice").textContent = "";
  }
  for (const flame of flames) {
    flame.scale.y = 1 + Math.sin(clock * 14 + flame.position.x) * 0.14;
    flame.rotation.y = clock * 2;
  }
  for (let i = 0; i < motes.length; i++) {
    const mote = motes[i];
    mote.y += dt * 0.11;
    if (mote.y > 7) mote.y = 0;
    moteMatrix.makeTranslation(mote.x, mote.y, mote.z);
    moteMesh.setMatrixAt(i, moteMatrix);
  }
  moteMesh.instanceMatrix.needsUpdate = true;
  particles = particles.filter((p) => {
    p.life -= dt;
    p.mesh.position.addScaledVector(p.v, dt);
    p.v.y -= dt * 8;
    p.mesh.scale.setScalar(Math.max(0, p.life * 2));
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      return false;
    }
    return true;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (localOnly) showLocalMode();
else
  fetch(`${apiBase}/api/health`)
    .then((r) => r.json())
    .then((s) => {
      $("connection").textContent = s.keyConfigured
        ? "JEV · READY"
        : "JEV · KEY MISSING";
      $("connection").classList.toggle("offline", !s.keyConfigured);
    })
    .catch(() => {
      $("connection").textContent = "JEV · OFFLINE";
    });
// Read-only diagnostics for automated gameplay verification.
function visualFacing(v, f, other) {
  v.root.updateMatrixWorld(true);
  const front = v.visor
    .getWorldPosition(new THREE.Vector3())
    .sub(v.helm.getWorldPosition(new THREE.Vector3()));
  front.y = 0;
  front.normalize();
  const target = new THREE.Vector3(other.x - f.x, 0, other.z - f.z).normalize();
  return {
    dot: front.dot(target),
    front: { x: front.x, z: front.z },
    target: { x: target.x, z: target.z },
  };
}
window.__IRON_VOW__ = {
  getState: () => ({
    mode,
    paused,
    round,
    pWins,
    eWins,
    player: { ...player },
    enemy: { ...enemy },
    liveCount,
    decision,
    failures,
    ai: {
      reactions: enemyController.reactions,
      lastReaction: enemyController.lastReaction,
      decisionUsed: enemyController.decisionUsed,
    },
    facing: {
      player: visualFacing(pVisual, player, enemy),
      enemy: visualFacing(eVisual, enemy, player),
    },
    renderedFrames: renderer.info.render.frame,
    fps: Math.round(1 / frameTime),
    drawCalls: renderer.info.render.calls,
  }),
};
