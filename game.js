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

  // ---------- Game state ----------
  const STATE = { MENU: 0, PLAY: 1, DEAD: 2 };
  let state = STATE.MENU;

  let player, obstacles, particles, stars, farStars;
  let score, speed, spawnTimer, elapsed, shake, usedRevive;
  let lastTime = 0;

  function reset() {
    player = { x: W * 0.28, y: H * 0.45, vy: 0, rot: 0, trail: [] };
    obstacles = [];
    particles = [];
    score = 0;
    speed = SPEED_BASE;
    spawnTimer = 0.4;
    elapsed = 0;
    shake = 0;
    usedRevive = false;
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
      burst(player.x - 6, player.y + 8, "#22e0ff", 5, 60);
      beep(560, 0.09, "triangle", 0.05);
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

    // parallax stars
    for (const s of farStars) { s.x -= speed * 0.15 * dt; if (s.x < 0) s.x += W; }
    for (const s of stars) { s.x -= speed * 0.4 * dt; s.tw += dt * 3; if (s.x < 0) s.x += W; }

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
          burst(player.x + 20, player.y, "#9b5cff", 8, 120);
          beep(720 + score * 6, 0.08, "square", 0.045);
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
    // near stars (twinkle)
    for (const s of stars) {
      const a = 0.5 + Math.sin(s.tw) * 0.4;
      ctx.fillStyle = `rgba(200,230,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
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
    const col = `hsl(${o.hue}, 100%, 62%)`;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(10,10,35,0.9)";
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    // top pillar
    roundRect(o.x, -10, o.w, o.gapY + 10, 8);
    ctx.fill(); ctx.stroke();
    // bottom pillar
    roundRect(o.x, o.gapY + o.gap, o.w, H - (o.gapY + o.gap) + 10, 8);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    // trail
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      const a = (1 - i / player.trail.length) * 0.5;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#22e0ff";
      ctx.beginPath(); ctx.arc(t.x, t.y, PLAYER_R * (1 - i / player.trail.length), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // body
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rot);
    ctx.shadowColor = "#22e0ff";
    ctx.shadowBlur = 28;
    const grd = ctx.createLinearGradient(-PLAYER_R, -PLAYER_R, PLAYER_R, PLAYER_R);
    grd.addColorStop(0, "#8ff6ff");
    grd.addColorStop(1, "#2f9bff");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, 7); ctx.fill();
    // eye glint
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#05040f";
    ctx.beginPath(); ctx.arc(6, -3, 3.5, 0, 7); ctx.fill();
    ctx.restore();
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
    const blocks = "🟦".repeat(Math.min(10, Math.max(1, Math.round(score / 5)))) || "🟦";
    const text = `NEON DASH ⚡\nScore: ${score}  (best ${store.best})\n${blocks}\nCan you beat me?`;
    const url = location.href;
    if (navigator.share) {
      navigator.share({ title: "Neon Dash", text, url }).catch(() => {});
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
