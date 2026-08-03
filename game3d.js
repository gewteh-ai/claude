/* ============================================================
   PRAWN DASH 3D — endless reef runner (Three.js)
   Lane runner: dodge coral, grab pearls, open mystery boxes,
   fill the JET, evolve prawn -> leviathan, complete missions.
   Three.js is loaded globally from a CDN in index.html.
   ============================================================ */
(() => {
  "use strict";

  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);

  if (!THREE) {
    const le = $("load-error"); if (le) le.classList.remove("hidden");
    return;
  }

  // ---------------- DOM ----------------
  const el = {
    canvas: $("game"),
    hud: $("hud"), dist: $("hud-dist"), pearls: $("hud-pearls"), score: $("hud-score"), tier: $("hud-tier"),
    start: $("start-screen"), startBest: $("start-best"), startPearls: $("start-pearls"), missionList: $("mission-list"),
    over: $("gameover-screen"), goScore: $("go-score"), goCritter: $("go-critter"), goStats: $("go-stats"), newBest: $("new-best-badge"),
    btnStart: $("btn-start"), btnRetry: $("btn-retry"), btnShare: $("btn-share"), btnRevive: $("btn-revive"),
    boostWrap: $("boost-wrap"), boostFill: $("boost-fill"), btnBoost: $("btn-boost"),
    banner: $("banner"), reward: $("reward"), toast: $("toast"),
    btnSound: $("btn-sound"), btnMusic: $("btn-music"),
  };

  // ---------------- Persistent store ----------------
  const store = {
    best: +(localStorage.getItem("pd3_best") || 0),
    lifePearls: +(localStorage.getItem("pd3_pearls") || 0),
    lifeBoxes: +(localStorage.getItem("pd3_boxes") || 0),
    lifeJets: +(localStorage.getItem("pd3_jets") || 0),
    bestTier: +(localStorage.getItem("pd3_tier") || 0),
    bestDistNum: +(localStorage.getItem("pd3_dist") || 0),
    sound: localStorage.getItem("pd3_sound") !== "off",
    music: localStorage.getItem("pd3_music") !== "off",
  };
  function save(k, v) { localStorage.setItem(k, v); }

  // ---------------- Tuning ----------------
  const LANES = [-2.3, 0, 2.3];
  const GROUND_Y = 0;
  const PLAYER_Z = 0;
  const SPAWN_Z = -78;
  const RECYCLE_Z = 12;
  const GRAVITY = 42;
  const JUMP_V = 13.5;
  const SPEED_START = 16;
  const SPEED_MAX = 40;
  const JET_NEED = 100, JET_TIME = 5.0, JET_MAGNET = 6.5, JET_Y = 3.4;
  const TIERS = [
    { name: "PRAWN",     emoji: "🦐", at: 0,   color: 0xff7a2e, scale: 1.0 },
    { name: "LOBSTER",   emoji: "🦞", at: 400, color: 0xff3b3b, scale: 1.12 },
    { name: "CRAB",      emoji: "🦀", at: 1000, color: 0xff5ea8, scale: 1.24 },
    { name: "KRAKEN",    emoji: "🐙", at: 2000, color: 0x9b5cff, scale: 1.38 },
    { name: "LEVIATHAN", emoji: "🐋", at: 3500, color: 0x3fa9ff, scale: 1.55 },
  ];
  function tierFor(s) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (s >= TIERS[i].at) t = i; return t; }

  // ---------------- Three.js scene ----------------
  let renderer, scene, camera;
  let ground, groundTex, sideL, sideR;
  let playerGroup, bodyMats = [];
  const entities = []; // {mesh, type, lane, r, live, ...}
  const decor = [];    // side coral columns for motion feel

  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03243a);
    scene.fog = new THREE.Fog(0x03243a, 24, 74);

    camera = new THREE.PerspectiveCamera(64, 1, 0.1, 200);
    camera.position.set(0, 5.2, 8.5);
    camera.lookAt(0, 1.4, -10);

    scene.add(new THREE.AmbientLight(0x88bbff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(4, 12, 6);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0x35d0ff, 0.5);
    rim.position.set(-6, 4, -8);
    scene.add(rim);

    // ground
    groundTex = makeGroundTexture();
    const gmat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 });
    ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 240), gmat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -100;
    scene.add(ground);

    // side reef walls (glowing) for depth + speed feel
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a4b63, emissive: 0x0a3550, roughness: 0.9 });
    sideL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 240), wallMat);
    sideL.position.set(-8.5, 3, -100);
    scene.add(sideL);
    sideR = sideL.clone(); sideR.position.x = 8.5; scene.add(sideR);

    // decorative coral columns (recycled)
    for (let i = 0; i < 10; i++) {
      const c = makeCoralColumn();
      c.position.set((Math.random() < 0.5 ? -1 : 1) * (4.2 + Math.random() * 2.5), 0, -Math.random() * SPAWN_Z);
      scene.add(c); decor.push(c);
    }

    // player
    playerGroup = buildCritter(TIERS[0].color);
    scene.add(playerGroup);

    window.addEventListener("resize", onResize);
    onResize();
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // procedural seabed texture (sand + stripes so motion reads)
  function makeGroundTexture() {
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#0b4258"; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${20 + Math.random() * 40},${120 + Math.random() * 60},${140 + Math.random() * 60},0.25)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.strokeStyle = "rgba(120,230,255,0.18)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 42);
    return t;
  }

  function makeCoralColumn() {
    const g = new THREE.Group();
    const h = 2 + Math.random() * 3;
    const col = new THREE.Color().setHSL(0.45 + Math.random() * 0.12, 0.7, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.25), roughness: 0.8 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, h, 6), mat);
    m.position.y = h / 2; g.add(m);
    return g;
  }

  // ---------------- Critter model ----------------
  function buildCritter(color) {
    const g = new THREE.Group();
    bodyMats = [];
    const mat = () => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, emissive: new THREE.Color(color).multiplyScalar(0.12) });
      bodyMats.push(m); return m;
    };
    // body segments (curling up toward the tail at back = +z)
    for (let i = 0; i < 4; i++) {
      const s = 0.6 - i * 0.1;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), mat());
      seg.position.set(0, 0.55 + i * 0.06, 0.34 + i * 0.4);
      g.add(seg);
    }
    // head (front = -z)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), mat());
    head.position.set(0, 0.55, -0.15);
    g.add(head);
    // tail fan
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 8), mat());
    tail.position.set(0, 0.7, 1.85); tail.rotation.x = Math.PI / 2;
    g.add(tail);
    // eyes
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x223344 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
    [-0.26, 0.26].forEach((x) => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), white); w.position.set(x, 0.85, -0.5); g.add(w);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), black); b.position.set(x, 0.85, -0.62); g.add(b);
    });
    // antennae
    const amat = new THREE.MeshStandardMaterial({ color });
    bodyMats.push(amat);
    [-0.14, 0.14].forEach((x) => {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), amat);
      a.position.set(x, 1.05, -0.7); a.rotation.x = -Math.PI / 5; g.add(a);
    });
    return g;
  }

  function applyTierSkin(t) {
    const c = new THREE.Color(TIERS[t].color);
    for (const m of bodyMats) { m.color.set(c); if (m.emissive) m.emissive.set(c.clone().multiplyScalar(0.15)); }
    playerGroup.scale.setScalar(TIERS[t].scale);
  }

  // ---------------- Game state ----------------
  const S = { MENU: 0, PLAY: 1, DEAD: 2 };
  let state = S.MENU;
  let speed, distance, pearlsRun, score, tier, laneIndex, targetX;
  let py, pvy, grounded, tilt;
  let jetMeter, jetTime, invuln, spawnAccum, decorAccum;
  let boxesRun, jetsRun, lastTime;

  function reset() {
    speed = SPEED_START; distance = 0; pearlsRun = 0; score = 0; tier = 0;
    laneIndex = 1; targetX = LANES[1];
    py = GROUND_Y; pvy = 0; grounded = true; tilt = 0;
    jetMeter = 0; jetTime = 0; invuln = 0.5; spawnAccum = 0; decorAccum = 0;
    boxesRun = 0; jetsRun = 0;
    // clear entities
    for (const e of entities) scene.remove(e.mesh);
    entities.length = 0;
    playerGroup.position.set(LANES[1], py, PLAYER_Z);
    applyTierSkin(0);
  }

  // ---------------- Spawning ----------------
  function addBlock(lane, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1bd48a, emissive: 0x0c6b48, roughness: 0.7 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.4, 1.0), mat);
    m.position.set(LANES[lane], 1.2, z);
    scene.add(m); entities.push({ mesh: m, type: "block", lane, live: true });
  }
  function addHurdle(lane, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffa23a, emissive: 0x7a4400, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 0.8), mat);
    m.position.set(LANES[lane], 0.35, z);
    scene.add(m); entities.push({ mesh: m, type: "hurdle", lane, live: true });
  }
  function addPearl(lane, z, y) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x2ea6ff, emissiveIntensity: 1.4, roughness: 0.2 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), mat);
    m.position.set(LANES[lane], y || 0.9, z);
    scene.add(m); entities.push({ mesh: m, type: "pearl", lane, live: true });
  }
  function addBox(lane, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffae00, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), mat);
    m.position.set(LANES[lane], 0.95, z);
    scene.add(m); entities.push({ mesh: m, type: "box", lane, live: true, spin: 0 });
  }

  function spawnRow() {
    const z = SPAWN_Z;
    if (Math.random() < 0.16) {
      // full-width low hurdle -> must jump
      for (let l = 0; l < 3; l++) addHurdle(l, z);
    } else {
      // block 1-2 lanes, leave at least one free
      const lanes = [0, 1, 2];
      const nBlocked = Math.random() < 0.4 ? 2 : 1;
      const blocked = [];
      while (blocked.length < nBlocked) {
        const l = lanes[Math.floor(Math.random() * 3)];
        if (!blocked.includes(l)) blocked.push(l);
      }
      blocked.forEach((l) => addBlock(l, z));
      const free = [0, 1, 2].filter((l) => !blocked.includes(l));
      // pearl line in a free lane
      const pl = free[Math.floor(Math.random() * free.length)];
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) addPearl(pl, z + i * 2.2, 0.9);
    }
    // occasional mystery box
    if (Math.random() < 0.14) addBox([0, 1, 2][Math.floor(Math.random() * 3)], z - 6);
  }

  // ---------------- Mystery box rewards ----------------
  const REWARDS = [
    { txt: "🚀 JET CHARGED!", act: () => { jetMeter = JET_NEED; } },
    { txt: "🫧 PEARL BURST +15", act: () => { pearlsRun += 15; store.lifePearls += 15; save("pd3_pearls", store.lifePearls); } },
    { txt: "🛡️ SHIELD (3s safe)", act: () => { invuln = Math.max(invuln, 3); } },
    { txt: "⭐ SCORE +200", act: () => { score += 200; } },
  ];
  function openBox() {
    boxesRun++; jetsRun += 0;
    store.lifeBoxes++; save("pd3_boxes", store.lifeBoxes);
    const r = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    r.act();
    showReward(r.txt);
    beep(720, 0.1, "triangle", 0.06); setTimeout(() => beep(1080, 0.14, "triangle", 0.06), 90);
    checkMissions();
  }

  // ---------------- Input ----------------
  function moveLane(dir) {
    if (state !== S.PLAY) return;
    laneIndex = Math.max(0, Math.min(2, laneIndex + dir));
    targetX = LANES[laneIndex];
    tilt = dir * 0.35;
    beep(420, 0.05, "sine", 0.03);
  }
  function jump() {
    if (state === S.MENU) { startGame(); return; }
    if (state !== S.PLAY) return;
    if (grounded && jetTime <= 0) { pvy = JUMP_V; grounded = false; beep(300, 0.09, "sine", 0.05); }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") { moveLane(-1); e.preventDefault(); }
    else if (e.code === "ArrowRight") { moveLane(1); e.preventDefault(); }
    else if (e.code === "ArrowUp" || e.code === "Space") { jump(); e.preventDefault(); }
    else if (e.code === "KeyB") doJet();
  });

  // touch swipe
  let tsx = 0, tsy = 0, tst = 0;
  window.addEventListener("touchstart", (e) => {
    if (e.target.closest("button")) return;
    const t = e.changedTouches[0]; tsx = t.clientX; tsy = t.clientY; tst = Date.now();
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (e.target.closest("button")) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tsx, dy = t.clientY - tsy;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24 && Date.now() - tst < 250) { jump(); return; } // tap = jump
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    else if (dy < 0) jump();
  }, { passive: true });

  // mouse click (desktop) = jump / start
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    if (e.target.closest("button")) return;
    jump();
  });

  // ---------------- Flow ----------------
  function startGame() {
    reset();
    state = S.PLAY;
    el.start.classList.add("hidden");
    el.over.classList.add("hidden");
    el.hud.classList.remove("hidden");
    el.boostWrap.classList.remove("hidden");
    el.btnBoost.classList.add("hidden");
    el.banner.classList.add("hidden");
    lastTime = performance.now();
    if (store.music) startMusic();
  }

  function die() {
    if (state !== S.PLAY) return;
    state = S.DEAD;
    beep(150, 0.4, "sawtooth", 0.09);
    // lifetime + bests
    if (score > store.best) { store.best = score; save("pd3_best", score); }
    if (distance > (store.bestDistNum || 0)) { store.bestDistNum = distance; save("pd3_dist", Math.floor(distance)); }
    if (tier > store.bestTier) { store.bestTier = tier; save("pd3_tier", tier); }
    checkMissions();
    setTimeout(() => {
      el.hud.classList.add("hidden");
      el.boostWrap.classList.add("hidden");
      el.btnBoost.classList.add("hidden");
      el.goScore.textContent = Math.floor(score);
      el.goCritter.textContent = `${TIERS[tier].emoji} ${TIERS[tier].name}`;
      el.goStats.textContent = `${Math.floor(distance)} m · 🫧 ${pearlsRun}`;
      el.newBest.classList.toggle("hidden", score < store.best || score <= 0);
      el.btnRevive.classList.toggle("hidden", true); // revive optional; hidden for now
      el.over.classList.remove("hidden");
      refreshMenu();
    }, 500);
  }

  function doJet() {
    if (state !== S.PLAY || jetMeter < JET_NEED || jetTime > 0) return;
    jetMeter = 0; jetTime = JET_TIME; invuln = JET_TIME + 0.3; jetsRun++;
    store.lifeJets++; save("pd3_jets", store.lifeJets);
    showBanner("🚀 JET!");
    beep(180, 0.3, "sawtooth", 0.07); setTimeout(() => beep(320, 0.2, "sawtooth", 0.05), 120);
    checkMissions();
  }

  // ---------------- Update ----------------
  function update(dt) {
    // spin decor & boxes always
    for (const e of entities) if (e.type === "box") { e.spin += dt * 3; e.mesh.rotation.y = e.spin; e.mesh.rotation.x = e.spin * 0.5; }

    if (state === S.PLAY) {
      // timers
      if (invuln > 0) invuln -= dt;
      if (jetTime > 0) jetTime -= dt;

      // speed ramps with distance
      speed = Math.min(SPEED_MAX, SPEED_START + distance * 0.004);
      const moveZ = speed * dt * (jetTime > 0 ? 1.35 : 1);
      distance += moveZ;

      // scroll ground/side texture
      groundTex.offset.y -= moveZ * 0.02;

      // player lane lerp + tilt
      const px = playerGroup.position.x + (targetX - playerGroup.position.x) * Math.min(1, dt * 12);
      playerGroup.position.x = px;
      tilt += (0 - tilt) * Math.min(1, dt * 8);

      // vertical: jet cruise or jump/gravity
      if (jetTime > 0) {
        py += (JET_Y - py) * Math.min(1, dt * 6);
        pvy = 0; grounded = false;
      } else {
        pvy -= GRAVITY * dt;
        py += pvy * dt;
        if (py <= GROUND_Y) { py = GROUND_Y; pvy = 0; grounded = true; }
      }
      playerGroup.position.y = py;
      playerGroup.rotation.z = tilt;
      playerGroup.rotation.y = Math.PI + tilt * 0.5; // face away from camera
      // little swim bob
      playerGroup.children.forEach((c, i) => { c.position.y += Math.sin(performance.now() / 150 + i) * 0.003; });

      // spawn rows by distance
      spawnAccum += moveZ;
      const gap = Math.max(5.5, 9 - distance * 0.0008);
      while (spawnAccum >= gap) { spawnAccum -= gap; spawnRow(); }

      // move entities toward camera, collide, recycle
      for (const e of entities) {
        e.mesh.position.z += moveZ;
        // pearl magnet during jet
        if (e.type === "pearl" && jetTime > 0 && e.live) {
          const dx = playerGroup.position.x - e.mesh.position.x;
          const dyz = PLAYER_Z - e.mesh.position.z;
          const d = Math.hypot(dx, e.mesh.position.y - py, dyz);
          if (d < JET_MAGNET) {
            e.mesh.position.x += dx * Math.min(1, dt * 7);
            e.mesh.position.y += (py - e.mesh.position.y) * Math.min(1, dt * 7);
          }
        }
        // pearl gentle spin
        if (e.type === "pearl") e.mesh.rotation.y += dt * 4;

        if (e.live && Math.abs(e.mesh.position.z - PLAYER_Z) < 1.1) {
          const sameLaneX = Math.abs(e.mesh.position.x - playerGroup.position.x) < 1.1;
          if (e.type === "pearl") {
            const near = sameLaneX && Math.abs(e.mesh.position.y - py) < 1.3;
            if (near || (jetTime > 0 && Math.hypot(e.mesh.position.x - playerGroup.position.x, e.mesh.position.y - py) < 1.4)) {
              collectPearl(e);
            }
          } else if (e.type === "box") {
            if (sameLaneX && Math.abs(e.mesh.position.y - py) < 1.6) { e.live = false; scene.remove(e.mesh); openBox(); }
          } else if (e.type === "block") {
            if (sameLaneX && py < 2.0 && invuln <= 0 && jetTime <= 0) die();
          } else if (e.type === "hurdle") {
            if (sameLaneX && py < 1.0 && invuln <= 0 && jetTime <= 0) die();
          }
        }
      }
      // recycle
      for (let i = entities.length - 1; i >= 0; i--) {
        if (!entities[i].live || entities[i].mesh.position.z > RECYCLE_Z) {
          if (entities[i].mesh.parent) scene.remove(entities[i].mesh);
          entities.splice(i, 1);
        }
      }

      // decor columns recycle
      for (const c of decor) {
        c.position.z += moveZ;
        if (c.position.z > RECYCLE_Z + 4) {
          c.position.z = SPAWN_Z - Math.random() * 20;
          c.position.x = (Math.random() < 0.5 ? -1 : 1) * (4.2 + Math.random() * 2.5);
        }
      }

      // score & tier
      score = Math.floor(distance) + pearlsRun * 5 + boxesRun * 25;
      const nt = tierFor(score);
      if (nt > tier) { tier = nt; applyTierSkin(tier); showBanner(`${TIERS[tier].emoji} ${TIERS[tier].name}!`); beep(520,0.12,'triangle',0.06); setTimeout(()=>beep(780,0.14,'triangle',0.06),90); setTimeout(()=>beep(1040,0.16,'triangle',0.06),180); }

      // HUD
      el.dist.textContent = Math.floor(distance);
      el.pearls.textContent = pearlsRun;
      el.score.textContent = score;
      el.tier.textContent = `${TIERS[tier].emoji} ${TIERS[tier].name}`;
      el.boostFill.style.width = Math.min(100, (jetMeter / JET_NEED) * 100) + "%";
      el.btnBoost.classList.toggle("hidden", jetMeter < JET_NEED || jetTime > 0);
    } else {
      // idle camera drift on menus
      groundTex.offset.y -= dt * 0.12;
      for (const c of decor) { c.position.z += 8 * dt; if (c.position.z > RECYCLE_Z + 4) { c.position.z = SPAWN_Z; c.position.x = (Math.random() < 0.5 ? -1 : 1) * (4.2 + Math.random() * 2.5); } }
    }
  }

  function collectPearl(e) {
    e.live = false; scene.remove(e.mesh);
    pearlsRun++; store.lifePearls++; save("pd3_pearls", store.lifePearls);
    jetMeter = Math.min(JET_NEED, jetMeter + 9);
    beep(1000 + Math.min(600, pearlsRun * 6), 0.05, "sine", 0.045);
    checkMissions();
  }

  // ---------------- Render loop ----------------
  function loop(now) {
    const dt = Math.min(0.04, (now - lastTime) / 1000) || 0;
    lastTime = now;
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // ---------------- Missions ----------------
  // cumulative/persistent missions with scaling targets
  const METRICS = {
    pearls: () => store.lifePearls,
    boxes: () => store.lifeBoxes,
    jets: () => store.lifeJets,
    dist: () => Math.floor(store.bestDistNum || 0),
    tier: () => store.bestTier,
  };
  const M_DEFS = {
    pearls: { icon: "🫧", label: (t) => `Collect ${t} pearls (total)`, base: 50, grow: 60 },
    boxes: { icon: "🎁", label: (t) => `Open ${t} mystery boxes`, base: 3, grow: 4 },
    jets: { icon: "🚀", label: (t) => `Use JET ${t} times`, base: 2, grow: 3 },
    dist: { icon: "🏁", label: (t) => `Run ${t} m in one go`, base: 600, grow: 500 },
    tier: { icon: "🐋", label: (t) => `Reach ${TIERS[Math.min(t, 4)].name}`, base: 1, grow: 1 },
  };
  let missions = loadMissions();

  function loadMissions() {
    try {
      const raw = JSON.parse(localStorage.getItem("pd3_missions"));
      if (raw && raw.length) return raw;
    } catch (e) {}
    return [makeMission("pearls"), makeMission("dist"), makeMission("boxes")];
  }
  function makeMission(key) {
    const d = M_DEFS[key];
    const cur = METRICS[key]();
    // target = next milestone above current
    let target = d.base;
    while (target <= cur) target += d.grow;
    return { key, target };
  }
  function saveMissions() { localStorage.setItem("pd3_missions", JSON.stringify(missions)); }

  function checkMissions() {
    let changed = false;
    for (let i = 0; i < missions.length; i++) {
      const m = missions[i];
      if (METRICS[m.key]() >= m.target) {
        showToast(`✅ Mission complete: ${M_DEFS[m.key].label(m.target)}`);
        beep(880, 0.12, "triangle", 0.06); setTimeout(() => beep(1250, 0.16, "triangle", 0.06), 110);
        // reward: a bit of jet charge next time + reroll harder
        missions[i] = makeMission(m.key);
        changed = true;
      }
    }
    if (changed) saveMissions();
    renderMissions();
  }

  function renderMissions() {
    if (!el.missionList) return;
    el.missionList.innerHTML = "";
    for (const m of missions) {
      const d = M_DEFS[m.key];
      const cur = Math.min(METRICS[m.key](), m.target);
      const pct = Math.round((cur / m.target) * 100);
      const row = document.createElement("div");
      row.className = "mission-row";
      row.innerHTML = `<div class="mission-top"><span>${d.icon} ${d.label(m.target)}</span><span>${cur}/${m.target}</span></div>
        <div class="mission-bar"><div class="mission-fill" style="width:${pct}%"></div></div>`;
      el.missionList.appendChild(row);
    }
  }

  // ---------------- UI helpers ----------------
  function refreshMenu() {
    el.startBest.textContent = Math.floor(store.best);
    el.startPearls.textContent = store.lifePearls;
    renderMissions();
  }
  let toastTimer = null;
  function showToast(msg) { el.toast.textContent = msg; el.toast.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2400); }
  let bannerTimer = null;
  function showBanner(text) {
    el.banner.textContent = text; el.banner.classList.remove("hidden", "banner-anim");
    void el.banner.offsetWidth; el.banner.classList.add("banner-anim");
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.banner.classList.add("hidden"), 1400);
  }
  let rewardTimer = null;
  function showReward(text) {
    el.reward.textContent = text; el.reward.classList.remove("hidden", "reward-anim");
    void el.reward.offsetWidth; el.reward.classList.add("reward-anim");
    clearTimeout(rewardTimer); rewardTimer = setTimeout(() => el.reward.classList.add("hidden"), 1600);
  }

  function shareScore() {
    const t = TIERS[tier];
    const text = `PRAWN DASH 3D 🦐\nScore ${Math.floor(score)} · ${Math.floor(distance)}m · evolved to ${t.name} ${t.emoji}!\nCan you out-run me?`;
    const url = location.href;
    if (navigator.share) navigator.share({ title: "Prawn Dash 3D", text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + "\n" + url).then(() => showToast("Score copied — share it! 📋"), () => showToast(text));
    else showToast(text);
  }

  // ---------------- Audio: SFX + procedural music ----------------
  let actx = null;
  function ac() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  function beep(freq, dur, type = "sine", vol = 0.06) {
    if (!store.sound) return;
    try {
      const a = ac(); const o = a.createOscillator(); const g = a.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(a.destination);
      const t = a.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }

  // simple 16-step looping soundtrack (bass + arp + hat)
  let musicTimer = null, musicStep = 0, musicNext = 0, musicGain = null;
  const TEMPO = 106, STEP = 60 / TEMPO / 2;
  const ARP = [329.63, 392.00, 493.88, 392.00, 440.00, 392.00, 329.63, 261.63];
  const BASS = [110, 110, 146.83, 110, 130.81, 130.81, 98, 110];
  function mnote(freq, time, dur, type, vol) {
    const a = ac(); const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(musicGain);
    g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.start(time); o.stop(time + dur + 0.02);
  }
  function musicSchedule() {
    const a = ac();
    while (musicNext < a.currentTime + 0.12) {
      const s = musicStep % 16, bar = Math.floor(s / 2) % 8;
      if (s % 2 === 0) mnote(BASS[bar], musicNext, 0.28, "triangle", 0.12); // bass on beats
      mnote(ARP[s % ARP.length] * 1.0, musicNext, 0.16, "sine", 0.05);      // arp
      if (s % 2 === 1) mnote(8000, musicNext, 0.03, "square", 0.008);       // soft hat
      musicNext += STEP; musicStep++;
    }
  }
  function startMusic() {
    if (!store.music || musicTimer) return;
    const a = ac();
    if (!musicGain) { musicGain = a.createGain(); musicGain.gain.value = 0.5; musicGain.connect(a.destination); }
    musicNext = a.currentTime + 0.1; musicStep = 0;
    musicTimer = setInterval(musicSchedule, 25);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  // ---------------- Buttons ----------------
  el.btnStart.addEventListener("click", startGame);
  el.btnRetry.addEventListener("click", startGame);
  el.btnShare.addEventListener("click", shareScore);
  el.btnBoost.addEventListener("click", doJet);
  el.btnSound.addEventListener("click", () => {
    store.sound = !store.sound; save("pd3_sound", store.sound ? "on" : "off");
    el.btnSound.textContent = store.sound ? "🔊" : "🔇"; if (store.sound) beep(660, 0.08, "triangle", 0.05);
  });
  el.btnMusic.addEventListener("click", () => {
    store.music = !store.music; save("pd3_music", store.music ? "on" : "off");
    el.btnMusic.textContent = store.music ? "🎵" : "🎶";
    el.btnMusic.style.opacity = store.music ? "1" : "0.4";
    if (store.music) { if (state === S.PLAY) startMusic(); } else stopMusic();
  });

  // ---------------- Boot ----------------
  initThree();
  reset();
  state = S.MENU;
  el.btnSound.textContent = store.sound ? "🔊" : "🔇";
  el.btnMusic.style.opacity = store.music ? "1" : "0.4";
  refreshMenu();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
