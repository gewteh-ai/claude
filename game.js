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
    layoutScenery();
  }
  window.addEventListener("resize", resize);

  // ---------- DOM ----------
  const el = {
    hud: document.getElementById("hud"),
    hudScore: document.getElementById("hud-score"),
    hudBest: document.getElementById("hud-best"),
    hudCombo: document.getElementById("hud-combo"),
    btnBoost: document.getElementById("btn-boost"),
    boostFill: document.getElementById("boost-fill"),
    boostWrap: document.getElementById("boost-wrap"),
    banner: document.getElementById("banner"),
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
    reward: document.getElementById("reward"),
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
  const GAP_BASE = 240;        // starting gap between obstacles (more forgiving)
  const GAP_MIN = 145;
  const SPEED_BASE = 205;      // px/s horizontal (gentler start)
  const SPEED_MAX = 460;
  const SPAWN_BASE = 1.7;      // seconds between obstacles
  // ---- Excitement Pack tuning ----
  const NEARMISS = 18;                        // px closeness that counts as a "close call"
  const SHIELD_MAX   = [1, 2, 2, 3, 3];       // shield charges by tier (prawn now starts with 1)
  const SHIELD_REGEN = [13, 11, 9, 7, 5];     // seconds to regen a charge by tier
  const JET_NEED = 100;                       // meter fill required for a JET
  const JET_TIME = 3.0;                        // seconds the JET lasts (shorter = controlled)
  const JET_MAGNET = 300;                     // px pearl-magnet radius during JET
  const JET_COOLDOWN = 1.6;                    // seconds after a JET before another can trigger
  const PEARL_FILL = 7;                        // meter gained per pearl (needs ~15 pearls per JET)
  // Evolution tiers — a longer journey (drawX are hoisted fns)
  const TIERS = [
    { name: "PRAWN",     emoji: "🦐", at: 0,   draw: drawPrawn,   glow: "#ff9a4d" },
    { name: "LOBSTER",   emoji: "🦞", at: 45,  draw: drawLobster, glow: "#ff4d4d" },
    { name: "CRAB",      emoji: "🦀", at: 120, draw: drawCrab,    glow: "#ff5ea8" },
    { name: "KRAKEN",    emoji: "🐙", at: 250, draw: drawKraken,  glow: "#b06bff" },
    { name: "LEVIATHAN", emoji: "🐋", at: 450, draw: drawWhale,   glow: "#4db8ff" },
  ];
  function levelForScore(s) { let l = 0; for (let i = 0; i < TIERS.length; i++) if (s >= TIERS[i].at) l = i; return l; }

  // Depth biomes — the reef transforms as you swim deeper (top/bot are gradient RGBs, hue tints coral)
  const BIOMES = [
    { name: "CORAL REEF",           at: 0,   top: [12, 74, 96], bot: [2, 24, 38], hue: 150 },
    { name: "KELP FOREST",          at: 70,  top: [10, 84, 66], bot: [2, 32, 26], hue: 110 },
    { name: "DEEP TRENCH",          at: 200, top: [14, 40, 92], bot: [2, 8, 26],  hue: 205 },
    { name: "BIOLUMINESCENT ABYSS", at: 380, top: [46, 14, 92], bot: [8, 2, 26],  hue: 285 },
  ];
  function biomeFor(s) { let b = 0; for (let i = 0; i < BIOMES.length; i++) if (s >= BIOMES[i].at) b = i; return b; }

  // ---------- Game state ----------
  const STATE = { MENU: 0, PLAY: 1, DEAD: 2 };
  let state = STATE.MENU;

  let player, obstacles, particles, stars, farStars, bubbles, pearls, enemies, floats;
  let score, speed, spawnTimer, elapsed, shake, usedRevive, curLevel, bubbleTimer;
  let combo, multiplier, maxCombo, pearlTimer, enemyTimer;
  let shield, shieldTimer, boost, boosting, invuln, slowmo, flash, jetCd;
  let boxes, boxTimer, fish, fishTimer, weeds, bgScroll;
  let curBiome, bgTop, bgBot, mag, dbl;
  let boss, bossNext, bossFirstDone;
  let lastTime = 0;

  function reset() {
    player = { x: W * 0.28, y: H * 0.45, vy: 0, rot: 0, trail: [] };
    obstacles = [];
    particles = [];
    pearls = [];
    enemies = [];
    floats = [];
    bubbles = bubbles || [];
    score = 0;
    speed = SPEED_BASE;
    spawnTimer = 0.4;
    elapsed = 0;
    shake = 0;
    usedRevive = false;
    curLevel = 0;
    bubbleTimer = 0;
    // excitement systems
    combo = 0; multiplier = 1; maxCombo = 0;
    pearlTimer = 1.1; enemyTimer = 3.5;
    shield = SHIELD_MAX[0]; shieldTimer = SHIELD_REGEN[0]; // begin with a cushion
    boost = 0; boosting = 0; invuln = 0; slowmo = 0; flash = 0; jetCd = 0;
    // mystery boxes + scenery
    boxes = []; boxTimer = 6.5;
    fish = fish || []; fishTimer = 1.2;
    bgScroll = 0;
    // biomes + power-ups
    curBiome = 0; bgTop = BIOMES[0].top.slice(); bgBot = BIOMES[0].bot.slice();
    mag = 0; dbl = 0;
    // boss chase
    boss = { active: false, x: -120, y: H * 0.5, phase: "", timer: 0, snap: 0 };
    bossNext = 55; bossFirstDone = false;
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

  // ---------- Scenery (seaweed strands for foreground parallax) ----------
  function layoutScenery() {
    weeds = [];
    const wc = Math.ceil(W / 110) + 3;
    for (let i = 0; i < wc; i++) {
      weeds.push({ x: i * 110 + Math.random() * 50, h: 70 + Math.random() * 150, ph: Math.random() * 6, seg: 5 + (Math.random() * 3 | 0) });
    }
  }

  // ---------- Obstacles ----------
  function spawnObstacle() {
    const gap = Math.max(GAP_MIN, GAP_BASE - Math.min(score, 90) * 0.85);
    const margin = 70;
    const gapY = margin + Math.random() * (H - gap - margin * 2);
    // moving gaps appear once you reach the trench (score >= 200)
    const moveAmp = (score >= 200 && Math.random() < 0.5) ? (24 + Math.random() * 42) : 0;
    obstacles.push({ x: W + 40, gapY, baseGapY: gapY, gap, w: 62, passed: false, hue: (score * 18) % 360, moveAmp, movePh: Math.random() * 6 });
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

  // a tone with optional pitch glide (for dramatic stings)
  function tone(freq, start, dur, type, vol, glideTo) {
    if (!actx) return;
    const o = actx.createOscillator(); const g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(start); o.stop(start + dur + 0.03);
  }

  // dramatic "dun-dun-dunnn + boom" game-over sting
  function sfxGameOver() {
    if (!store.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      tone(80, t, 0.85, "sine", 0.16);                  // deep impact boom
      tone(392, t + 0.02, 0.22, "sawtooth", 0.10);      // dun
      tone(311, t + 0.26, 0.22, "sawtooth", 0.10);      // dun
      tone(233, t + 0.50, 0.65, "sawtooth", 0.12, 110); // dunnn (falling)
      tone(55, t + 0.55, 1.0, "sine", 0.10);            // low rumble tail
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
    el.hudCombo.classList.add("hidden");
    el.btnBoost.classList.add("hidden");
    el.banner.classList.add("hidden");
    el.boostWrap.classList.remove("hidden");
    el.boostFill.style.width = "0%";
    lastTime = performance.now();
  }

  function die() {
    if (state !== STATE.PLAY) return;
    state = STATE.DEAD;
    shake = 20;
    burst(player.x, player.y, "#ff2fb9", 40, 300);
    sfxGameOver();

    const isBest = score > store.best;
    if (isBest) { store.best = score; localStorage.setItem("nd_best", score); }

    // streak: increases if you beat/equal a small threshold, else reset — keeps the daily-play hook
    if (score > 0) { store.streak++; } else { store.streak = 0; }
    localStorage.setItem("nd_streak", store.streak);

    // show game-over after brief delay for the death juice
    setTimeout(() => {
      el.hud.classList.add("hidden");
      el.hudCombo.classList.add("hidden");
      el.boostWrap.classList.add("hidden");
      el.btnBoost.classList.add("hidden");
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
    el.boostWrap.classList.remove("hidden");
    // clear nearby obstacles + enemies so player isn't instantly killed
    obstacles = obstacles.filter(o => o.x > player.x + 160);
    enemies = enemies.filter(en => en.x > player.x + 160);
    invuln = 1.5;
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

  // ---------- Excitement helpers ----------
  function addFloat(x, y, text, color) { floats.push({ x, y, text, color: color || "#fff", life: 1.1 }); }

  function addScore(amount, x, y, txt, color) {
    score += (dbl > 0 ? amount * 2 : amount);
    if (txt) addFloat(x, y, txt, color);
  }

  function bumpMultiplier() {
    maxCombo = Math.max(maxCombo, combo);
    multiplier = Math.min(5, 1 + Math.floor(combo / 5));
  }

  function spawnPearl() {
    const margin = 74;
    const y = margin + Math.random() * (H - margin * 2);
    for (let i = 0; i < 3; i++) {
      pearls.push({ x: W + 30 + i * 32, y: y + Math.sin(i) * 6, r: 8, ph: Math.random() * 6, got: false });
    }
  }

  function spawnEnemy() {
    const margin = 70;
    enemies.push({ x: W + 40, baseY: margin + Math.random() * (H - margin * 2), amp: 24 + Math.random() * 36, ph: Math.random() * 6, r: 20, pulse: Math.random() * 6, hit: false });
  }
  function enemyY(en) { return en.baseY + Math.sin(elapsed * 2 + en.ph) * en.amp; }

  function spawnBox() {
    const margin = 95;
    boxes.push({ x: W + 30, y: margin + Math.random() * (H - margin * 2), r: 18, spin: Math.random() * 6, got: false });
  }

  function spawnFish() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    fish.push({
      x: dir > 0 ? -30 : W + 30, y: 40 + Math.random() * (H - 80), dir,
      sz: 7 + Math.random() * 13, spd: 26 + Math.random() * 55, ph: Math.random() * 6,
      col: `hsl(${170 + Math.random() * 70}, 70%, ${55 + Math.random() * 18}%)`,
    });
  }

  // ---------- Mystery box rewards ----------
  const BOX_REWARDS = [
    { txt: "🚀 JET CHARGED!", act: () => { boost = JET_NEED; } },
    { txt: "🫧 PEARL BURST +12", act: () => { addScore(12, player.x, player.y - 20, "+12", "#7fe8ff"); } },
    { txt: "🛡️ SHIELD +1", act: () => { shield = Math.min(3, shield + 1); invuln = Math.max(invuln, 0.4); } },
    { txt: "⭐ SCORE +50", act: () => { addScore(50, player.x, player.y - 20, "+50", "#ffe259"); } },
    { txt: "🐢 SLOW-MO BONUS", act: () => { slowmo = Math.max(slowmo, 1.3); addScore(5 * multiplier, player.x, player.y - 20, "+" + (5 * multiplier), "#ffe259"); } },
    { txt: "✨ COMBO x5!", act: () => { combo += 20; bumpMultiplier(); } },
    { txt: "🧲 MAGNET 6s", act: () => { mag = Math.max(mag, 6); } },
    { txt: "💰 DOUBLE SCORE 8s", act: () => { dbl = Math.max(dbl, 8); } },
  ];
  function openBox(bx) {
    bx.got = true;
    const r = BOX_REWARDS[Math.floor(Math.random() * BOX_REWARDS.length)];
    r.act();
    burst(bx.x, bx.y, "#ffe259", 26, 250);
    shake = Math.max(shake, 8); flash = Math.max(flash, 0.35);
    showReward(r.txt);
    beep(720, 0.1, "triangle", 0.06); setTimeout(() => beep(1080, 0.14, "triangle", 0.06), 90);
  }

  let rewardTimer = null;
  function showReward(text) {
    el.reward.textContent = text;
    el.reward.classList.remove("hidden", "reward-anim");
    void el.reward.offsetWidth;
    el.reward.classList.add("reward-anim");
    clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => el.reward.classList.add("hidden"), 1600);
  }

  // ---------- Boss chase (predator shark) ----------
  function startBoss() {
    boss.active = true; boss.phase = "chase"; boss.x = -100; boss.y = player.y; boss.timer = 14; boss.snap = 0;
    bossFirstDone = true;
    bossNext = Math.floor(score) + 180; // next encounter later on
    showBanner("⚠️ PREDATOR!");
    flash = Math.max(flash, 0.5); shake = Math.max(shake, 10);
    beep(90, 0.5, "sawtooth", 0.1);
  }
  function updateBoss(realDt, gdt) {
    if (!boss.active) {
      // first shark strikes ~5s into the run; later ones by score
      if ((!bossFirstDone && elapsed > 5) || score >= bossNext) startBoss();
      return;
    }
    boss.snap += realDt * 9;
    boss.y += (player.y - boss.y) * Math.min(1, realDt * 2.5);
    if (boss.phase === "chase") {
      boss.timer -= realDt;
      boss.x += (52 + elapsed * 0.6) * gdt;                 // creeps closer over time
      boss.x = Math.max(-140, Math.min(player.x + 6, boss.x));
      if (boss.x >= player.x - 18 && invuln <= 0 && boosting <= 0) { die(); return; }
      if (boss.timer <= 0) {
        boss.phase = "retreat";
        showBanner("😅 ESCAPED!");
        addScore(25, player.x, player.y - 30, "+25", "#8fffa0");
        boost = Math.min(JET_NEED, boost + 30);
        beep(700, 0.12, "triangle", 0.06);
      }
    } else { // retreat
      boss.x -= 240 * realDt;
      if (boss.x < -160) boss.active = false;
    }
  }

  function takeHit(cause) {
    if (state !== STATE.PLAY) return;
    if (invuln > 0 || boosting > 0) return;
    if (shield > 0) {
      shield--;
      invuln = 1.2;
      flash = Math.max(flash, 0.5);
      shake = Math.max(shake, 12);
      combo = 0; multiplier = 1;
      burst(player.x, player.y, "#8fe8ff", 26, 230);
      beep(320, 0.18, "square", 0.06);
      addFloat(player.x, player.y - 32, "SHIELD!", "#8fe8ff");
      if (cause === "wall") { player.y = Math.min(Math.max(player.y, 90), H - 90); player.vy = 0; }
      else { player.vy = FLAP_V * 0.6; }
      return;
    }
    die();
  }

  function doBoost() {
    if (state !== STATE.PLAY || boost < JET_NEED || boosting > 0 || jetCd > 0) return;
    boost = 0;
    boosting = JET_TIME;
    invuln = JET_TIME + 0.4;
    flash = Math.max(flash, 0.55);
    shake = Math.max(shake, 10);
    addFloat(player.x, player.y - 34, "🚀 JET!", "#ffe259");
    beep(180, 0.3, "sawtooth", 0.07);
    setTimeout(() => beep(300, 0.2, "sawtooth", 0.05), 120);
  }

  function updateHUD() {
    el.hudScore.textContent = score;
    if (multiplier > 1 || combo > 1) {
      el.hudCombo.classList.remove("hidden");
      el.hudCombo.textContent = `x${multiplier}  ·  combo ${combo}`;
    } else {
      el.hudCombo.classList.add("hidden");
    }
    el.boostFill.style.width = Math.min(100, (boost / JET_NEED) * 100) + "%";
    el.btnBoost.classList.toggle("hidden", boost < JET_NEED || boosting > 0 || jetCd > 0);
  }

  let bannerTimer = null;
  function showBanner(text) {
    el.banner.textContent = text;
    el.banner.classList.remove("hidden", "banner-anim");
    void el.banner.offsetWidth; // reflow to restart animation
    el.banner.classList.add("banner-anim");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.add("hidden"), 1400);
  }

  // ---------- Update ----------
  function update(dt) {
    const realDt = dt;
    // real-time timers (unaffected by slow-mo)
    if (invuln > 0) invuln -= realDt;
    if (flash > 0) flash = Math.max(0, flash - realDt * 2.2);
    if (slowmo > 0) slowmo -= realDt;
    if (boosting > 0) { boosting -= realDt; if (boosting <= 0) { boosting = 0; jetCd = JET_COOLDOWN; } }
    if (jetCd > 0) jetCd -= realDt;
    if (mag > 0) mag -= realDt;
    if (dbl > 0) dbl -= realDt;
    if (state === STATE.PLAY && shield < SHIELD_MAX[curLevel]) {
      shieldTimer -= realDt;
      if (shieldTimer <= 0) {
        shield++; shieldTimer = SHIELD_REGEN[curLevel];
        addFloat(player.x, player.y - 30, "+SHIELD", "#8fe8ff");
        beep(720, 0.1, "sine", 0.05);
      }
    }

    const timeScale = slowmo > 0 ? 0.4 : 1;
    const gdt = realDt * timeScale;

    elapsed += gdt;
    speed = Math.min(SPEED_MAX, SPEED_BASE + elapsed * 6);
    if (boosting > 0) speed *= 1.55;
    const spawnInterval = Math.max(0.95, SPAWN_BASE - elapsed * 0.012);

    // parallax light specks
    for (const s of farStars) { s.x -= speed * 0.15 * gdt; if (s.x < 0) s.x += W; }
    for (const s of stars) { s.x -= speed * 0.4 * gdt; s.tw += realDt * 3; if (s.x < 0) s.x += W; }

    // rising bubbles (ambience — real time so menus stay alive)
    bubbleTimer -= realDt;
    if (bubbleTimer <= 0) {
      bubbles.push({ x: Math.random() * W, y: H + 12, r: Math.random() * 6 + 2, vy: Math.random() * 45 + 28, wob: Math.random() * 22 + 8, ph: Math.random() * 6 });
      bubbleTimer = 0.16;
    }
    for (const b of bubbles) { b.y -= b.vy * realDt; b.ph += realDt * 2; b.x += Math.sin(b.ph) * b.wob * realDt; }
    bubbles = bubbles.filter(b => b.y > -20);

    // background scroll + ambient fish (also on menus)
    bgScroll += speed * gdt * 0.15;
    fishTimer -= realDt;
    if (fishTimer <= 0) { spawnFish(); fishTimer = 0.7 + Math.random() * 1.6; }
    for (const f of fish) { f.x += f.dir * f.spd * realDt; f.y += Math.sin(elapsed * 2 + f.ph) * 8 * realDt; }
    fish = fish.filter(f => f.x > -60 && f.x < W + 60);

    // biome progression + smooth colour transition
    if (state === STATE.PLAY) {
      const nb = biomeFor(score);
      if (nb !== curBiome) { curBiome = nb; showBanner("🌊 " + BIOMES[nb].name); flash = Math.max(flash, 0.4); }
    }
    const tb = BIOMES[curBiome];
    const bk = Math.min(1, realDt * 1.5);
    for (let i = 0; i < 3; i++) { bgTop[i] += (tb.top[i] - bgTop[i]) * bk; bgBot[i] += (tb.bot[i] - bgBot[i]) * bk; }

    // floating score texts
    for (const f of floats) { f.y -= 42 * realDt; f.life -= realDt; }
    floats = floats.filter(f => f.life > 0);

    if (state === STATE.PLAY) {
      // player physics
      if (boosting > 0) {
        // JET mode: gravity off, damped steering, stays on screen, exhaust trail
        player.vy *= 0.9;
        player.y += player.vy * gdt;
        player.y = Math.min(Math.max(player.y, 60), H - 60);
        player.rot = -0.22;
        if (Math.random() < 0.7) burst(player.x - 20, player.y + 3, "#ffd24d", 2, 70);
      } else {
        player.vy += GRAVITY * gdt;
        player.y += player.vy * gdt;
        player.rot = Math.max(-0.5, Math.min(1.1, player.vy / 700));
      }

      // trail
      player.trail.unshift({ x: player.x, y: player.y });
      if (player.trail.length > 14) player.trail.pop();

      // spawns (pearls come thick and fast during a JET so you sweep them up)
      spawnTimer -= gdt;
      if (spawnTimer <= 0) { spawnObstacle(); spawnTimer = spawnInterval; }
      pearlTimer -= gdt;
      if (pearlTimer <= 0) { spawnPearl(); pearlTimer = boosting > 0 ? 0.32 : 0.9 + Math.random() * 0.9; }
      if (elapsed > 6) {
        enemyTimer -= gdt;
        if (enemyTimer <= 0) { spawnEnemy(); enemyTimer = 2.6 + Math.random() * 2.6; }
      }
      boxTimer -= gdt;
      if (boxTimer <= 0) { spawnBox(); boxTimer = 7 + Math.random() * 5; }

      // obstacles
      for (const o of obstacles) {
        o.x -= speed * gdt;
        if (o.moveAmp) o.gapY = Math.max(40, Math.min(H - o.gap - 40, o.baseGapY + Math.sin(elapsed * 1.4 + o.movePh) * o.moveAmp));
        // smash through during boost
        if (boosting > 0 && !o.smashed && hits(player, o)) {
          o.smashed = true; o.passed = true;
          burst(o.x + o.w / 2, player.y, "#ffe259", 22, 280);
          addScore(2, o.x + o.w / 2, player.y, "+2", "#ffe259");
          beep(240, 0.12, "square", 0.06); shake = Math.max(shake, 8);
          continue;
        }
        if (!o.passed && o.x + o.w < player.x) {
          o.passed = true;
          combo++;
          const edge = Math.min(player.y - o.gapY, (o.gapY + o.gap) - player.y) - PLAYER_R;
          if (edge < NEARMISS && edge > -3 && boosting <= 0) {
            slowmo = 0.32; flash = Math.max(flash, 0.22);
            addScore(3 * multiplier, player.x, player.y - 26, "CLOSE! +" + (3 * multiplier), "#ffe259");
            beep(950, 0.12, "triangle", 0.05);
          }
          bumpMultiplier();
          score += (dbl > 0 ? 2 : 1);
          burst(player.x + 20, player.y, "#ffd27a", 6, 100);
          beep(600 + score * 4, 0.06, "triangle", 0.035);
          const newLevel = levelForScore(score);
          if (newLevel > curLevel) { curLevel = newLevel; onLevelUp(TIERS[curLevel]); }
          if (boss.active && boss.phase === "chase") boss.x -= 42; // outswim the predator
        }
        if (!o.smashed && boosting <= 0 && hits(player, o)) takeHit("obstacle");
      }
      obstacles = obstacles.filter(o => o.x + o.w > -30 && !o.smashed);

      // pearls
      for (const pr of pearls) {
        pr.x -= speed * gdt; pr.ph += realDt * 4;
        // magnet: JET pulls hard, the magnet power-up pulls gently
        if ((boosting > 0 || mag > 0) && !pr.got) {
          const rad = boosting > 0 ? JET_MAGNET : 240;
          const pull = boosting > 0 ? 640 : 380;
          const mdx = player.x - pr.x, mdy = player.y - pr.y;
          const md = Math.hypot(mdx, mdy) || 1;
          if (md < rad) { pr.x += (mdx / md) * pull * gdt; pr.y += (mdy / md) * pull * gdt; }
        }
        const py = pr.y + Math.sin(pr.ph) * 4;
        const dx = pr.x - player.x, dy = py - player.y;
        if (!pr.got && dx * dx + dy * dy < (PLAYER_R + pr.r + 4) * (PLAYER_R + pr.r + 4)) {
          pr.got = true;
          combo++; bumpMultiplier();
          addScore(1 * multiplier, pr.x, py - 12, "+" + (1 * multiplier), "#7fe8ff");
          if (boosting <= 0) boost = Math.min(JET_NEED, boost + PEARL_FILL); // no recharge mid-JET
          burst(pr.x, py, "#7fe8ff", 10, 130);
          beep(1000 + combo * 8, 0.06, "sine", 0.05);
          if (boss.active && boss.phase === "chase") boss.x -= 12;
        }
      }
      pearls = pearls.filter(pr => !pr.got && pr.x > -20);

      // mystery boxes
      for (const bx of boxes) {
        bx.x -= speed * gdt; bx.spin += realDt * 3;
        if (boosting > 0 && !bx.got) { // JET magnet grabs boxes too
          const mdx = player.x - bx.x, mdy = player.y - bx.y; const md = Math.hypot(mdx, mdy) || 1;
          if (md < JET_MAGNET) { bx.x += (mdx / md) * 520 * gdt; bx.y += (mdy / md) * 520 * gdt; }
        }
        const dx = bx.x - player.x, dy = bx.y - player.y;
        if (!bx.got && dx * dx + dy * dy < (PLAYER_R + bx.r + 6) * (PLAYER_R + bx.r + 6)) openBox(bx);
      }
      boxes = boxes.filter(bx => !bx.got && bx.x > -40);

      // enemies (jellyfish)
      for (const en of enemies) {
        en.x -= (speed * 0.82) * gdt; en.pulse += realDt * 3;
        const ey = enemyY(en);
        const dx = en.x - player.x, dy = ey - player.y;
        if (!en.hit && dx * dx + dy * dy < (PLAYER_R + en.r) * (PLAYER_R + en.r)) {
          if (boosting > 0) {
            en.hit = true; burst(en.x, ey, "#c9b0ff", 16, 200);
            addScore(3, en.x, ey - 10, "+3", "#c9b0ff"); beep(300, 0.1, "square", 0.05);
          } else { en.hit = true; takeHit("enemy"); }
        }
      }
      enemies = enemies.filter(en => !en.hit && en.x > -50);

      // boss predator chase
      updateBoss(realDt, gdt);

      // floor / ceiling
      if (player.y + PLAYER_R > H || player.y - PLAYER_R < 0) takeHit("wall");

      updateHUD();
    }

    // particles
    for (const p of particles) {
      p.x += p.vx * gdt; p.y += p.vy * gdt;
      p.vy += 300 * gdt;
      p.life -= realDt * 1.8;
    }
    particles = particles.filter(p => p.life > 0);

    if (shake > 0) shake = Math.max(0, shake - realDt * 60);
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

    // biome background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `rgb(${bgTop[0] | 0},${bgTop[1] | 0},${bgTop[2] | 0})`);
    bg.addColorStop(1, `rgb(${bgBot[0] | 0},${bgBot[1] | 0},${bgBot[2] | 0})`);
    ctx.fillStyle = bg;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    // background layers
    drawGodRays();
    drawReef();

    // far stars
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (const s of farStars) { ctx.fillRect(s.x, s.y, s.r, s.r); }
    // near specks (twinkle like sunlight through water)
    for (const s of stars) {
      const a = 0.4 + Math.sin(s.tw) * 0.35;
      ctx.fillStyle = `rgba(150,225,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }

    // drifting fish + swaying seaweed
    drawFishAll();
    drawSeaweed();

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

    // pearls
    for (const pr of pearls) { drawPearl(pr.x, pr.y + Math.sin(pr.ph) * 4, pr.r); }

    // mystery boxes
    for (const bx of boxes) drawBox(bx);

    // enemies (jellyfish)
    for (const en of enemies) { drawJelly(en.x, enemyY(en), en.r, en.pulse); }

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

    // JET flame + magnet ring
    if (boosting > 0 && state === STATE.PLAY) {
      ctx.save();
      // magnet radius hint
      ctx.strokeStyle = "rgba(127,232,255,0.22)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, player.y, JET_MAGNET * 0.5, 0, 7); ctx.stroke();
      // flame cone streaking behind
      for (let i = 1; i <= 6; i++) {
        ctx.globalAlpha = 0.55 / i;
        ctx.fillStyle = i % 2 ? "rgba(255,170,40,1)" : "rgba(255,240,120,1)";
        ctx.beginPath(); ctx.ellipse(player.x - 16 - i * 15, player.y, 20 + i * 4, 9, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    // boss predator (drawn just behind the player)
    if (boss.active) drawShark(boss.x, boss.y, boss.snap);

    // player (only when in play / dead juice)
    if (state !== STATE.MENU) drawPlayer();

    // shield ring(s) around player
    if (state === STATE.PLAY && shield > 0) {
      const pulse = 1 + Math.sin(performance.now() / 160) * 0.06;
      for (let i = 0; i < shield; i++) {
        ctx.strokeStyle = "rgba(140,232,255," + (0.85 - i * 0.25) + ")";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(player.x, player.y, (PLAYER_R + 10 + i * 6) * pulse, 0, 7); ctx.stroke();
      }
    }

    // floating score texts
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.font = "700 20px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = f.color; ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    ctx.restore();

    // danger vignette while the predator is closing in
    if (boss.active && boss.phase === "chase") {
      const prox = Math.max(0, Math.min(1, 1 - (player.x - boss.x) / (player.x * 0.9)));
      if (prox > 0.02) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
        g.addColorStop(0, "rgba(255,0,30,0)");
        g.addColorStop(1, "rgba(255,0,40," + (0.45 * prox) + ")");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }

    // active power-up indicators (top-left, screen-fixed)
    if (state === STATE.PLAY && (mag > 0 || dbl > 0)) {
      ctx.font = "700 18px 'Trebuchet MS', sans-serif"; ctx.textAlign = "left";
      let iy = 92;
      if (mag > 0) { ctx.fillStyle = "#8fe8ff"; ctx.fillText("🧲 " + Math.ceil(mag) + "s", 16, iy); iy += 26; }
      if (dbl > 0) { ctx.fillStyle = "#ffe259"; ctx.fillText("💰 2× " + Math.ceil(dbl) + "s", 16, iy); }
    }

    // full-screen flash (over everything, no shake offset)
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (flash * 0.5) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPearl(x, y, r) {
    ctx.save();
    ctx.shadowColor = "#7fe8ff"; ctx.shadowBlur = 16;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, "#bff4ff");
    g.addColorStop(1, "#38c6ff");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.28, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawJelly(x, y, r, pulse) {
    ctx.save();
    const squash = 1 + Math.sin(pulse) * 0.12;
    ctx.shadowColor = "#b98bff"; ctx.shadowBlur = 18;
    // tentacles
    ctx.strokeStyle = "rgba(190,150,255,0.7)"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      const tx = x + i * (r * 0.28);
      ctx.beginPath();
      ctx.moveTo(tx, y + r * 0.3);
      ctx.quadraticCurveTo(tx + Math.sin(pulse + i) * 6, y + r * 1.0, tx + Math.sin(pulse + i) * 10, y + r * 1.6);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // bell (dome)
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, "rgba(210,180,255,0.95)");
    g.addColorStop(1, "rgba(150,100,255,0.55)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * squash, r * 0.85, 0, Math.PI, 0);
    ctx.closePath(); ctx.fill();
    // inner glow
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.25, r * 0.3, r * 0.22, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- Background scenery ----------
  function drawGodRays() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const t = performance.now() / 4200;
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.24) + Math.sin(t + i * 1.7) * 50;
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = "#8fd8ff";
      ctx.beginPath();
      ctx.moveTo(x - 26, 0); ctx.lineTo(x + 26, 0);
      ctx.lineTo(x + 130, H); ctx.lineTo(x + 30, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawReef() {
    // far silhouette
    ctx.fillStyle = "rgba(4,44,60,0.5)";
    ctx.beginPath(); ctx.moveTo(0, H);
    const o1 = bgScroll * 0.3;
    for (let x = 0; x <= W; x += 22) {
      const y = H - 55 - Math.sin((x + o1) / 72) * 30 - Math.sin((x + o1) / 31) * 16;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // near silhouette (darker)
    ctx.fillStyle = "rgba(2,28,40,0.72)";
    ctx.beginPath(); ctx.moveTo(0, H);
    const o2 = bgScroll * 0.6;
    for (let x = 0; x <= W; x += 22) {
      const y = H - 22 - Math.sin((x + o2) / 48) * 22 - Math.sin((x + o2) / 19) * 11;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawFishAll() {
    for (const f of fish) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.dir, 1);
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = f.col;
      ctx.beginPath(); ctx.ellipse(0, 0, f.sz, f.sz * 0.56, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-f.sz, 0); ctx.lineTo(-f.sz - f.sz * 0.7, -f.sz * 0.5); ctx.lineTo(-f.sz - f.sz * 0.7, f.sz * 0.5); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0a1a22";
      ctx.beginPath(); ctx.arc(f.sz * 0.5, -f.sz * 0.1, f.sz * 0.12, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  function drawSeaweed() {
    const t = performance.now() / 650;
    ctx.lineCap = "round";
    for (const w of weeds) {
      let x = ((w.x - bgScroll * 0.5) % (W + 140) + (W + 140)) % (W + 140) - 70;
      ctx.strokeStyle = "rgba(28,150,92,0.42)";
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, H);
      for (let i = 1; i <= w.seg; i++) {
        const yy = H - (w.h / w.seg) * i;
        const xx = x + Math.sin(t + w.ph + i * 0.5) * (i * 3.2);
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  function drawShark(x, y, snap) {
    const R = 44;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "#0a1620"; ctx.shadowBlur = 18;
    const grd = ctx.createLinearGradient(0, -R, 0, R);
    grd.addColorStop(0, "#6b8496"); grd.addColorStop(1, "#22323e");
    ctx.fillStyle = grd;
    // body (snout to the right, toward the player)
    ctx.beginPath();
    ctx.moveTo(-R * 1.7, 0);
    ctx.quadraticCurveTo(-R * 0.4, -R * 0.85, R * 1.25, -R * 0.22);
    ctx.quadraticCurveTo(R * 1.55, 0, R * 1.25, R * 0.22);
    ctx.quadraticCurveTo(-R * 0.4, R * 0.85, -R * 1.7, 0);
    ctx.closePath(); ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(-R * 1.5, 0); ctx.lineTo(-R * 2.25, -R * 0.85); ctx.lineTo(-R * 1.85, 0); ctx.lineTo(-R * 2.25, R * 0.85);
    ctx.closePath(); ctx.fill();
    // dorsal + pectoral fins
    ctx.beginPath(); ctx.moveTo(-R * 0.1, -R * 0.62); ctx.lineTo(R * 0.35, -R * 1.4); ctx.lineTo(R * 0.55, -R * 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(R * 0.2, R * 0.4); ctx.lineTo(R * 0.4, R * 1.1); ctx.lineTo(R * 0.7, R * 0.4); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // gaping, snapping mouth
    const open = (Math.sin(snap) * 0.5 + 0.5) * R * 0.42 + R * 0.12;
    ctx.fillStyle = "#3a0a12";
    ctx.beginPath();
    ctx.moveTo(R * 0.5, -open * 0.4); ctx.lineTo(R * 1.4, 0); ctx.lineTo(R * 0.5, open);
    ctx.closePath(); ctx.fill();
    // teeth
    ctx.fillStyle = "#f2f5f7";
    for (let i = 0; i < 4; i++) {
      const tx = R * 0.58 + i * R * 0.2;
      ctx.beginPath(); ctx.moveTo(tx, -open * 0.4); ctx.lineTo(tx + R * 0.1, -open * 0.4 + R * 0.16); ctx.lineTo(tx + R * 0.2, -open * 0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx, open); ctx.lineTo(tx + R * 0.1, open - R * 0.16); ctx.lineTo(tx + R * 0.2, open); ctx.closePath(); ctx.fill();
    }
    // eye
    ctx.fillStyle = "#ffdd33"; ctx.beginPath(); ctx.arc(R * 0.5, -R * 0.32, R * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(R * 0.53, -R * 0.32, R * 0.06, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBox(bx) {
    ctx.save();
    ctx.translate(bx.x, bx.y);
    ctx.rotate(Math.sin(bx.spin) * 0.3);
    ctx.shadowColor = "#ffd23a"; ctx.shadowBlur = 20;
    const g = ctx.createLinearGradient(-bx.r, -bx.r, bx.r, bx.r);
    g.addColorStop(0, "#ffe27a"); g.addColorStop(1, "#ff9e00");
    ctx.fillStyle = g;
    roundRect(-bx.r, -bx.r, bx.r * 2, bx.r * 2, 5); ctx.fill();
    ctx.shadowBlur = 0;
    // ribbon
    ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -bx.r); ctx.lineTo(0, bx.r); ctx.moveTo(-bx.r, 0); ctx.lineTo(bx.r, 0); ctx.stroke();
    // question mark
    ctx.fillStyle = "#7a3e00"; ctx.font = "700 18px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("?", 0, 1);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  function drawObstacle(o) {
    // glowing coral tinted by the current biome
    const col = `hsl(${BIOMES[curBiome].hue + (o.hue % 40) - 20}, 78%, 56%)`;
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
    // flicker while invulnerable (but stay solid during a boost)
    if (invuln > 0 && boosting <= 0) ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 45) * 0.3;
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rot);
    TIERS[curLevel].draw(PLAYER_R);
    ctx.restore();
    ctx.globalAlpha = 1;
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

  function drawWhale(rBase) {
    const r = rBase * 1.4;
    const grd = ctx.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, "#8fd6ff");
    grd.addColorStop(1, "#1f6dc0");
    ctx.shadowColor = "#4db8ff"; ctx.shadowBlur = 30;
    ctx.fillStyle = grd;
    // body
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.68, 0, 0, 7); ctx.fill();
    // tail fluke (left)
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, 0);
    ctx.quadraticCurveTo(-r * 1.7, -r * 0.5, -r * 1.95, -r * 0.72);
    ctx.quadraticCurveTo(-r * 1.5, -r * 0.2, -r * 1.55, 0);
    ctx.quadraticCurveTo(-r * 1.5, r * 0.2, -r * 1.95, r * 0.72);
    ctx.quadraticCurveTo(-r * 1.7, r * 0.5, -r * 1.05, 0);
    ctx.closePath(); ctx.fill();
    // pectoral fin
    ctx.beginPath(); ctx.ellipse(r * 0.15, r * 0.5, r * 0.36, r * 0.18, 0.6, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // lighter belly
    ctx.fillStyle = "rgba(224,246,255,0.45)";
    ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.3, r * 0.85, r * 0.28, 0, 0, 7); ctx.fill();
    // mouth
    ctx.strokeStyle = "#12456e"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(r * 1.12, r * 0.08); ctx.quadraticCurveTo(r * 0.7, r * 0.36, r * 0.3, r * 0.3); ctx.stroke();
    // spout
    ctx.strokeStyle = "rgba(190,235,255,0.75)"; ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.62); ctx.quadraticCurveTo(r * 0.4 + i * 8, -r * 1.0, r * 0.4 + i * 15, -r * 1.25); ctx.stroke();
    }
    // eye
    drawEye(r * 0.82, -r * 0.16, r * 0.16);
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
    burst(player.x, player.y, "#ffe259", 34, 280);
    burst(player.x, player.y, tier.glow, 24, 220);
    shake = Math.max(shake, 11);
    flash = Math.max(flash, 0.6);
    invuln = Math.max(invuln, 0.8);            // brief mercy on evolve
    shield = SHIELD_MAX[curLevel];             // top up shields to the new tier's max
    shieldTimer = SHIELD_REGEN[curLevel];
    showBanner(`${tier.emoji}  ${tier.name}!`);
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
  el.btnBoost.addEventListener("click", doBoost);
  // keyboard: B triggers boost
  window.addEventListener("keydown", (e) => { if (e.code === "KeyB") doBoost(); });
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
