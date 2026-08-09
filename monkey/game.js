(function () {
  "use strict";
  const cvs = document.getElementById("game");
  const ctx = cvs.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  // ---------- Layout ----------
  const LANES = 4;
  const LANE_COL = ["#ff5ea8", "#38e0ff", "#ffd83a", "#8fffa0"];
  const LANE_GLYPH = ["\u2190", "\u2193", "\u2191", "\u2192"]; // ← ↓ ↑ →
  let laneW = 0, playLeft = 0, playW = 0, receptorY = 0, fallSpeed = 0;
  const fallTime = 1.5;              // seconds a note takes to reach the pads
  const noteH = 30;

  function layout() {
    playW = Math.min(W, 560);
    playLeft = (W - playW) / 2;
    laneW = playW / LANES;
    receptorY = H - Math.max(120, H * 0.16);
    fallSpeed = (receptorY + 60) / fallTime;
    fireflies = [];
    for (let i = 0; i < 16; i++) fireflies.push({ x: Math.random() * W, y: 40 + Math.random() * H * 0.6, ph: Math.random() * 7, sp: 0.4 + Math.random() * 0.7 });
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = Math.floor(W * DPR); cvs.height = Math.floor(H * DPR);
    cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
  }
  window.addEventListener("resize", resize);

  // ---------- DOM ----------
  const el = {
    startScreen: document.getElementById("start-screen"),
    overScreen: document.getElementById("over-screen"),
    startBest: document.getElementById("start-best"),
    goTitle: document.getElementById("go-title"),
    goScore: document.getElementById("go-score"),
    goSub: document.getElementById("go-sub"),
    goBest: document.getElementById("go-best"),
    newBest: document.getElementById("new-best"),
    btnStart: document.getElementById("btn-start"),
    btnRetry: document.getElementById("btn-retry"),
    btnShare: document.getElementById("btn-share"),
    btnSound: document.getElementById("btn-sound"),
    toast: document.getElementById("toast"),
  };

  const store = {
    best: +(localStorage.getItem("mg_best") || 0),
    sound: localStorage.getItem("mg_sound") !== "off",
  };

  const STATE = { MENU: 0, PLAY: 1, JUDGING: 2, OVER: 3 };
  let state = STATE.MENU;
  // judges (dance rating after the song)
  let judges = [], judgePhase = 0, judgeTimer = 0, judgeTotal = 0, ratingTitle = "", ratingStars = 0;

  // ---------- Audio ----------
  let actx = null;
  function ensureAudio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function tone(freq, t, dur, type, gain) {
    if (!actx || !store.sound) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(t, dur, gain, hp) {
    if (!actx || !store.sound) return;
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = actx.createBufferSource(); n.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 6000;
    const g = actx.createGain();
    n.connect(f); f.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(gain || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.start(t); n.stop(t + dur + 0.03);
  }
  function kick(t) {
    if (!actx || !store.sound) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.start(t); o.stop(t + 0.2);
  }
  function snare(t) { noise(t, 0.13, 0.08, 3000); tone(190, t, 0.1, "triangle", 0.045); }
  function hat(t) { noise(t, 0.03, 0.025, 8000); }
  function tomHit(freq, t) {
    if (!actx || !store.sound) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.14);
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.17, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  }

  // ---------- Music (an original groove) ----------
  const BPM = 112;
  const stepDur = (60 / BPM) / 2;   // 8th-note grid
  // one bar = 8 steps; loop is 16 steps
  const LEAD = [392, 0, 466, 392, 0, 349, 0, 392, 311, 0, 349, 0, 392, 0, 466, 0];
  const BASS = [98, 98, 78, 78, 87, 87, 98, 98]; // per beat (2 steps)
  const TOM = [0, 0, 0, 220, 0, 0, 175, 0, 0, 0, 0, 247, 0, 196, 0, 0]; // tribal jungle toms
  function playStep(step, t) {
    if (!store.sound || !actx) return;
    if (step % 4 === 0) kick(t);
    if (step % 4 === 2) snare(t);
    hat(t);
    const tf = TOM[step % 16]; if (tf) tomHit(tf, t);      // jungle congas/toms
    const lead = LEAD[step % 16];
    if (lead) tone(lead, t, stepDur * 0.9, "triangle", 0.05); // softer marimba-ish lead
    if (step % 2 === 0) { const b = BASS[(step / 2) % 8]; if (b) tone(b, t, stepDur * 1.7, "sawtooth", 0.05); }
  }

  // ---------- Game state ----------
  let notes = [], score = 0, combo = 0, maxCombo = 0, energy = 0;
  let hitCount = 0, noteCount = 0;
  let songTime = 0, audioStart = 0, nextStepTime = 0, schedStep = 0, genStep = 0, lastLane = -1;
  let laneFlash = [0, 0, 0, 0], popups = [], sparks = [], fireflies = [];
  let poseTimer = 0, poseLane = 0, stumbleTimer = 0;
  const PERF_W = 0.055, GOOD_W = 0.12, MISS_W = 0.17;
  const POSE = 0.22, STUMBLE = 0.45;

  function clockNow() { return actx ? actx.currentTime : performance.now() / 1000; }

  function reset() {
    notes = []; score = 0; combo = 0; maxCombo = 0; energy = 55;
    hitCount = 0; noteCount = 0;
    laneFlash = [0, 0, 0, 0]; popups = []; sparks = [];
    poseTimer = 0; stumbleTimer = 0; lastLane = -1;
  }

  function startGame() {
    ensureAudio();
    reset();
    state = STATE.PLAY;
    audioStart = clockNow();
    nextStepTime = actx ? actx.currentTime : 0;
    schedStep = 0; genStep = 0;
    el.startScreen.classList.add("hidden");
    el.overScreen.classList.add("hidden");
    lastTime = performance.now();
  }

  function showOver() {
    state = STATE.OVER;
    const isBest = score > store.best;
    if (isBest) { store.best = score; localStorage.setItem("mg_best", score); }
    if (el.goTitle) el.goTitle.textContent = ratingTitle || "TIME'S UP!";
    el.goScore.textContent = score;
    const acc = noteCount ? Math.round((hitCount / noteCount) * 100) : 0;
    el.goSub.textContent = "Judges " + judgeTotal + "/30  " + "\u2B50".repeat(ratingStars) + "  ·  " + acc + "% hits · combo " + maxCombo;
    el.goBest.textContent = store.best;
    el.newBest.classList.toggle("hidden", !isBest);
    el.overScreen.classList.remove("hidden");
    if (store.sound && actx) { const t = actx.currentTime; tone(523, t, 0.14, "triangle", 0.06); tone(659, t + 0.12, 0.14, "triangle", 0.06); tone(784, t + 0.26, 0.34, "triangle", 0.06); }
  }

  // ---------- Chart generation ----------
  function maybeSpawn(step) {
    if (step < 8) return;              // 1-bar musical lead-in
    const prog = step - 8;
    const d = Math.min(0.72, 0.30 + prog * 0.0016);
    if (Math.random() < d) {
      let lane = (Math.random() * LANES) | 0;
      if (lane === lastLane && Math.random() < 0.5) lane = (lane + 1) % LANES;
      lastLane = lane;
      notes.push({ lane: lane, time: step * stepDur, y: -60, done: false });
      noteCount++;
      if (prog > 130 && Math.random() < 0.07) {
        const l2 = (lane + 1 + ((Math.random() * (LANES - 1)) | 0)) % LANES;
        notes.push({ lane: l2, time: step * stepDur, y: -60, done: false });
        noteCount++;
      }
    }
  }

  // ---------- Input ----------
  function hitLane(lane) {
    if (state !== STATE.PLAY) return;
    laneFlash[lane] = 1;
    const t = songTime;
    let best = null, bestDiff = 1e9;
    for (const n of notes) {
      if (n.lane !== lane || n.done) continue;
      const diff = Math.abs(n.time - t);
      if (diff < bestDiff) { bestDiff = diff; best = n; }
    }
    if (best && bestDiff <= GOOD_W) {
      best.done = true;
      onHit(lane, bestDiff <= PERF_W);
    }
  }
  function onHit(lane, perfect) {
    hitCount++;
    combo++; if (combo > maxCombo) maxCombo = combo;
    const mult = Math.min(4, 1 + Math.floor(combo / 10));
    score += (perfect ? 100 : 50) * mult;
    energy = Math.min(100, energy + (perfect ? 6 : 4));
    poseTimer = POSE; poseLane = lane;
    addPopup(perfect ? "PERFECT" : "GOOD", perfect ? "#ffd83a" : "#8fffa0", mult);
    burst(laneX(lane), receptorY, LANE_COL[lane], perfect ? 16 : 9);
    if (store.sound && actx) tone(perfect ? 900 : 660, actx.currentTime, 0.08, "triangle", 0.05);
  }
  function onMiss(n) {
    combo = 0;
    energy -= 12;
    stumbleTimer = STUMBLE;
    addPopup("MISS", "#ff6a6a", 0);
    if (store.sound && actx) tone(120, actx.currentTime, 0.16, "sawtooth", 0.05);
    if (energy <= 0) { energy = 0; enterJudging(); }
  }

  function laneX(lane) { return playLeft + (lane + 0.5) * laneW; }
  function laneFromX(x) {
    if (x < playLeft || x > playLeft + playW) return -1;
    return Math.max(0, Math.min(LANES - 1, Math.floor((x - playLeft) / laneW)));
  }

  const KEYMAP = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3, KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    if (state === STATE.MENU && (e.code === "Space" || e.code === "Enter")) { startGame(); return; }
    if (state === STATE.JUDGING && (e.code === "Space" || e.code === "Enter")) { skipJudging(); return; }
    const lane = KEYMAP[e.code];
    if (lane !== undefined) { e.preventDefault(); hitLane(lane); }
  });
  window.addEventListener("pointerdown", function (e) {
    if (e.target && e.target.closest && e.target.closest("button, a")) return;
    if (state === STATE.PLAY) {
      const lane = laneFromX(e.clientX);
      if (lane >= 0) hitLane(lane);
    } else if (state === STATE.MENU) {
      startGame();
    } else if (state === STATE.JUDGING) {
      skipJudging();
    }
  });

  // ---------- FX ----------
  function addPopup(text, color, mult) {
    popups.push({ text: text + (mult > 1 ? "  x" + mult : ""), color: color, life: 1 });
    if (popups.length > 4) popups.shift();
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 180;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 1, color: color });
    }
  }

  // ---------- Update ----------
  let lastTime = 0;
  function update(dt) {
    for (let i = 0; i < LANES; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt * 4);
    for (const p of popups) p.life -= dt * 1.6;
    popups = popups.filter(p => p.life > 0);
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 320 * dt; s.life -= dt * 1.8; }
    sparks = sparks.filter(s => s.life > 0);
    if (poseTimer > 0) poseTimer -= dt;
    if (stumbleTimer > 0) stumbleTimer -= dt;

    if (state === STATE.JUDGING) { updateJudging(dt); return; }
    if (state !== STATE.PLAY) return;

    songTime = clockNow() - audioStart;
    // schedule music ahead of the clock
    if (actx) {
      while (nextStepTime < actx.currentTime + 0.12) {
        playStep(schedStep, nextStepTime);
        schedStep++;
        nextStepTime += stepDur;
      }
    }
    // generate upcoming notes
    const horizon = songTime + fallTime + 0.25;
    while (genStep * stepDur < horizon) { maybeSpawn(genStep); genStep++; }
    // move notes + auto-miss
    for (const n of notes) {
      n.y = receptorY - (n.time - songTime) * fallSpeed;
      if (!n.done && songTime - n.time > MISS_W) { n.done = true; onMiss(n); }
    }
    notes = notes.filter(n => !n.done);

    // slow energy drain keeps pressure on
    energy -= dt * 1.5;
    if (energy <= 0) { energy = 0; enterJudging(); }
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const t = performance.now() / 1000;
    // lush jungle gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1f6a37"); g.addColorStop(0.45, "#0f3f21"); g.addColorStop(1, "#04160b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // warm sun shafts through the canopy
    const sun = ctx.createRadialGradient(W * 0.5, -H * 0.12, 0, W * 0.5, -H * 0.12, H * 0.95);
    sun.addColorStop(0, "rgba(255,224,130,0.20)"); sun.addColorStop(1, "rgba(255,224,130,0)");
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

    // distant canopy silhouette along the top
    ctx.fillStyle = "rgba(4,22,11,0.6)";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H * 0.14);
    for (let x = W; x >= 0; x -= 36) ctx.lineTo(x, H * 0.14 + Math.sin(x * 0.05) * 12 + Math.sin(x * 0.013) * 8);
    ctx.closePath(); ctx.fill();

    // fireflies drifting through the jungle
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const f of fireflies) {
      const fx = f.x + Math.sin(t * f.sp + f.ph) * 20;
      const fy = f.y + Math.cos(t * f.sp * 0.8 + f.ph) * 16;
      const a = Math.max(0, 0.35 + Math.sin(t * 3 + f.ph) * 0.35);
      const gg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8);
      gg.addColorStop(0, "rgba(210,255,130," + a + ")"); gg.addColorStop(1, "rgba(210,255,130,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(fx, fy, 8, 0, 7); ctx.fill();
    }
    ctx.restore();

    // side trunks + swaying vines
    ctx.fillStyle = "#241505"; ctx.fillRect(-12, 0, 30, H); ctx.fillRect(W - 18, 0, 30, H);
    drawVine(22, t); drawVine(W - 22, t + 1.3);

    // jungle-floor bushes bobbing to the beat
    const beat = state === STATE.PLAY ? songTime / (60 / BPM) : t * (BPM / 60);
    for (let i = 0; i < 11; i++) {
      const x = (i + 0.5) * (W / 11);
      const bob = Math.abs(Math.sin(beat * Math.PI + i)) * 6;
      ctx.fillStyle = i % 2 ? "#0a3a1c" : "#0d461f";
      ctx.beginPath(); ctx.arc(x, H - 14 - bob, 34, Math.PI, 0); ctx.fill();
    }

    // tiki torches flanking the dance floor
    drawTorch(playLeft - 26, receptorY - 6, t);
    drawTorch(playLeft + playW + 26, receptorY - 6, t + 0.7);
  }

  function drawVine(x, t) {
    ctx.save();
    ctx.strokeStyle = "#1c6a30"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath();
    for (let y = 0; y <= H * 0.72; y += 10) {
      const xx = x + Math.sin(y * 0.03 + t) * 10;
      if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#2aa04a";
    let k = 0;
    for (let y = 30; y <= H * 0.68; y += 52) {
      const xx = x + Math.sin(y * 0.03 + t) * 10;
      const side = (k++ % 2) ? 1 : -1;
      ctx.save(); ctx.translate(xx, y); ctx.rotate(side * 0.7 + Math.sin(t + y) * 0.1);
      ctx.beginPath(); ctx.ellipse(side * 14, 0, 16, 7, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  function drawTorch(x, y, t) {
    ctx.fillStyle = "#3a2412"; ctx.fillRect(x - 4, y, 8, H - y);
    const gl = ctx.createRadialGradient(x, y - 18, 0, x, y - 18, 90);
    gl.addColorStop(0, "rgba(255,150,40,0.35)"); gl.addColorStop(1, "rgba(255,150,40,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(x, y - 18, 90, 0, 7); ctx.fill(); ctx.restore();
    const fl = 1 + Math.sin(t * 18 + x) * 0.15;
    ctx.fillStyle = "#ff8a1e";
    ctx.beginPath(); ctx.moveTo(x, y - 40 * fl); ctx.quadraticCurveTo(x + 12, y - 14, x, y - 6); ctx.quadraticCurveTo(x - 12, y - 14, x, y - 40 * fl); ctx.fill();
    ctx.fillStyle = "#ffd23a";
    ctx.beginPath(); ctx.moveTo(x, y - 28 * fl); ctx.quadraticCurveTo(x + 7, y - 12, x, y - 6); ctx.quadraticCurveTo(x - 7, y - 12, x, y - 28 * fl); ctx.fill();
  }

  function drawLanes() {
    for (let i = 0; i < LANES; i++) {
      const x = playLeft + i * laneW;
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
      ctx.fillRect(x, 0, laneW, receptorY + 60);
      ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, receptorY + 60); ctx.stroke();
    }
    // hit line
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(playLeft, receptorY); ctx.lineTo(playLeft + playW, receptorY); ctx.stroke();
    // receptor pads
    for (let i = 0; i < LANES; i++) {
      const cx = laneX(i);
      const flash = laneFlash[i];
      ctx.save();
      ctx.translate(cx, receptorY);
      const r = laneW * 0.32;
      ctx.beginPath(); roundRectPath(-r, -r, r * 2, r * 2, 12);
      ctx.lineWidth = 3; ctx.strokeStyle = LANE_COL[i];
      ctx.globalAlpha = 0.55 + flash * 0.45;
      if (flash > 0) { ctx.fillStyle = hexA(LANE_COL[i], 0.25 + flash * 0.4); ctx.fill(); ctx.shadowColor = LANE_COL[i]; ctx.shadowBlur = 20 * flash; }
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.fillStyle = LANE_COL[i]; ctx.font = "bold " + Math.floor(r * 1.1) + "px Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(LANE_GLYPH[i], 0, 2);
      ctx.restore();
    }
  }

  function drawNotes() {
    for (const n of notes) {
      if (n.y < -noteH || n.y > H + noteH) continue;
      const cx = laneX(n.lane);
      const r = laneW * 0.30;
      ctx.save();
      ctx.translate(cx, n.y);
      ctx.beginPath(); roundRectPath(-r, -r * 0.72, r * 2, r * 1.44, 10);
      ctx.fillStyle = LANE_COL[n.lane];
      ctx.shadowColor = LANE_COL[n.lane]; ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.font = "bold " + Math.floor(r) + "px Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(LANE_GLYPH[n.lane], 0, 1);
      ctx.restore();
    }
  }

  function drawMonkey() {
    const cx = W / 2;
    const base = receptorY - Math.max(150, H * 0.2);
    const s = Math.min(W, H) * 0.15;
    // dance clock — locked to the song while playing, gentle idle groove otherwise
    const beatF = state === STATE.PLAY ? songTime / (60 / BPM) : (performance.now() / 1000) * (BPM / 60) * 0.85;
    const sway = Math.sin(beatF * Math.PI);            // slow side-to-side groove (2-beat)
    const hop = Math.abs(Math.sin(beatF * Math.PI));   // spring/bounce on every beat
    const legA = Math.sin(beatF * Math.PI * 2);        // per-beat leg step alternation
    const wob = Math.sin(beatF * Math.PI * 2);         // fast wobble for arm waves
    const move = ((beatF / 4) | 0) % 4;                // switch dance move every bar
    const stumbling = stumbleTimer > 0;

    const brown = "#8a5a2b", brownD = "#6d4420", face = "#e9c39a";
    ctx.save();
    // whole-body groove: sway sideways, hop up, lean into the beat
    ctx.translate(cx + sway * s * 0.18, base - hop * s * 0.16);
    if (stumbling) ctx.rotate(Math.sin(performance.now() / 35) * 0.16 * (stumbleTimer / STUMBLE));
    else ctx.rotate(sway * 0.12);
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // ----- stepping legs -----
    const liftL = Math.max(0, legA) * s * 0.30;
    const liftR = Math.max(0, -legA) * s * 0.30;
    ctx.strokeStyle = brown; ctx.lineWidth = s * 0.2;
    ctx.beginPath(); ctx.moveTo(-s * 0.24, s * 0.62); ctx.lineTo(-s * 0.32 - sway * s * 0.06, s * 1.08 - liftL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.24, s * 0.62); ctx.lineTo(s * 0.32 - sway * s * 0.06, s * 1.08 - liftR); ctx.stroke();
    ctx.fillStyle = brownD;
    ctx.beginPath(); ctx.ellipse(-s * 0.34 - sway * s * 0.06, s * 1.1 - liftL, s * 0.16, s * 0.1, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.3 - sway * s * 0.06, s * 1.1 - liftR, s * 0.16, s * 0.1, 0, 0, 7); ctx.fill();

    // ----- swishing tail -----
    ctx.strokeStyle = brownD; ctx.lineWidth = s * 0.14;
    ctx.beginPath(); ctx.moveTo(s * 0.45, s * 0.8);
    ctx.quadraticCurveTo(s * (1.25 + wob * 0.12), s * 0.7, s * (1.08 + wob * 0.18), s * (0.05 + wob * 0.12));
    ctx.stroke();

    // ----- body -----
    ctx.fillStyle = brown;
    ctx.beginPath(); ctx.ellipse(0, s * 0.55, s * 0.58, s * 0.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(0, s * 0.6, s * 0.34, s * 0.4, 0, 0, 7); ctx.fill();

    // ----- dancing arms (with per-move variety + hit poses) -----
    let hlx = -s * 0.7, hly = s * 0.5 + legA * s * 0.22;   // default: arms swing opposite legs
    let hrx = s * 0.7, hry = s * 0.5 - legA * s * 0.22;
    if (move === 1) {                                        // "raise the roof" — both arms up, waving
      hlx = -s * 0.42; hly = -s * 0.5 - Math.max(0, wob) * s * 0.16;
      hrx = s * 0.42; hry = -s * 0.5 - Math.max(0, -wob) * s * 0.16;
    } else if (move === 3) {                                 // clap toward the center
      const c = (wob + 1) / 2;
      hlx = -s * (0.72 - c * 0.5); hly = s * 0.18;
      hrx = s * (0.72 - c * 0.5); hry = s * 0.18;
    }
    if (poseTimer > 0) {                                     // snap an arm up toward the lane you just hit
      const r = poseTimer / POSE;
      if (poseLane <= 1) { hlx = -s * (0.34 + 0.14 * (1 - r)); hly = s * 0.5 - s * (0.2 + 1.0 * r); }
      else { hrx = s * (0.34 + 0.14 * (1 - r)); hry = s * 0.5 - s * (0.2 + 1.0 * r); }
    }
    ctx.strokeStyle = brown; ctx.lineWidth = s * 0.19;
    ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.4); ctx.quadraticCurveTo(-s * 0.62, (s * 0.4 + hly) / 2, hlx, hly); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.45, s * 0.4); ctx.quadraticCurveTo(s * 0.62, (s * 0.4 + hry) / 2, hrx, hry); ctx.stroke();
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(hlx, hly, s * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(hrx, hry, s * 0.11, 0, 7); ctx.fill();

    // ----- head (bob + tilt to the groove) -----
    ctx.save();
    ctx.translate(0, -hop * s * 0.05);
    ctx.rotate(sway * 0.16);
    ctx.fillStyle = brown;
    ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.55, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-s * 0.55, -s * 0.4, s * 0.22, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.4, s * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(-s * 0.55, -s * 0.4, s * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.4, s * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -s * 0.28, s * 0.4, s * 0.42, 0, 0, 7); ctx.fill();
    const happy = !stumbling;
    const nowms = performance.now();
    // rosy cheeks
    ctx.fillStyle = "rgba(255,120,120,0.35)";
    ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.16, s * 0.09, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.16, s * 0.09, 0, 7); ctx.fill();
    // big googly eyes (whites bulge out) with wiggling pupils
    const px = sway * s * 0.05 + Math.sin(nowms / 90) * s * 0.025;
    const py = -s * 0.42 + Math.sin(nowms / 120) * s * 0.02;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-s * 0.19, -s * 0.44, s * 0.17, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.19, -s * 0.44, s * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = "#20140c";
    ctx.beginPath(); ctx.arc(-s * 0.19 + px, py, s * 0.075, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.19 + px, py, s * 0.075, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-s * 0.21 + px, py - s * 0.03, s * 0.022, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.17 + px, py - s * 0.03, s * 0.022, 0, 7); ctx.fill();
    // silly waggling eyebrows (raise with the hop)
    ctx.strokeStyle = "#3a2410"; ctx.lineWidth = s * 0.045; ctx.lineCap = "round";
    const brow = -s * 0.64 - hop * s * 0.06;
    ctx.beginPath(); ctx.moveTo(-s * 0.32, brow + s * 0.03); ctx.lineTo(-s * 0.05, brow); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.32, brow + s * 0.03); ctx.lineTo(s * 0.05, brow); ctx.stroke();
    // nostrils
    ctx.fillStyle = "#20140c";
    ctx.beginPath(); ctx.arc(-s * 0.06, -s * 0.2, s * 0.032, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.06, -s * 0.2, s * 0.032, 0, 7); ctx.fill();
    // big goofy grin (opens with the bounce) + teeth + tongue on the wild move
    if (happy) {
      ctx.fillStyle = "#3a1810";
      ctx.beginPath(); ctx.ellipse(0, -s * 0.04, s * 0.21, s * 0.12 + hop * s * 0.05, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-s * 0.17, -s * 0.06, s * 0.34, s * 0.05);
      if (move === 1) { ctx.fillStyle = "#ff6a8a"; ctx.beginPath(); ctx.arc(0, s * 0.02 + hop * s * 0.04, s * 0.08, 0, Math.PI); ctx.fill(); }
    } else {
      ctx.fillStyle = "#3a1810"; ctx.beginPath(); ctx.arc(0, -s * 0.01, s * 0.09, 0, 7); ctx.fill();
    }
    if (stumbling) { ctx.fillStyle = "#8fd0ff"; ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.55, s * 0.08, 0, 7); ctx.fill(); }
    ctx.restore();

    ctx.restore();
  }

  function drawHUD() {
    // score
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = "800 34px 'Trebuchet MS', Arial"; ctx.fillText(String(score), 20, 20);
    ctx.font = "12px 'Trebuchet MS', Arial"; ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("SCORE", 22, 58);
    // combo
    if (combo > 1) {
      ctx.textAlign = "right"; ctx.fillStyle = "#ffd83a";
      ctx.font = "800 30px 'Trebuchet MS', Arial";
      ctx.fillText(combo + "x", W - 20, 22);
      ctx.font = "11px 'Trebuchet MS', Arial"; ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("COMBO", W - 22, 56);
    }
    // energy / groove bar
    const bw = Math.min(W - 40, 320), bx = (W - bw) / 2, by = 24, bh = 12;
    ctx.fillStyle = "rgba(255,255,255,0.15)"; roundRectPath(bx, by, bw, bh, 6); ctx.fill();
    const e = energy / 100;
    const col = e > 0.5 ? "#8fffa0" : e > 0.25 ? "#ffd83a" : "#ff6a6a";
    ctx.fillStyle = col; roundRectPath(bx, by, Math.max(4, bw * e), bh, 6); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "10px 'Trebuchet MS', Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("GROOVE", W / 2, by + bh / 2 + 1);
    // popups
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let py = receptorY - 120;
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.font = "800 28px 'Trebuchet MS', Arial";
      ctx.fillText(p.text, W / 2, py - (1 - p.life) * 20);
      ctx.globalAlpha = 1;
      py -= 34;
    }
  }

  function drawSparks() {
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawLanes();
    drawMonkey();
    drawNotes();
    drawSparks();
    if (state === STATE.PLAY) drawHUD();
    if (state === STATE.JUDGING) drawJudges();
  }

  // ---------- Judges (rate the dance after the song) ----------
  function clampI(lo, hi, v) { return Math.max(lo, Math.min(hi, v)); }
  function irnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function enterJudging() {
    state = STATE.JUDGING;
    notes = [];
    const acc = noteCount ? hitCount / noteCount : 0;
    const j1 = clampI(2, 10, Math.round(acc * 10) + irnd(-1, 1));                    // technique
    const j2 = clampI(2, 10, Math.round(Math.min(10, maxCombo / 6)) + irnd(-1, 1));  // style
    const j3 = clampI(2, 10, Math.round(acc * 6 + Math.min(4, score / 400)) + irnd(-1, 1)); // groove
    judges = [
      { cat: "TECHNIQUE", variant: 0, score: j1 },
      { cat: "STYLE", variant: 1, score: j2 },
      { cat: "GROOVE", variant: 2, score: j3 },
    ];
    judgeTotal = j1 + j2 + j3;
    ratingStars = judgeTotal >= 27 ? 5 : judgeTotal >= 21 ? 4 : judgeTotal >= 14 ? 3 : judgeTotal >= 8 ? 2 : 1;
    ratingTitle = judgeTotal >= 27 ? "GROOVE LEGEND!" : judgeTotal >= 21 ? "BANANA BOOGIE!" : judgeTotal >= 14 ? "NICE MOVES!" : "KEEP PRACTISING!";
    judgePhase = 0; judgeTimer = 0.8;
    if (store.sound && actx) { const t0 = actx.currentTime; for (let i = 0; i < 6; i++) tomHit(150, t0 + i * 0.06); } // drumroll
  }
  function updateJudging(dt) {
    judgeTimer -= dt;
    if (judgeTimer > 0) return;
    if (judgePhase < judges.length) {
      judgePhase++;
      if (store.sound && actx) tone(640 + judgePhase * 130, actx.currentTime, 0.13, "triangle", 0.06);
      judgeTimer = judgePhase < judges.length ? 0.85 : 1.8;
    } else {
      showOver();
    }
  }
  function skipJudging() {
    if (judgePhase < judges.length) { judgePhase = judges.length; judgeTimer = 1.2; }
    else showOver();
  }
  function drawJudges() {
    ctx.fillStyle = "rgba(3,14,7,0.7)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd83a"; ctx.font = "800 30px 'Trebuchet MS', Arial";
    ctx.fillText("🍌 THE JUDGES 🍌", W / 2, H * 0.14);
    const js = Math.min(W, H) * 0.085;
    const spacing = Math.min(W * 0.3, 165);
    const startX = W / 2 - spacing, jy = H * 0.68;
    for (let i = 0; i < judges.length; i++) {
      const jx = startX + i * spacing;
      const revealed = i < judgePhase;
      drawJudgeMonkey(jx, jy, js, judges[i].variant, revealed);
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "700 13px 'Trebuchet MS', Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(judges[i].cat, jx, jy + js * 1.7);
      if (revealed) {
        const cardY = jy - js * 1.9;
        ctx.fillStyle = "#fff"; roundRectPath(jx - 28, cardY - 32, 56, 64, 9); ctx.fill();
        ctx.fillStyle = "#e8b100"; ctx.font = "800 42px 'Trebuchet MS', Arial";
        ctx.fillText(String(judges[i].score), jx, cardY + 2);
      }
    }
    if (judgePhase >= judges.length) {
      ctx.fillStyle = "#fff"; ctx.font = "800 26px 'Trebuchet MS', Arial";
      ctx.fillText("TOTAL  " + judgeTotal + " / 30", W / 2, H * 0.29);
      ctx.fillStyle = "#ffd83a"; ctx.font = "26px Arial";
      ctx.fillText("\u2B50".repeat(ratingStars), W / 2, H * 0.36);
      ctx.fillStyle = "#8fffa0"; ctx.font = "800 30px 'Trebuchet MS', Arial";
      ctx.fillText(ratingTitle, W / 2, H * 0.43);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "14px 'Trebuchet MS', Arial";
      ctx.fillText("tap to continue", W / 2, H * 0.49);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "14px 'Trebuchet MS', Arial";
      ctx.fillText("tap to skip", W / 2, H * 0.29);
    }
  }
  function drawJudgeMonkey(x, y, s, variant, react) {
    ctx.save(); ctx.translate(x, y);
    const t = performance.now() / 1000;
    ctx.translate(0, Math.sin(t * 3 + variant) * s * 0.08);
    const cols = ["#8a5a2b", "#b5793a", "#5a4632"];
    const brown = cols[variant] || "#8a5a2b";
    ctx.fillStyle = brown;
    ctx.beginPath(); ctx.arc(-s * 0.82, -s * 0.1, s * 0.28, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.82, -s * 0.1, s * 0.28, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.82, 0, 7); ctx.fill();
    ctx.fillStyle = "#e9c39a";
    ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.55, s * 0.6, 0, 0, 7); ctx.fill();
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-s * 0.24, -s * 0.08, s * 0.17, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.24, -s * 0.08, s * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = "#20140c";
    const p = react ? Math.sin(t * 8) * s * 0.05 : 0;
    ctx.beginPath(); ctx.arc(-s * 0.24 + p, -s * 0.08, s * 0.08, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.24 + p, -s * 0.08, s * 0.08, 0, 7); ctx.fill();
    // mouth
    ctx.strokeStyle = "#20140c"; ctx.lineWidth = s * 0.06; ctx.lineCap = "round";
    ctx.beginPath();
    if (react) ctx.arc(0, s * 0.2, s * 0.2, 0.1 * Math.PI, 0.9 * Math.PI);
    else ctx.arc(0, s * 0.34, s * 0.16, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();
    // accessory
    if (variant === 0) { // cool shades
      ctx.fillStyle = "#111";
      roundRectPath(-s * 0.44, -s * 0.2, s * 0.34, s * 0.22, 4); ctx.fill();
      roundRectPath(s * 0.1, -s * 0.2, s * 0.34, s * 0.22, 4); ctx.fill();
      ctx.fillRect(-s * 0.1, -s * 0.12, s * 0.2, s * 0.05);
    } else if (variant === 1) { // bowtie
      ctx.fillStyle = "#ff5ea8";
      ctx.beginPath(); ctx.moveTo(0, s * 0.78); ctx.lineTo(-s * 0.24, s * 0.64); ctx.lineTo(-s * 0.24, s * 0.92); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, s * 0.78); ctx.lineTo(s * 0.24, s * 0.64); ctx.lineTo(s * 0.24, s * 0.92); ctx.closePath(); ctx.fill();
    } else { // crown
      ctx.fillStyle = "#ffd83a";
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, -s * 0.72); ctx.lineTo(-s * 0.42, -s * 1.02); ctx.lineTo(-s * 0.16, -s * 0.82);
      ctx.lineTo(0, -s * 1.08); ctx.lineTo(s * 0.16, -s * 0.82); ctx.lineTo(s * 0.42, -s * 1.02); ctx.lineTo(s * 0.42, -s * 0.72);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Helpers ----------
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ---------- Loop ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Share / UI ----------
  const SHARE_URL = "https://gewteh-ai.github.io/claude/monkey/";
  function shareGame() {
    const text = "🐵🌴 Play Jungle Jiggy — tap to the jungle beat and make the monkey dance!";
    if (navigator.share) navigator.share({ title: "Jungle Jiggy", text: text, url: SHARE_URL }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + " " + SHARE_URL).then(() => showToast("Link copied — invite friends! 📋"), () => showToast(SHARE_URL));
    else showToast(SHARE_URL);
  }
  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg; el.toast.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
  }
  function refreshMenu() { el.startBest.textContent = store.best; }

  el.btnStart.addEventListener("click", startGame);
  el.btnRetry.addEventListener("click", startGame);
  el.btnShare.addEventListener("click", shareGame);
  el.btnSound.addEventListener("click", function () {
    store.sound = !store.sound;
    localStorage.setItem("mg_sound", store.sound ? "on" : "off");
    el.btnSound.textContent = store.sound ? "🔊" : "🔇";
    if (store.sound) ensureAudio();
  });

  // ---------- Boot ----------
  resize();
  refreshMenu();
  el.btnSound.textContent = store.sound ? "🔊" : "🔇";
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
