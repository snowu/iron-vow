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
import {
  createBrain,
  duelState,
  requestDecision,
  liveDecision,
} from "./brain.js";
const $ = (id) => document.getElementById(id),
  canvas = $("arena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0c1420");
scene.fog = new THREE.FogExp2("#0c1420", 0.04);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
camera.position.set(10, 7, 12);
scene.add(new THREE.HemisphereLight("#b8dceb", "#1b2239", 1.55));
const sun = new THREE.DirectionalLight("#e3f2ff", 2.1);
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
  stone: new THREE.MeshLambertMaterial({ color: "#263747" }),
  edge: new THREE.MeshLambertMaterial({ color: "#131e2b" }),
  metal: new THREE.MeshLambertMaterial({
    color: "#35495d",
  }),
  dark: new THREE.MeshLambertMaterial({
    color: "#111b2b",
  }),
  gold: new THREE.MeshLambertMaterial({
    color: "#94b7c7",
  }),
  player: new THREE.MeshLambertMaterial({ color: "#23aabb" }),
  enemy: new THREE.MeshLambertMaterial({ color: "#e46453" }),
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
// A quiet training ring: the silhouettes and weapon paths carry the scene.
mesh(new THREE.CylinderGeometry(9, 9.2, 0.5, 48), mats.edge, 0, -0.3, 0);
mesh(new THREE.CylinderGeometry(8.9, 8.9, 0.1, 48), mats.stone, 0, -0.03, 0);
const boundary = mesh(
  new THREE.TorusGeometry(8.3, 0.035, 4, 80),
  new THREE.MeshBasicMaterial({ color: "#5d7d85" }),
  0,
  0.04,
  0,
);
boundary.rotation.x = Math.PI / 2;
const ground = mesh(new THREE.PlaneGeometry(300, 300), mats.edge, 0, -0.6, 0);
ground.rotation.x = -Math.PI / 2;
const flames = [];
for (let i = 0; i < 12; i++) {
  const angle = (i * Math.PI) / 6;
  const pillar = box(
    0.35,
    1.7,
    0.35,
    mats.edge,
    Math.sin(angle) * 10.3,
    0.4,
    Math.cos(angle) * 10.3,
  );
  pillar.rotation.y = angle;
  box(
    0.08,
    0.9,
    0.08,
    new THREE.MeshBasicMaterial({ color: i % 2 ? "#ef7966" : "#51c8d1" }),
    Math.sin(angle) * 10.05,
    0.8,
    Math.cos(angle) * 10.05,
  );
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
  mesh(new THREE.CylinderGeometry(0.3, 0.23, 0.65, 4), cloth, 0, 1.34, 0, body);
  mesh(
    new THREE.CylinderGeometry(0.25, 0.22, 0.25, 6),
    cloth,
    0,
    0.96,
    0,
    body,
  );
  box(0.38, 0.3, 0.33, mats.metal, 0, 1.49, 0.045, body);
  box(0.035, 0.25, 0.025, mats.gold, 0, 1.48, 0.222, body);
  box(0.49, 0.08, 0.35, mats.dark, 0, 1.03, 0, body);
  const helm = mesh(
    new THREE.IcosahedronGeometry(0.21, 0),
    mats.metal,
    0,
    1.97,
    0,
    body,
  );
  helm.scale.set(0.88, 1.2, 0.95);
  const visor = box(
    0.27,
    0.045,
    0.055,
    new THREE.MeshBasicMaterial({
      color: color === "player" ? "#90f4f8" : "#ffd0ac",
    }),
    0,
    1.98,
    0.2,
    body,
  );

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.17, 0.9, 0);
    body.add(leg);
    box(0.16, 0.36, 0.18, mats.dark, 0, -0.18, 0, leg);
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    leg.add(knee);
    box(0.15, 0.38, 0.18, mats.metal, 0, -0.19, 0, knee);
    box(0.19, 0.12, 0.33, mats.dark, 0, -0.42, 0.08, knee);
    leg.userData.knee = knee;

    legs.push(leg);
    mesh(
      new THREE.IcosahedronGeometry(0.16, 0),
      mats.metal,
      side * 0.34,
      1.65,
      0,
      body,
    );
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.32, 1.61, 0);
    body.add(arm);
    box(0.13, 0.29, 0.15, cloth, 0, -0.145, 0, arm);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    arm.add(elbow);
    box(0.14, 0.25, 0.17, mats.metal, 0, -0.125, 0, elbow);
    box(0.13, 0.13, 0.13, mats.dark, 0, -0.3, 0, elbow);
    const wrist = new THREE.Group();
    wrist.position.y = -0.3;
    elbow.add(wrist);
    arm.userData.wrist = wrist;
    arm.userData.elbow = elbow;
    arms.push(arm);
  }
  const sword = new THREE.Group();
  arms[1].userData.wrist.add(sword);
  sword.position.set(0, 0, 0);
  sword.rotation.x = Math.PI;
  box(0.075, 0.28, 0.08, mats.dark, 0, 0.04, 0, sword);
  box(0.42, 0.06, 0.09, mats.gold, 0, 0.22, 0, sword);
  const bladeMaterial = mats.metal.clone();
  box(0.075, 1.15, 0.025, bladeMaterial, 0, 0.82, 0, sword);
  mesh(new THREE.ConeGeometry(0.055, 0.22, 4), bladeMaterial, 0, 1.4, 0, sword);
  box(0.4, 0.28, 0.035, cloth, 0, 0.96, -0.23, body);
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
  const shadow = mesh(
    new THREE.CircleGeometry(0.65, 24),
    new THREE.MeshBasicMaterial({
      color: "#060c13",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    0,
    0.065,
    0,
    root,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 0.75, 1);
  [
    body,
    ...arms,
    ...legs,
    ...arms.map((a) => a.userData.elbow),
    ...legs.map((l) => l.userData.knee),
    sword,
  ].forEach(batchBone);
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
  playerPersona = "raider",
  battleMode = "human",
  mode = "intro",
  paused = false,
  round = 1,
  pWins = 0,
  eWins = 0,
  noticeTimer = 0,
  clock = 0,
  generation = 0,
  history = [],
  particles = [],
  cameraShake = 0,
  hitstop = 0,
  accumulator = 0,
  soundOn = false,
  audio;
let enemyController = controller(persona),
  playerController = controller(playerPersona);
let brains = { enemy: createBrain(), player: createBrain() };
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
let manualOverride = null;
function setGuard(dir) {
  if (battleMode === "ai") return;
  manualOverride = dir;
  switchGuard(player, dir);
}
function attack(type) {
  if (mode !== "play" || paused || battleMode === "ai") return;
  if (type === "guardbreak" && counterBreak(player, enemy)) {
    announce("COUNTER BREAK", 0.65);
    return;
  }
  if (!$("manual-directions").checked && type !== "guardbreak") {
    switchGuard(
      player,
      manualOverride ||
        (type === "heavy" ? "top" : player.attackSerial % 2 ? "right" : "left"),
    );
    manualOverride = null;
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
  if (mode !== "play" || paused || battleMode === "ai") return;
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
  const forward = camera.getWorldDirection(new THREE.Vector3());
  forward.y = 0;
  forward.normalize();
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
  if (e.repeat || paused || battleMode === "ai") return;
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
  if (k === "shift" && mode === "play") {
    if (!$("manual-directions").checked && specs[enemy.action])
      switchGuard(player, enemy.attackDir);
    requestDefense(player, "parry");
  }
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
  if (
    mode !== "play" ||
    paused ||
    battleMode === "ai" ||
    !$("manual-directions").checked
  )
    return;
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
$("insights").onclick = () => {
  document.body.classList.toggle("show-insights");
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
  playerController = controller(playerPersona);
  playerController.cooldown = 0.8;
  brains = { enemy: createBrain(), player: createBrain() };
  keys.clear();
  manualOverride = null;
  hitstop = 0;
  accumulator = 0;
  player = fighter(0, 2);
  enemy = fighter(0, -1);
  enemy.windScale =
    persona === "warden" ? 1.6 : persona === "raider" ? 1.45 : 1.3;
  mode = "play";
  paused = false;
  if (battleMode === "ai")
    player.windScale =
      playerPersona === "warden"
        ? 1.6
        : playerPersona === "raider"
          ? 1.45
          : 1.3;
  history = [];
  round = pWins + eWins + 1;
  $("round").textContent = `ROUND ${round}`;
  $("score").textContent =
    `${"● ".repeat(pWins)}${"○ ".repeat(2 - pWins)} / ${"● ".repeat(eWins)}${"○ ".repeat(2 - eWins)}`;
  $("enemy-name").textContent = `THE ${persona.toUpperCase()}`;
  for (const id of [
    "hud",
    "guard",
    "brain",
    "controls",
    "combat-read",
    "player-read",
  ])
    $(id).classList.remove("hidden");
  $("intro").classList.add("hidden");
  $("result").classList.add("hidden");
  $("player-name").textContent =
    battleMode === "ai" ? `BLUE · ${playerPersona.toUpperCase()}` : "YOU";
  $("player-subtitle").textContent = battleMode === "ai" ? "JEV" : "THE EXILE";
  $("enemy-brain-caption").textContent =
    battleMode === "ai" ? "RED FIGHTER · JEV" : "THE OPPONENT'S MIND";
  $("enemy-name").textContent =
    battleMode === "ai"
      ? `RED · ${persona.toUpperCase()}`
      : `THE ${persona.toUpperCase()}`;
  $("guard").classList.toggle(
    "hidden",
    battleMode === "ai" || !$("manual-directions").checked,
  );
  $("controls").classList.toggle("hidden", battleMode === "ai");
  $("brain-player").classList.toggle("hidden", battleMode !== "ai");
  $("spectator-hint").classList.toggle("hidden", battleMode !== "ai");
  $("spectator-hint").textContent = "JEV vs JEV · ESC TO PAUSE";
  $("brain-status").textContent = localOnly ? "LOCAL" : "CONNECTING";
  $("intent").textContent = "Reading the arena";
  $("probabilities").replaceChildren();
  $("latency").textContent = "Waiting for JEV";
  $("player-brain-status").textContent = "CONNECTING";
  $("player-intent").textContent = "Reading the arena";
  $("player-probabilities").replaceChildren();
  $("player-latency").textContent = "Waiting for JEV";
  announce(battleMode === "ai" ? "JEV vs JEV" : "FIGHT", 0.8);
}
for (const button of document.querySelectorAll("[data-mode]"))
  button.onclick = () => {
    battleMode = button.dataset.mode;
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) => b.classList.toggle("selected", b === button));
    $("blue-select").classList.toggle("hidden", battleMode !== "ai");
    $("start").innerHTML =
      battleMode === "ai"
        ? "WATCH DUEL <span>↗</span>"
        : "ENTER THE RING <span>↗</span>";
  };
$("player-persona").onchange = () => {
  playerPersona = $("player-persona").value;
};
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
  generation++;
  $("brain-player").classList.add("hidden");
  $("spectator-hint").classList.add("hidden");
  $("result").classList.add("hidden");
  $("intro").classList.remove("hidden");
  for (const id of [
    "hud",
    "guard",
    "brain",
    "controls",
    "combat-read",
    "player-read",
  ])
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
  $("result-title").textContent =
    battleMode === "ai"
      ? `${won ? "BLUE" : "RED"} WINS`
      : won
        ? "VICTORY"
        : "DEFEATED";
  $("result-detail").textContent =
    battleMode === "ai"
      ? `${playerPersona.toUpperCase()} ${pWins} — ${eWins} ${persona.toUpperCase()}`
      : match
        ? won
          ? "You held your vow. The ring is yours."
          : "The ring remembers. Return with sharper intent."
        : `${pWins} — ${eWins} · First to two victories`;
  $("next").textContent = match ? "DUEL AGAIN ↗" : "NEXT ROUND ↗";
  $("result").classList.remove("hidden");
  if (battleMode === "ai" && $("auto-rounds").checked) {
    const finishedGeneration = generation;
    setTimeout(() => {
      if (
        generation === finishedGeneration &&
        mode === "result" &&
        battleMode === "ai" &&
        $("auto-rounds").checked
      ) {
        if (match) pWins = eWins = 0;
        resetRound();
      }
    }, 2500);
  }
}
function textIfChanged(id, text) {
  if ($(id).textContent !== text) $(id).textContent = text;
}
function updateConnection() {
  if (battleMode === "ai") {
    const blue = !!liveDecision(brains.player, clock),
      red = !!liveDecision(brains.enemy, clock);
    textIfChanged(
      "connection",
      blue && red ? "JEV vs JEV · LIVE" : "JEV vs JEV · WAITING",
    );
    $("connection").classList.toggle("offline", !blue || !red);
    textIfChanged(
      "spectator-hint",
      blue && red
        ? "JEV vs JEV · ESC TO PAUSE"
        : "WAITING FOR BOTH JEV BRAINS · RETRYING",
    );
  } else {
    const live = brains.enemy.failures === 0 && brains.enemy.decision;
    textIfChanged("connection", live ? "JEV · LIVE" : "JEV · OFFLINE");
    $("connection").classList.toggle("offline", !live);
  }
}
async function think(side = "enemy") {
  if (localOnly || mode !== "play" || paused) return;
  const brain = brains[side],
    token = generation;
  const state =
    side === "enemy"
      ? duelState(enemy, player, persona, history)
      : duelState(player, enemy, playerPersona, history);
  const status = await requestDecision(brain, state, {
    apiBase,
    now: () => clock,
    isCurrent: () => token === generation && mode === "play",
  });
  if (status === "stale" || status === "busy") return;
  const prefix = side === "player" ? "player-" : "";
  $(prefix + "brain-status").textContent =
    status === "live" ? "LIVE" : battleMode === "ai" ? "WAITING" : "LOCAL";
  if (status === "live") {
    const result = brain.decision;
    $(prefix + "intent").textContent =
      `${result.tactic} · ${result.attack_direction} · ${result.movement.replaceAll("_", " ")}`;
    $(prefix + "latency").textContent =
      `${result.latency} ms · ${result.model} · ${brain.liveCount} decisions`;
    $(prefix + "probabilities").replaceChildren();
    for (const [key, p] of Object.entries(result.probabilities.tactic)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)) {
      const row = document.createElement("div");
      row.className = "prob";
      const name = document.createElement("span");
      name.textContent = key.toUpperCase();
      const bar = document.createElement("div"),
        fill = document.createElement("i");
      fill.style.width = `${p * 100}%`;
      bar.append(fill);
      const num = document.createElement("b");
      num.textContent = `${Math.round(p * 100)}%`;
      row.append(name, bar, num);
      $(prefix + "probabilities").append(row);
    }
  } else
    $(prefix + "latency").textContent =
      battleMode === "ai"
        ? "JEV unavailable · waiting and retrying"
        : "Local sparring fallback · retrying JEV";
  updateConnection();
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
  if (battleMode === "ai") {
    const blue = liveDecision(brains.player, clock),
      red = liveDecision(brains.enemy, clock);
    if (!blue || !red) {
      player.moving = enemy.moving = false;
      return;
    }
    stepAI(playerController, player, enemy, blue, dt);
    stepAI(enemyController, enemy, player, red, dt);
  } else {
    const brain = brains.enemy;
    const d =
      brain.decision && clock - brain.decisionAt < 5
        ? brain.decision
        : localDecision();
    stepAI(enemyController, enemy, player, d, dt);
  }
}
function impact(a, b, strike, outcome) {
  if (battleMode === "ai") {
    history.push(
      `${a === player ? "blue" : "red"} used ${strike.type} from ${strike.dir}: ${outcome}`,
    );
    history = history.slice(-8);
  }
  if (["hit", "block", "parry", "break", "counter"].includes(outcome))
    hitstop = outcome === "parry" ? 0.025 : outcome === "hit" ? 0.012 : 0;
  if (outcome === "hit" || outcome === "break") {
    burst(b, "#e9a16e");
    cameraShake = 0.065;
    tone(75, "sawtooth", 0.16, 0.1);
    announce(
      outcome === "break"
        ? "GUARD BROKEN"
        : battleMode === "ai"
          ? `${a === player ? "BLUE" : "RED"} HIT`
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
  } else if (outcome === "evade") announce("EVADED", 0.35);
  else if (outcome === "miss" && (a === player || battleMode === "ai"))
    announce(
      battleMode === "ai"
        ? `${a === player ? "BLUE" : "RED"} MISSED`
        : "MISSED · CLOSE THE GAP",
      0.3,
    );
}
function animateKnight(v, f, other, dt) {
  v.cloth.emissive.setRGB(f.hitFlash * 3, f.hitFlash * 2, f.hitFlash);
  v.root.position.set(f.x, 0, f.z);
  v.root.rotation.y = yawToTarget(f, other);
  const moving = f.moving || f.dodge > 0;
  const travelled = Math.hypot(
    f.x - (v.previousX ?? f.x),
    f.z - (v.previousZ ?? f.z),
  );
  v.previousX = f.x;
  v.previousZ = f.z;
  v.gait = (v.gait || 0) + travelled * 7;
  const stride = moving ? Math.sin(v.gait) * 0.35 : 0;
  v.legs[0].rotation.x = stride;
  v.legs[1].rotation.x = -stride;
  v.legs[0].userData.knee.rotation.x = Math.max(0, stride) * 1.2 + 0.12;
  v.legs[1].userData.knee.rotation.x = Math.max(0, -stride) * 1.2 + 0.12;

  v.body.position.y = moving ? Math.abs(stride) * 0.045 : 0;
  v.body.rotation.x = THREE.MathUtils.damp(
    v.body.rotation.x,
    f.stun > 0 ? -0.35 : f.dodge > 0 ? 0.45 : specs[f.action] ? 0.08 : 0,
    25,
    dt,
  );
  let pose = swordPose(f);

  if (v.serial !== f.attackSerial) {
    v.serial = f.attackSerial;
    v.startPose = [
      v.arms[1].rotation.x,
      v.arms[1].rotation.z,
      v.arms[1].rotation.y,
      v.arms[1].userData.elbow.rotation.x,
      v.arms[1].userData.wrist.rotation.x,
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
  // Shoulder rotation follows the shortest arc; elbows bend forward in one plane.
  const shoulderTarget = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(target[0], target[2], target[1]),
  );
  v.arms[1].quaternion.slerp(shoulderTarget, blend);
  v.arms[1].userData.elbow.rotation.x = THREE.MathUtils.lerp(
    v.arms[1].userData.elbow.rotation.x,
    target[3],
    blend,
  );
  v.arms[1].userData.wrist.rotation.x = THREE.MathUtils.lerp(
    v.arms[1].userData.wrist.rotation.x,
    target[4],
    blend,
  );
  const cut = specs[f.action] && f.elapsed > f.wind - 0.085;
  v.bladeMaterial.emissive.set(
    cut ? (v === pVisual ? "#3baabf" : "#ea673d") : "#000000",
  );
  v.body.rotation.y =
    specs[f.action] && f.action !== "guardbreak"
      ? (f.attackDir === "left" ? -1 : f.attackDir === "right" ? 1 : 0) *
        (0.16 - 0.32 * Math.min(1, f.elapsed / f.wind))
      : THREE.MathUtils.damp(v.body.rotation.y, 0, 30, dt);
  const grabExtension =
    f.action === "guardbreak"
      ? Math.sin((Math.min(1, f.elapsed / f.wind) * Math.PI) / 2)
      : 0;
  const defending =
    f.action === "parry" || f.blockFlash > 0 || f.parryFlash > 0;
  v.arms[0].rotation.x = THREE.MathUtils.damp(
    v.arms[0].rotation.x,
    defending ? -0.65 : -0.35 - grabExtension * 0.95 + stride * 0.3,
    30,
    dt,
  );
  v.arms[0].rotation.z = THREE.MathUtils.damp(
    v.arms[0].rotation.z,
    defending ? -0.3 : -0.2,
    30,
    dt,
  );
  v.arms[0].userData.elbow.rotation.x = THREE.MathUtils.damp(
    v.arms[0].userData.elbow.rotation.x,
    -1.05 + grabExtension * 0.8,
    30,
    dt,
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
  v.root.rotation.z = 0;
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
    move: battleMode === "ai" ? { x: 0, z: 0 } : movementVector(),
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
    const interval = battleMode === "ai" ? 1.1 : 0.65;
    if (
      !localOnly &&
      clock - brains.enemy.lastBrain > (brains.enemy.failures ? 3 : interval)
    )
      think("enemy");
    if (battleMode === "ai") {
      if (
        !localOnly &&
        clock - brains.player.lastBrain >
          (brains.player.failures ? 3 : interval) &&
        clock - brains.enemy.lastBrain > 0.3
      )
        think("player");
      updateConnection();
    }
  } else accumulator = 0;
  if (!paused) {
    animateKnight(pVisual, player, enemy, dt);
    animateKnight(eVisual, enemy, player, dt);
  }
  if (mode === "intro") {
    desiredCamera.set(8, 5, 7);
    look.set(-0.5, 1, 0);
  } else {
    const distance = Math.hypot(player.x - enemy.x, player.z - enemy.z);
    const zoom = Math.max(1, Math.min(1.65, distance / 5));
    desiredCamera.set(
      (player.x + enemy.x) / 2 + 8 * zoom,
      5.8 * zoom,
      (player.z + enemy.z) / 2 + 4.2 * zoom,
    );
    look.set((player.x + enemy.x) / 2, 1, (player.z + enemy.z) / 2);
  }
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 7));
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
      ? battleMode === "ai"
        ? "RED GRAB"
        : "GRAB · G TO COUNTER"
      : `${enemy.action.toUpperCase()} · ${enemy.attackDir.toUpperCase()}`
    : "";
  $("attack-progress").style.width = incoming
    ? `${Math.min(100, (enemy.elapsed / enemy.wind) * 100)}%`
    : "0%";
  $("player-read").textContent =
    battleMode === "ai"
      ? `BLUE · ${player.action.toUpperCase()} · ${player.guard.toUpperCase()}`
      : player.grabbed > 0
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
                  : Math.hypot(player.x - enemy.x, player.z - enemy.z) >
                      specs.light.reach
                    ? "CLOSE THE GAP"
                    : "IN RANGE";
  if (noticeTimer > 0) {
    noticeTimer -= dt;
    if (noticeTimer <= 0) $("notice").textContent = "";
  }
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
    battleMode,
    playerPersona,
    persona,
    liveCount: brains.enemy.liveCount,
    decision: brains.enemy.decision,
    failures: brains.enemy.failures,
    brains: { player: { ...brains.player }, enemy: { ...brains.enemy } },
    ai: {
      reactions: enemyController.reactions,
      lastReaction: enemyController.lastReaction,
      decisionUsed: enemyController.decisionUsed,
    },
    cameraForward: (() => {
      const f = camera.getWorldDirection(new THREE.Vector3());
      return { x: f.x, z: f.z };
    })(),
    facing: {
      player: visualFacing(pVisual, player, enemy),
      enemy: visualFacing(eVisual, enemy, player),
    },
    renderedFrames: renderer.info.render.frame,
    fps: Math.round(1 / frameTime),
    drawCalls: renderer.info.render.calls,
  }),
};
