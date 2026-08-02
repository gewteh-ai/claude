/* ============================================================
   NEON DASH — one-tap arcade
   Pure JS, no dependencies. Runs offline.
   ============================================================ */
(() => {
  "use strict";

  // ---------- Canvas setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layoutStars();
  }
  window.addEventListener("resize", resize);

  // ---------- DOM ----------
  const el = {
    hud: document.getElementById("hud"),
    hudScore: document.getElementById("hud-score"),
    hudBest: document.getElementById("hud-best"),
    startScreen: document.getElementById("start-screen"),
    startBest: document.getElementById("start-best"),
    startStreak: document.getElementById("start-streak"),
    gameoverScreen: document.getElementById("gameover-screen"),
    goScore: document.getElementById("go-score"),
    goCritter: document.getElementById("go-critter"),
    goBest: document.getElementById("go-best"),
    newBest: document.getElementById("new-best-badge"),
    btnStart: document.getElementById("btn-start"),
    btnRetry: document.getElementById("btn-retry"),
    btnShare: document.getElementById("btn-share"),
    btnRevive: document.getElementById("btn-revive"),
    btnSound: document.getElementById("btn-sound"),
    toast: document.getElementById("toast"),
  };

  // ---------- Persistent state ----------
  const store = {
    best: +(localStorage.getItem("nd_best") || 0),
    streak: +(localStorage.getItem("nd_streak") || 0),
    sound: localStorage.getItem("nd_sound") !== "off",
  };

  // ---------- Game constants ----------
  const GRAVITY = 1900;        // px/s^2
  const FLAP_V = -560;         // px/s
  const PLAYER_R = 16;
  const GAP_BASE = 210;        // starting gap between obstacles
  const GAP_MIN = 132;
  const SPEED_BASE = 240;      // px/s horizontal
  const SPEED_MAX = 470;
  const SPAWN_BASE = 1.55;     // seconds between obstacles
  // Evolution tiers — unlock as your score climbs (drawX are hoisted fns)
  const TIERS = [
    { name: "PRAWN",   emoji: "🦐", at: 0,  draw: drawPrawn,   glow: "#ff9a4d" },
    { name: "LOBSTER", emoji: "🦞", at: 10, draw: drawLobster, glow: "#ff4d4d" },
    { name: "CRAB",    emoji: "🦀", at: 25, draw: drawCrab,    glow: "#ff5ea8" },
    { name: "KRAKEN",  emoji: "🐙", at: 45, draw: drawKraken,  glow: "#b06bff" },
  ];
  function levelForScore(s) { let l = 0; for (let i = 0; i < TIERS.length; i++) if (s >= TIERS[i].at) l = i; return l; }

  // ---------- Game state ----------
  const STATE = { MENU: 0, PLAY: 1, DEAD: 2 };
  let state = STATE.MENU;

  let player, obstacles, particles, stars, farStars, bubbles;
  let score, speed, spawnTimer, elapsed, shake, usedRevive, curLevel, bubbleTimer;
  let lastTime = 0;

  function reset() {
    player = { x: W * 0.28, y: H * 0.45, vy: 0, rot: 0, trail: [] };
    obstacles = [];
    particles = [];
    bubbles = bubbles || [];
    score = 0;
    speed = SPEED_BASE;
    spawnTimer = 0.4;
    elapsed = 0;
    shake = 0;
    usedRevive = false;
    curLevel = 0;
    bubbleTimer = 0;
  }

  // ---------- Starfield (parallax) ----------
  function layoutStars() {
    stars = [];
    farStars = [];
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2 });
    }
    for (let i = 0; i < n * 0.6; i++) {
      farStars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 0.9 + 0.2 });
    }
  }

  // ---------- Obstacles ----------
  function spawnObstacle() {
    const gap = Math.max(GAP_MIN, GAP_BASE - score * 2.2);
    const margin = 70;
    const gapY = margin + Math.random() * (H - gap - margin * 2);
    obstacles.push({ x: W + 40, gapY, gap, w: 62, passed: false, hue: (score * 18) % 360 });
  }

  // ---------- Particles ----------
  function burst(x, y, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread + 40;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, size: Math.random() * 3 + 1.5 });
    }
  }

  // ---------- Audio (tiny synth, no files needed) ----------
  let actx = null;
  function beep(freq, dur, type = "sine", vol = 0.08) {
    if (!store.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* ignore */ }
  }

  // ---------- Input ----------
  function flap() {
    if (state === STATE.MENU) { startGame(); return; }
    if (state === STATE.PLAY) {
      player.vy = FLAP_V;
      burst(player.x - 8, player.y + 6, "#9fe8ff", 6, 70); // splash bubbles
      beep(300, 0.1, "sine", 0.05); // bubble bloop
    }
  }

  function onPress(e) {
    // ignore taps on real buttons (they have their own handlers)
    if (e.target.closest("button")) return;
    if (e.type === "keydown" && e.code !== "Space" && e.code !== "ArrowUp") return;
    if (e.type === "keydown") e.preventDefault();
    flap();
  }
  window.addEventListener("pointerdown", onPress);
  window.addEventListener("keydown", onPress);

  // ---------- Flow ----------
  function startGame() {
    reset();
    state = STATE.PLAY;
    el.startScreen.classList.add("hidden");
    el.gameoverScreen.classList.add("hidden");
    el.hud.classList.remove("hidden");
    lastTime = performance.now();
  }

  function die() {
    if (state !== STATE.PLAY) return;
    state = STATE.DEAD;
    shake = 16;
    burst(player.x, player.y, "#ff2fb9", 34, 260);
    beep(150, 0.4, "sawtooth", 0.09);

    const isBest = score > store.best;
    if (isBest) { store.best = score; localStorage.setItem("nd_best", score); }

    // streak: increases if you beat/equal a small threshold, else reset — keeps the daily-play hook
    if (score > 0) { store.streak++; } else { store.streak = 0; }
    localStorage.setItem("nd_streak", store.streak);

    // show game-over after brief delay for the death juice
    setTimeout(() => {
      el.hud.classList.add("hidden");
      el.goScore.textContent = score;
      const reached = TIERS[levelForScore(score)];
      el.goCritter.textContent = `${reached.emoji} ${reached.name}`;
      el.goBest.textContent = store.best;
      el.newBest.classList.toggle("hidden", !isBest);
      el.btnRevive.classList.toggle("hidden", usedRevive || score < 3);
      el.gameoverScreen.classList.remove("hidden");
      refreshMenuStats();
      // Monetization hook: request a game-over ad here (mock)
      requestAd("gameover-banner");
    }, 550);
  }

  // ---------- Revive (monetization hook, mocked) ----------
  function revive() {
    // In production: show rewarded video, then on completion resume.
    usedRevive = true;
    el.gameoverScreen.classList.add("hidden");
    el.hud.classList.remove("hidden");
    // clear nearby obstacles so player isn't instantly killed
    obstacles = obstacles.filter(o => o.x > player.x + 160);
    player.y = H * 0.45;
    player.vy = FLAP_V;
    state = STATE.PLAY;
    lastTime = performance.now();
    toast("Revived! Keep going ✨");
  }

  // ---------- Ad hook (mock; swap with real network) ----------
  function requestAd(slotName) {
    // e.g. googletag.display(slotName) or Adsterra loader.
    // No-op in sandbox / offline.
  }

  // ---------- Update ----------
  function update(dt) {
    elapsed += dt;
    // difficulty ramps with time
    speed = Math.min(SPEED_MAX, SPEED_BASE + elapsed * 8);
    const spawnInterval = Math.max(0.95, SPAWN_BASE - elapsed * 0.012);

    // parallax light specks
    for (const s of farStars) { s.x -= speed * 0.15 * dt; if (s.x < 0) s.x += W; }
    for (const s of stars) { s.x -= speed * 0.4 * dt; s.tw += dt * 3; if (s.x < 0) s.x += W; }

    // rising bubbles (underwater ambience)
    bubbleTimer -= dt;
    if (bubbleTimer <= 0) {
      bubbles.push({ x: Math.random() * W, y: H + 12, r: Math.random() * 6 + 2, vy: Math.random() * 45 + 28, wob: Math.random() * 22 + 8, ph: Math.random() * 6 });
      bubbleTimer = 0.16;
    }
    for (const b of bubbles) { b.y -= b.vy * dt; b.ph += dt * 2; b.x += Math.sin(b.ph) * b.wob * dt; }
    bubbles = bubbles.filter(b => b.y > -20);

    if (state === STATE.PLAY) {
      // player physics
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      player.rot = Math.max(-0.5, Math.min(1.1, player.vy / 700));

      // trail
      player.trail.unshift({ x: player.x, y: player.y });
      if (player.trail.length > 14) player.trail.pop();

      // spawn
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnObstacle(); spawnTimer = spawnInterval; }

      // move obstacles + score + collide
      for (const o of obstacles) {
        o.x -= speed * dt;
        if (!o.passed && o.x + o.w < player.x) {
          o.passed = true;
          score++;
          burst(player.x + 20, player.y, "#ffd27a", 8, 120);
          beep(600 + score * 6, 0.07, "triangle", 0.04);
          const newLevel = levelForScore(score);
          if (newLevel > curLevel) { curLevel = newLevel; onLevelUp(TIERS[curLevel]); }
        }
        // collision
        if (hits(player, o)) die();
      }
      obstacles = obstacles.filter(o => o.x + o.w > -20);

      // floor / ceiling
      if (player.y + PLAYER_R > H || player.y - PLAYER_R < 0) die();

      el.hudScore.textContent = score;
    }

    // particles always update
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt * 1.8;
    }
    particles = particles.filter(p => p.life > 0);

    if (shake > 0) shake = Math.max(0, shake - dt * 60);
  }

  function hits(p, o) {
    const inX = p.x + PLAYER_R > o.x && p.x - PLAYER_R < o.x + o.w;
    if (!inX) return false;
    const inGap = p.y - PLAYER_R > o.gapY && p.y + PLAYER_R < o.gapY + o.gap;
    return !inGap;
  }

  // ---------- Render ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // far stars
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (const s of farStars) { ctx.fillRect(s.x, s.y, s.r, s.r); }
    // near specks (twinkle like sunlight through water)
    for (const s of stars) {
      const a = 0.4 + Math.sin(s.tw) * 0.35;
      ctx.fillStyle = `rgba(150,225,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }

    // rising bubbles
    ctx.lineWidth = 1;
    for (const b of bubbles) {
      ctx.fillStyle = "rgba(140,225,255,0.08)";
      ctx.strokeStyle = "rgba(150,230,255,0.28)";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
      // little highlight
      ctx.fillStyle = "rgba(220,250,255,0.5)";
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, 7); ctx.fill();
    }

    // obstacles
    for (const o of obstacles) {
      drawObstacle(o);
    }

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player (only when in play / dead juice)
    if (state !== STATE.MENU) drawPlayer();

    ctx.restore();
  }

  function drawObstacle(o) {
    // glowing coral / kelp (greens with a little variation)
    const col = `hsl(${150 + (o.hue % 50) - 25}, 78%, 56%)`;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;
    ctx.fillStyle = "rgba(4,30,34,0.92)";
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    // top pillar
    roundRect(o.x, -10, o.w, o.gapY + 10, 10);
    ctx.fill(); ctx.stroke();
    // bottom pillar
    roundRect(o.x, o.gapY + o.gap, o.w, H - (o.gapY + o.gap) + 10, 10);
    ctx.fill(); ctx.stroke();
    // coral bumps along the inner edges for texture
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 3; i++) {
      const bx = o.x + 12 + i * 20;
      ctx.beginPath(); ctx.arc(bx, o.gapY - 2, 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, o.gapY + o.gap + 2, 5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPlayer() {
    // bubble trail
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      const a = (1 - i / player.trail.length) * 0.35;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#bff0ff";
      ctx.beginPath(); ctx.arc(t.x - 6, t.y, PLAYER_R * 0.4 * (1 - i / player.trail.length), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rot);
    TIERS[curLevel].draw(PLAYER_R);
    ctx.restore();
  }

  // ---------- Creatures (facing right, centered at origin) ----------
  function bodySegments(segs) {
    ctx.beginPath();
    for (const s of segs) { ctx.moveTo(s.x + s.s, s.y); ctx.arc(s.x, s.y, s.s, 0, 7); }
    ctx.fill();
  }

  function drawPrawn(r) {
    // bright orange body
    const grd = ctx.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, "#ffe08a");
    grd.addColorStop(0.5, "#ff9124");
    grd.addColorStop(1, "#ff5410");
    ctx.fillStyle = grd;
    ctx.shadowColor = "#ffb14d";
    ctx.shadowBlur = 28;
    const seg = [
      { x: r * 0.85, y: 0.0, s: r * 0.58 },
      { x: r * 0.35, y: -0.05 * r, s: r * 0.62 },
      { x: -0.15 * r, y: -0.18 * r, s: r * 0.54 },
      { x: -0.6 * r, y: -0.42 * r, s: r * 0.44 },
      { x: -0.95 * r, y: -0.74 * r, s: r * 0.32 },
    ];
    bodySegments(seg);
    // bright tail fan
    ctx.fillStyle = "#ffb24d";
    ctx.beginPath();
    ctx.moveTo(-0.95 * r, -0.74 * r);
    ctx.lineTo(-1.55 * r, -1.1 * r);
    ctx.lineTo(-1.2 * r, -0.55 * r);
    ctx.lineTo(-1.62 * r, -0.5 * r);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // shell segment stripes (apparent features)
    ctx.strokeStyle = "rgba(255,230,180,0.8)"; ctx.lineWidth = 2;
    for (const s of seg.slice(1, 4)) {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 0.7, -1.9, -0.4); ctx.stroke();
    }
    // legs
    ctx.strokeStyle = "#ffa24d"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const lx = r * (0.6 - i * 0.32);
      ctx.beginPath(); ctx.moveTo(lx, r * 0.35); ctx.lineTo(lx - 3, r * 0.85); ctx.stroke();
    }
    // long antennae
    ctx.strokeStyle = "#ffd08a"; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(r * 1.2, -0.05 * r); ctx.quadraticCurveTo(r * 2.2, r * 0.2, r * 2.75, r * 1.0);
    ctx.moveTo(r * 1.2, 0.1 * r); ctx.quadraticCurveTo(r * 2.0, r * 0.6, r * 2.2, r * 1.35);
    ctx.stroke();
    // pointy rostrum nose
    ctx.strokeStyle = "#ffb35c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r * 1.35, -0.12 * r); ctx.lineTo(r * 1.95, -0.4 * r); ctx.stroke();
    // big clear eye
    drawEye(r * 0.98, -r * 0.2, r * 0.2);
  }

  function drawLobster(rBase) {
    const r = rBase * 1.18;
    const grd = ctx.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, "#ff9a5a");
    grd.addColorStop(0.5, "#ff3b3b");
    grd.addColorStop(1, "#c81212");
    ctx.shadowColor = "#ff5a5a";
    ctx.shadowBlur = 28;
    // big claw arms (behind body)
    ctx.strokeStyle = "#e23030"; ctx.lineWidth = r * 0.22; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.2); ctx.lineTo(r * 1.55, -r * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.2); ctx.lineTo(r * 1.55, r * 0.85); ctx.stroke();
    ctx.lineCap = "butt";
    // chunky body
    ctx.fillStyle = grd;
    const seg = [
      { x: r * 0.6, y: 0, s: r * 0.62 },
      { x: r * 0.05, y: 0, s: r * 0.64 },
      { x: -0.5 * r, y: 0, s: r * 0.55 },
      { x: -0.95 * r, y: -0.05 * r, s: r * 0.45 },
      { x: -1.35 * r, y: -0.12 * r, s: r * 0.33 },
    ];
    bodySegments(seg);
    // tail fan
    ctx.beginPath();
    ctx.moveTo(-1.35 * r, -0.12 * r);
    ctx.lineTo(-2.0 * r, -0.5 * r);
    ctx.lineTo(-1.85 * r, 0);
    ctx.lineTo(-2.0 * r, 0.5 * r);
    ctx.closePath(); ctx.fill();
    // BIG claws in front
    drawClaw(r * 1.8, -r * 1.0, r * 1.25, "#ff5a4a");
    drawClaw(r * 1.8, r * 1.0, r * 1.25, "#ff5a4a");
    ctx.shadowBlur = 0;
    // shell segment stripes
    ctx.strokeStyle = "rgba(255,210,190,0.75)"; ctx.lineWidth = 2;
    for (const s of seg.slice(1, 4)) { ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 0.7, -1.9, -0.4); ctx.stroke(); }
    // antennae
    ctx.strokeStyle = "#ff8a6a"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, -0.15 * r); ctx.quadraticCurveTo(r * 2.4, -r * 0.4, r * 3.0, -r * 1.0);
    ctx.moveTo(r * 1.0, 0.15 * r); ctx.quadraticCurveTo(r * 2.4, r * 0.4, r * 3.0, r * 1.0);
    ctx.stroke();
    // eyes
    drawEye(r * 0.85, -r * 0.24, r * 0.16);
    drawEye(r * 0.85, r * 0.24, r * 0.16);
  }

  function drawCrab(rBase) {
    const r = rBase * 1.22;
    const grd = ctx.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, "#ff8ac6");
    grd.addColorStop(1, "#e11d74");
    ctx.shadowColor = "#ff5ea8"; ctx.shadowBlur = 28;
    // walking legs (both sides, behind)
    ctx.strokeStyle = "#c71563"; ctx.lineWidth = r * 0.12; ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const ay = -r * 0.55 + i * r * 0.36;
      ctx.beginPath(); ctx.moveTo(-r * 0.1, ay * 0.6); ctx.quadraticCurveTo(-r * 0.9, ay, -r * 1.25, ay * 1.35); ctx.stroke();
    }
    ctx.lineCap = "butt";
    // wide shell
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.98, r * 0.78, 0, 0, 7); ctx.fill();
    // claw arms + BIG claws
    ctx.strokeStyle = "#d61a6e"; ctx.lineWidth = r * 0.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.4); ctx.lineTo(r * 1.25, -r * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.6, r * 0.4); ctx.lineTo(r * 1.25, r * 0.8); ctx.stroke();
    ctx.lineCap = "butt";
    drawClaw(r * 1.5, -r * 0.95, r * 1.15, "#ff6ab0");
    drawClaw(r * 1.5, r * 0.95, r * 1.15, "#ff6ab0");
    ctx.shadowBlur = 0;
    // shell highlight
    ctx.strokeStyle = "rgba(255,225,240,0.7)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.62, -2.4, -0.7); ctx.stroke();
    // eye stalks
    ctx.strokeStyle = "#c71563"; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.5); ctx.lineTo(r * 0.6, -r * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.4, r * 0.5); ctx.lineTo(r * 0.6, r * 0.9); ctx.stroke();
    drawEye(r * 0.6, -r * 0.95, r * 0.17);
    drawEye(r * 0.6, r * 0.95, r * 0.17);
  }

  function drawKraken(rBase) {
    const r = rBase * 1.28;
    const t = performance.now() / 280;
    const grd = ctx.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, "#cfa8ff");
    grd.addColorStop(1, "#7b2fff");
    ctx.shadowColor = "#b06bff"; ctx.shadowBlur = 30;
    // waving tentacles (behind)
    ctx.strokeStyle = "#8a3fff"; ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const baseY = -r * 0.55 + i * r * 0.27;
      const wob = Math.sin(t + i) * r * 0.28;
      ctx.lineWidth = r * (0.24 - i * 0.02);
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, baseY * 0.5);
      ctx.quadraticCurveTo(-r * 1.0, baseY + wob, -r * 1.75, baseY * 1.2 + wob);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // bulbous head
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(r * 0.15, -r * 0.05, r * 0.98, r * 0.92, 0, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // big menacing eyes
    drawEye(r * 0.7, -r * 0.35, r * 0.28);
    drawEye(r * 0.7, r * 0.35, r * 0.28);
    // angry brows
    ctx.strokeStyle = "#5a1fb0"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(r * 0.42, -r * 0.62); ctx.lineTo(r * 0.92, -r * 0.38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.42, r * 0.62); ctx.lineTo(r * 0.92, r * 0.38); ctx.stroke();
  }

  // shared: a big clear googly eye
  function drawEye(x, y, rad) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    ctx.fillStyle = "#12080a";
    ctx.beginPath(); ctx.arc(x + rad * 0.18, y, rad * 0.6, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x + rad * 0.38, y - rad * 0.32, rad * 0.22, 0, 7); ctx.fill();
  }

  // shared: a big pincer claw (scaled by r, tinted col)
  function drawClaw(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(y < 0 ? -0.6 : 0.6);
    ctx.fillStyle = col;
    // knuckle
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.6, r * 0.42, 0, 0, 7); ctx.fill();
    // upper pincer
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.12);
    ctx.quadraticCurveTo(r * 1.2, -r * 0.4, r * 1.25, -r * 0.02);
    ctx.quadraticCurveTo(r * 0.85, -r * 0.06, r * 0.45, r * 0.04);
    ctx.closePath(); ctx.fill();
    // lower pincer
    ctx.beginPath();
    ctx.moveTo(r * 0.15, r * 0.14);
    ctx.quadraticCurveTo(r * 1.1, r * 0.34, r * 1.15, r * 0.05);
    ctx.quadraticCurveTo(r * 0.85, r * 0.08, r * 0.45, r * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function onLevelUp(tier) {
    burst(player.x, player.y, "#ffe259", 32, 260);
    burst(player.x, player.y, tier.glow, 22, 210);
    shake = Math.max(shake, 9);
    toast(`${tier.emoji} EVOLVED — ${tier.name}!`);
    beep(500, 0.12, "triangle", 0.06);
    setTimeout(() => beep(760, 0.14, "triangle", 0.06), 90);
    setTimeout(() => beep(1050, 0.16, "triangle", 0.06), 180);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Main loop ----------
  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000) || 0;
    lastTime = now;
    if (state === STATE.PLAY) update(dt);
    else update(dt); // keep stars/particles moving on menus too
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- UI helpers ----------
  function refreshMenuStats() {
    el.startBest.textContent = store.best;
    el.startStreak.textContent = store.streak;
    el.hudBest.textContent = store.best;
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2200);
  }

  // ---------- Share (virality) ----------
  function shareScore() {
    const tier = TIERS[levelForScore(score)];
    const blocks = tier.emoji.repeat(Math.min(8, Math.max(1, Math.round(score / 6)))) || "🦐";
    const text = `PRAWN DASH 🦐\nScore: ${score}  (best ${store.best}) — evolved to ${tier.name} ${tier.emoji}!\n${blocks}\nCan you out-swim me?`;
    const url = location.href;
    if (navigator.share) {
      navigator.share({ title: "Prawn Dash", text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + "\n" + url).then(
        () => toast("Score copied — paste & share! 📋"),
        () => toast(text)
      );
    } else {
      toast("Score: " + score);
    }
  }

  // ---------- Button wiring ----------
  el.btnStart.addEventListener("click", startGame);
  el.btnRetry.addEventListener("click", startGame);
  el.btnShare.addEventListener("click", shareScore);
  el.btnRevive.addEventListener("click", revive);
  el.btnSound.addEventListener("click", () => {
    store.sound = !store.sound;
    localStorage.setItem("nd_sound", store.sound ? "on" : "off");
    el.btnSound.textContent = store.sound ? "🔊" : "🔇";
    if (store.sound) beep(660, 0.08, "triangle", 0.05);
  });

  // ---------- Boot ----------
  resize();
  reset();
  refreshMenuStats();
  el.btnSound.textContent = store.sound ? "🔊" : "🔇";
  requestAnimationFrame(loop);
})();
