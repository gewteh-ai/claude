/* ============================================================
   NEON DASH — one-tap arcade
   Pure JS, no dependencies. Runs offline.
   ============================================================ */
(() => {
  "use strict";

  // ---------- Canvas setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1, viewScale = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // narrower screens (phones) give less reaction time, so run a bit gentler
    viewScale = Math.max(0.62, Math.min(1, W / 820));
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
    btnRevivePearl: document.getElementById("btn-revive-pearl"),
    btnDouble: document.getElementById("btn-double"),
    adOverlay: document.getElementById("ad-overlay"),
    adTag: document.getElementById("ad-tag"),
    adTimer: document.getElementById("ad-timer"),
    adClaim: document.getElementById("ad-claim"),
    btnSound: document.getElementById("btn-sound"),
    toast: document.getElementById("toast"),
    reward: document.getElementById("reward"),
    btnAttack: document.getElementById("btn-attack"),
    movePad: document.getElementById("move-pad"),
    btnUp: document.getElementById("btn-up"),
    btnDown: document.getElementById("btn-down"),
    btnPause: document.getElementById("btn-pause"),
    btnResume: document.getElementById("btn-resume"),
    pauseScreen: document.getElementById("pause-screen"),
    dailyOverlay: document.getElementById("daily-overlay"),
    dailyStreak: document.getElementById("daily-streak"),
    dailyAmount: document.getElementById("daily-amount"),
    btnClaimDaily: document.getElementById("btn-claim-daily"),
    btnInstall: document.getElementById("btn-install"),
  };
  let paused = false;
  let holdUp = false, holdDown = false;
  let darkCanvas = null, dctx = null;
  let pops, stageNext, stageIdx, octos, octoTimer;
  let pBubbles, pBubTimer;   // glowing bubble trail that reveals the prawn in the pitch-dark Midnight Zone
  let runPearls, doubledThisRun;   // pearls collected this run (for the "double pearls" rewarded ad)
  let adRetryCount = 0;            // interstitial cadence on RETRY

  // ---------- Persistent state ----------
  const store = {
    best: +(localStorage.getItem("nd_best") || 0),
    streak: +(localStorage.getItem("nd_streak") || 0),
    pearlBank: +(localStorage.getItem("pd_pearlbank") || 0),
    sound: localStorage.getItem("nd_sound") !== "off",
    dayStreak: +(localStorage.getItem("pd_daystreak") || 0),
    lastClaim: localStorage.getItem("pd_lastclaim") || "",
  };
  const REVIVE_COST = 1000;

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
  const JET_TIME = 4.0;                        // seconds the JET lasts
  const JET_MAGNET = 300;                     // px pearl-magnet radius during JET
  const JET_COOLDOWN = 1.6;                    // seconds after a JET before another can trigger
  const PEARL_FILL = 7;                        // meter gained per pearl (needs ~15 pearls per JET)
  const EASE_TIME = 2.6;                       // gentle transition time back to open water after a special stage
  // Evolution tiers — a longer journey (drawX are hoisted fns)
  const TIERS = [
    { name: "PRAWN",     emoji: "🦐", at: 0,   draw: drawPrawn,   glow: "#ff9a4d" },
    { name: "LOBSTER",   emoji: "🦞", at: 90,  draw: drawLobster, glow: "#ff4d4d" },
    { name: "CRAB",      emoji: "🦀", at: 240, draw: drawCrab,    glow: "#ff5ea8" },
    { name: "KRAKEN",    emoji: "🐙", at: 470, draw: drawKraken,  glow: "#b06bff" },
    { name: "LEVIATHAN", emoji: "🐋", at: 820, draw: drawWhale,   glow: "#4db8ff" },
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
  let lives, spd, firstBoxDone, ammo, shots;
  let jellyOn, jellyT, jellyNext, jellyEase;
  let sandOn, sandT, sandNext, onSand, rocks, rockTimer, sandEnter;
  let beachOn, beachT, beachNext, beachObs, beachTimer, beachRise, beachFall, beachEnding;
  let deepOn, deepT, deepWarn, deepNext, lightR, anglers, blobs, angTimer, blobTimer, motes;
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
    boxes = []; boxTimer = 2.5; firstBoxDone = false;
    fish = fish || []; fishTimer = 1.2;
    bgScroll = 0;
    // biomes + power-ups
    curBiome = 0; bgTop = BIOMES[0].top.slice(); bgBot = BIOMES[0].bot.slice();
    mag = 0; dbl = 0;
    // boss chase
    boss = { active: false, x: -120, y: H * 0.5, phase: "", timer: 0, snap: 0, lunge: 0 };
    bossNext = 55; bossFirstDone = false;
    // revive chances + speed power-up + harpoons
    lives = 2; spd = 0;
    ammo = 3; shots = [];
    // zero-gravity jelly swarm stage
    jellyOn = false; jellyT = 0; jellyNext = 90; jellyEase = 0;
    // seabed trek (ground runner)
    sandOn = false; sandT = 0; sandNext = 150; onSand = false; rocks = []; rockTimer = 1.0; sandEnter = 0;
    // beach stage (above water, on the shore)
    beachOn = false; beachT = 0; beachNext = 220; beachObs = []; beachTimer = 1.0; beachRise = 0; beachFall = 0; beachEnding = false;
    // midnight zone (dark deep scene)
    deepOn = false; deepT = 0; deepWarn = 0; deepNext = 300; lightR = 110; anglers = []; blobs = []; angTimer = 1.2; blobTimer = 0.8; motes = [];
    octos = []; octoTimer = 0;
    // pearl-shine pops + stage scheduler (rotates through all special scenes)
    pops = []; stageNext = 90; stageIdx = 0;
    pBubbles = []; pBubTimer = 0;
    runPearls = 0; doubledThisRun = false;
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
    // moving gaps appear once you reach the trench (score >= 200)
    const moveAmp = (score >= 200 && Math.random() < 0.45) ? (20 + Math.random() * 34) : 0;
    // valid vertical range for the opening (leave room for the gap's own travel if it moves)
    const lo = margin + moveAmp;
    const hi = H - gap - margin - moveAmp;
    // Reachability: the opening can't jump farther vertically than the prawn can travel before the
    // next wall arrives — otherwise you get impossible top-to-bottom pairs. Clamp near the last gap.
    const last = obstacles.length ? obstacles[obstacles.length - 1] : null;
    let gapY;
    if (last && hi > lo) {
      const maxDelta = gap * 0.85 + 30;                       // how far the gap may shift between walls
      const lastY = Math.min(hi, Math.max(lo, last.baseGapY));
      const mn = Math.max(lo, lastY - maxDelta);
      const mx = Math.min(hi, lastY + maxDelta);
      gapY = mn + Math.random() * Math.max(0, mx - mn);
    } else {
      gapY = lo + Math.random() * Math.max(0, hi - lo);
    }
    obstacles.push({ x: W + 40, gapY, baseGapY: gapY, gap, w: 62, passed: false, hue: (score * 18) % 360, moveAmp, movePh: Math.random() * 6 });
  }

  // ---------- Particles ----------
  function burst(x, y, color, count, spread, big) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread + 40;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, size: big ? Math.random() * 7 + 3 : Math.random() * 3 + 1.5 });
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

  // classic two-note "coin" pickup — pearls are underwater currency (Mario/Subway-style ding)
  function sfxPearl(combo) {
    if (!store.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const lift = Math.min(4, Math.floor(combo / 6)) * 40; // pitch creeps up as your combo builds
      tone(988 + lift, t, 0.07, "square", 0.05);            // B5 blip
      tone(1319 + lift, t + 0.07, 0.22, "square", 0.055);   // E6 held — the iconic coin "ding"
      tone((1319 + lift) * 2, t + 0.07, 0.14, "sine", 0.02);// airy sparkle on top
    } catch (e) { /* ignore */ }
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
    if (paused) return;
    if (state === STATE.MENU) { startGame(); return; }
    if (state === STATE.PLAY) {
      player.vy = FLAP_V; // tap any time to rise (on the seabed the sand still catches you)
      burst(player.x - 8, player.y + 6, "#9fe8ff", 6, 70); // splash bubbles
      beep(300, 0.1, "sine", 0.05); // bubble bloop
    }
  }

  function dive() {
    if (paused) return;
    if (state === STATE.MENU) { startGame(); return; }
    if (state === STATE.PLAY) {
      player.vy = 470; // dart downward
      burst(player.x - 8, player.y - 8, "#9fe8ff", 5, 60);
      beep(220, 0.08, "sine", 0.05);
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

  // swipe UP = fire harpoon (a distinct gesture from tapping to swim)
  let swy = 0, swt = 0;
  window.addEventListener("touchstart", (e) => {
    if (e.target.closest("button")) return;
    swy = e.changedTouches[0].clientY; swt = Date.now();
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (e.target.closest("button")) return;
    const dy = e.changedTouches[0].clientY - swy;
    if (dy < -45 && Date.now() - swt < 450) fireShot();
  }, { passive: true });

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
    el.btnAttack.classList.toggle("hidden", ammo <= 0);
    el.movePad.classList.remove("hidden");
    paused = false; el.pauseScreen.classList.add("hidden");
    el.btnPause.classList.remove("hidden"); el.btnPause.textContent = "⏸";
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
      el.btnAttack.classList.add("hidden");
      el.movePad.classList.add("hidden");
      el.btnPause.classList.add("hidden");
      paused = false; el.pauseScreen.classList.add("hidden");
      el.goScore.textContent = score;
      const reached = TIERS[levelForScore(score)];
      el.goCritter.textContent = `${reached.emoji} ${reached.name}`;
      el.goBest.textContent = store.best;
      el.newBest.classList.toggle("hidden", !isBest);
      // Monetization placements (only shown when a real ad network is present) --------
      const adsOn = Ads.available();
      // 1) Rewarded revive — watch an ad to continue (free, once per run)
      el.btnRevive.classList.toggle("hidden", usedRevive || !adsOn);
      el.btnRevive.textContent = "▶ REVIVE · Watch Ad";
      // 2) Alternative revive — spend 1000 banked pearls (always available as a game mechanic)
      const canPearl = !usedRevive && store.pearlBank >= REVIVE_COST;
      el.btnRevivePearl.classList.toggle("hidden", !canPearl);
      el.btnRevivePearl.textContent = "💗 Revive · 1000 🫧";
      // 3) Rewarded — double the pearls you collected this run
      const canDouble = adsOn && runPearls > 0 && !doubledThisRun;
      el.btnDouble.classList.toggle("hidden", !canDouble);
      el.btnDouble.textContent = "▶ Double Pearls · +" + runPearls + " 🫧";
      el.goBest.textContent = store.best + "  ·  🫧 " + store.pearlBank + " banked";
      el.gameoverScreen.classList.remove("hidden");
      refreshMenuStats();
    }, 550);
  }

  // ---------- Ads: GameMonetize SDK with a built-in mock fallback ----------
  // The SDK bootstrap lives in index.html (window.SDK_OPTIONS + api.gamemonetize.com/sdk.js).
  // Its onEvent handler calls into window.PrawnstarAds below. When the real SDK isn't ready
  // (local preview, no ad fill, blocked network) we transparently fall back to the mock overlay.
  const Ads = (function () {
    let busy = false, ticking = null;
    let sdkReady = false;
    let pending = null;      // { onReward, onClose, rewarded } while a real ad is playing
    let safety = null;       // watchdog so the game never hangs if an ad never returns

    function muteForAd(on) {
      try { if (actx) { on ? actx.suspend() : actx.resume(); } } catch (e) { /* ignore */ }
    }
    function resolvePending() {
      if (!pending) return;
      const p = pending; pending = null;
      if (safety) { clearTimeout(safety); safety = null; }
      busy = false;
      muteForAd(false);
      if (p.rewarded && p.onReward) p.onReward();
      if (p.onClose) p.onClose();
    }

    // Called by the GameMonetize SDK via index.html's onEvent handler
    const bridge = {
      onSdkReady() { sdkReady = true; },
      onAdPause() { muteForAd(true); },          // ad started — mute (mandatory) / audio paused
      onAdResume() { resolvePending(); }         // ad finished — resume + grant reward / close
    };
    window.PrawnstarAds = bridge;

    function showReal(rewarded, onReward, onClose) {
      pending = { onReward, onClose, rewarded };
      busy = true;
      // watchdog: if the SDK never fires GAME_START (no-fill / blocked), resolve anyway after 20s
      safety = setTimeout(resolvePending, 20000);
      try { window.sdk.showBanner(); }
      catch (e) { resolvePending(); }            // grant the reward rather than punish the player
    }

    function endMock(onDone) {
      if (ticking) { clearInterval(ticking); ticking = null; }
      el.adOverlay.classList.add("hidden");
      busy = false;
      if (onDone) onDone();
    }
    function mock(kind, onReward, onClose) {
      if (busy) { if (onClose) onClose(); return; }
      busy = true;
      const rewarded = kind === "rewarded";
      el.adTag.textContent = rewarded ? "REWARDED AD" : "ADVERTISEMENT";
      el.adClaim.classList.add("hidden");
      let t = rewarded ? 5 : 3;
      const label = () => (rewarded ? "Reward in " : "Closing in ") + t + "s…";
      el.adTimer.textContent = label();
      el.adOverlay.classList.remove("hidden");
      ticking = setInterval(() => {
        t--;
        if (t > 0) { el.adTimer.textContent = label(); return; }
        clearInterval(ticking); ticking = null;
        el.adTimer.textContent = rewarded ? "Ad finished 🎉" : "";
        el.adClaim.textContent = rewarded ? "✓ CLAIM REWARD" : "✕ CLOSE";
        el.adClaim.classList.remove("hidden");
      }, 1000);
      el.adClaim.onclick = () => endMock(() => {
        if (rewarded && onReward) onReward();
        if (onClose) onClose();
      });
    }
    // Real network available only once the SDK is ready and exposes showBanner()
    function useReal() {
      return sdkReady && typeof window.sdk !== "undefined" && typeof window.sdk.showBanner === "function";
    }
    return {
      available() { return useReal(); },   // true only when a real ad SDK is loaded & ready
      rewarded(placement, onReward, onClose) {
        if (busy) { if (onClose) onClose(); return; }
        if (useReal()) showReal(true, onReward, onClose);
        else mock("rewarded", onReward, onClose);
      },
      interstitial(onClose) {
        if (busy) { if (onClose) onClose(); return; }
        if (useReal()) showReal(false, null, onClose);
        else mock("interstitial", null, onClose);
      }
    };
  })();

  // ---------- Revive / continue ----------
  function doRevive() {
    usedRevive = true;
    // resume as a normal open-water swim (drop out of any special scene)
    jellyOn = sandOn = beachOn = deepOn = false; beachEnding = false;
    jellyEase = 0; sandEnter = 0; beachRise = 0; beachFall = 0; deepWarn = 0;
    anglers = []; blobs = []; octos = []; rocks = []; beachObs = [];
    obstacles = obstacles.filter(o => o.x > player.x + 160);
    enemies = enemies.filter(en => en.x > player.x + 160);
    invuln = 1.8; player.y = H * 0.45; player.vy = FLAP_V;
    el.gameoverScreen.classList.add("hidden");
    el.hud.classList.remove("hidden"); el.boostWrap.classList.remove("hidden");
    el.movePad.classList.remove("hidden");
    el.btnPause.classList.remove("hidden"); el.btnPause.textContent = "⏸";
    el.btnAttack.classList.toggle("hidden", ammo <= 0);
    state = STATE.PLAY; lastTime = performance.now();
  }
  function reviveByAd() {
    if (usedRevive) return;
    Ads.rewarded("revive", () => { doRevive(); toast("Back in the game! ✨"); });
  }
  function reviveByPearls() {
    if (usedRevive || store.pearlBank < REVIVE_COST) return;
    store.pearlBank -= REVIVE_COST; localStorage.setItem("pd_pearlbank", store.pearlBank);
    doRevive(); toast("Revived with 1000 pearls! ✨");
  }
  function watchDoublePearls() {
    if (doubledThisRun || runPearls <= 0) return;
    Ads.rewarded("double", () => {
      store.pearlBank += runPearls; localStorage.setItem("pd_pearlbank", store.pearlBank);
      doubledThisRun = true;
      el.btnDouble.classList.add("hidden");
      el.goBest.textContent = store.best + "  ·  🫧 " + store.pearlBank + " banked";
      toast("Pearls doubled! +" + runPearls + " 🫧");
    });
  }
  // RETRY: show a (mock) interstitial every 3rd retry — standard, tolerable cadence
  function retry() {
    adRetryCount++;
    if (Ads.available() && adRetryCount % 3 === 0) Ads.interstitial(startGame);
    else startGame();
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
    let p;
    if (!firstBoxDone) { firstBoxDone = true; p = SPEED_PICKUP; }                       // early game: 2× SWIM
    else if (boss.active && boss.phase === "chase" && Math.random() < 0.6) p = SPEED_PICKUP; // escape tool while hunted
    else p = PICKUPS[Math.floor(Math.random() * PICKUPS.length)];
    boxes.push({ x: W + 30, y: margin + Math.random() * (H - margin * 2), r: 18, spin: Math.random() * 6, got: false, pu: p });
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
  // Labeled power-up pickups — each floats with its own icon so you know what it is
  const PICKUPS = [
    { icon: "🧲", color: "#8fe8ff", txt: "🧲 MAGNET 6s",  act: () => { mag = Math.max(mag, 6); } },
    { icon: "✕2", color: "#ffe259", txt: "✕2 SCORE 8s",  act: () => { dbl = Math.max(dbl, 8); } },
    { icon: "🌊", color: "#8fffa0", txt: "🌊 2× SWIM 5s", act: () => { spd = Math.max(spd, 5); } },
    { icon: "🔱", color: "#bff0ff", txt: "🔱 HARPOON +3", act: () => { ammo += 3; } },
    { icon: "🛟", color: "#ffd24d", txt: "🛟 +1 CHANCE",  act: () => { lives = Math.min(5, lives + 1); } },
    { icon: "🚀", color: "#ffcf4d", txt: "🚀 JET CHARGED", act: () => { boost = JET_NEED; } },
    { icon: "🛡", color: "#8fe8ff", txt: "🛡 SHIELD +1",  act: () => { shield = Math.min(3, shield + 1); } },
  ];
  const SPEED_PICKUP = PICKUPS[2]; // 🌊 2× SWIM
  function openBox(bx) {
    bx.got = true;
    bx.pu.act();
    burst(bx.x, bx.y, bx.pu.color, 24, 240);
    shake = Math.max(shake, 8); flash = Math.max(flash, 0.35);
    showReward(bx.pu.txt);
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
    boss.active = true; boss.phase = "chase"; boss.x = -140; boss.y = player.y; boss.timer = 11; boss.snap = 0;
    bossFirstDone = true;
    bossNext = Math.floor(score) + 180; // next encounter later on
    // drop a couple of 2× SWIM pickups so the player can grab one and outrun the shark
    for (let i = 0; i < 2; i++) boxes.push({ x: W + 80 + i * 320, y: 120 + Math.random() * Math.max(80, H - 240), r: 18, spin: Math.random() * 6, got: false, pu: SPEED_PICKUP });
    boxTimer = Math.min(boxTimer, 2.5);
    showBanner("⚠️ PREDATOR!");
    flash = Math.max(flash, 0.5); shake = Math.max(shake, 10);
    beep(90, 0.5, "sawtooth", 0.1);
  }
  function updateBoss(realDt, gdt) {
    if (!boss.active) return; // the shark only shows up when you crash into something (see alertShark)
    boss.snap += realDt * 9;
    // CHASE: follow the prawn's height with a capped speed, so it trails/lags
    // behind and has to catch up (a real pursuit, not swimming in sync)
    const dy = player.y - boss.y;
    boss.y += Math.sign(dy) * Math.min(Math.abs(dy), 165 * realDt);
    if (boss.phase === "chase") {
      boss.timer -= realDt;
      let creep = 34 + elapsed * 0.32;                      // gentler base pursuit
      if (boss.lunge > 0) { boss.lunge -= realDt; creep += 150; } // brief surge after a crash
      boss.x += creep * gdt;
      if (spd > 0) boss.x -= 230 * gdt;                     // 2× SWIM easily pulls you away
      boss.x = Math.max(-160, Math.min(player.x + 6, boss.x));
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

  // ---------- Jelly Swarm stage (no walls, no gravity) ----------
  function enterJelly() {
    jellyOn = true; jellyT = 14; jellyNext = Math.floor(score) + 220;
    obstacles = [];                 // clear all coral — open water
    ammo += 5;                      // harpoons for the swarm
    if (boss.active && boss.phase === "chase") boss.phase = "retreat";
    showBanner("🪼 JELLY SWARM!");
    addFloat(player.x, player.y - 40, "+5 🔱  dodge & blast!", "#bff0ff");
    flash = Math.max(flash, 0.4);
    beep(300, 0.2, "sine", 0.06);
  }
  function exitJelly() {
    jellyOn = false;
    jellyEase = EASE_TIME;                          // walls hold off + gravity ramps back
    slowmo = Math.max(slowmo, 1.8);                 // longer slow-mo so you can re-orient
    invuln = Math.max(invuln, EASE_TIME + 0.6);     // stay safe from wall bumps through the whole transition
    player.vy = 0; player.y = Math.min(Math.max(player.y, 100), H - 100); // settle away from the edges
    showBanner("✅ SWARM CLEARED!");
    addScore(20, player.x, player.y - 30, "+20", "#8fffa0");
    beep(760, 0.14, "triangle", 0.06);
  }

  // ---------- Seabed Trek stage (ground runner) ----------
  function sandTop() { return H - 96; }
  function enterSand() {
    sandOn = true; sandT = 15; sandEnter = 1.1; sandNext = Math.floor(score) + 240;
    obstacles = []; enemies = [];
    slowmo = Math.max(slowmo, 1.0);            // brief ease so the seabed fades in smoothly
    if (boss.active && boss.phase === "chase") boss.phase = "retreat";
    showBanner("🏖️ SEABED TREK!");
    addFloat(player.x, player.y - 40, "sinking down…", "#ffe0a8");
    beep(300, 0.2, "sine", 0.06);
  }
  function exitSand() {
    sandOn = false; jellyEase = EASE_TIME; slowmo = Math.max(slowmo, 1.8); invuln = Math.max(invuln, EASE_TIME + 0.6);
    player.vy = 0; player.y = Math.min(Math.max(player.y, 100), H - 100);
    rocks = [];
    showBanner("🌊 UP OFF THE SEABED!");
    addScore(20, player.x, player.y - 30, "+20", "#8fffa0");
    beep(760, 0.14, "triangle", 0.06);
  }
  const URCHIN_COLS = ["#e05aff", "#c05aff", "#9a3fe0", "#6a2fb0", "#4a1f8a"]; // bright → dark purples
  function spawnRock() {
    if (Math.random() < 0.35) {
      const h = 32 + Math.random() * 40;
      rocks.push({ x: W + 40, w: 42 + Math.random() * 30, h, type: "rock", dead: false });
    } else {
      // more sea urchins, floating at varied heights, in a mix of bright & dark purples
      const r = 18 + Math.random() * 14;
      const fy = 80 + Math.random() * Math.max(60, sandTop() - 150);
      rocks.push({ x: W + 40, r, fy, ph: Math.random() * 6, type: "urchin", col: URCHIN_COLS[Math.floor(Math.random() * URCHIN_COLS.length)], dead: false });
    }
  }
  function crashRock(rk) {
    if (invuln > 0 || boosting > 0) return;
    const by = (rk.fy != null) ? rk.fy : sandTop() - rk.h / 2;
    burst(rk.x, by, "#e0c090", 16, 320, true);
    rk.dead = true; shake = Math.max(shake, 14); flash = Math.max(flash, 0.4);
    beep(120, 0.28, "sawtooth", 0.09); combo = 0; multiplier = 1;
    if (shield > 0) { shield--; invuln = 1.2; addFloat(player.x, player.y - 32, "SHIELD!", "#8fe8ff"); }
    else if (lives > 0) { lives--; invuln = 1.6; addFloat(player.x, player.y - 34, "REVIVE! " + lives + " left", "#ffd24d"); }
    else die();
  }

  // ---------- Beach stage (breach up onto the shore) ----------
  function enterBeach() {
    beachOn = true; beachT = 15; beachRise = 1.5; beachNext = Math.floor(score) + 260;
    obstacles = []; enemies = [];
    slowmo = Math.max(slowmo, 1.0);
    if (boss.active && boss.phase === "chase") boss.phase = "retreat";
    showBanner("☀️ UP TO THE BEACH!");
    addFloat(player.x, player.y - 40, "swimming up…", "#bfe6ff");
    beep(300, 0.25, "sine", 0.06);
  }
  function finalizeBeach() {
    beachOn = false; beachEnding = false; beachFall = 0;
    jellyEase = EASE_TIME; slowmo = Math.max(slowmo, 1.6); invuln = Math.max(invuln, EASE_TIME + 0.4);
    player.vy = 0; player.y = Math.min(Math.max(player.y, 120), H - 120);
    beachObs = [];
    showBanner("🌊 BACK IN THE SEA!");
    addScore(20, player.x, player.y - 30, "+20", "#8fffa0");
  }
  function spawnBeachObs() {
    const roll = Math.random();
    if (roll < 0.58) {
      // seagull swoops in to attack
      const r = 15 + Math.random() * 8;
      beachObs.push({ x: W + 40, r, fy: 70 + Math.random() * Math.max(50, sandTop() - 170), ph: Math.random() * 6, type: "gull", dead: false });
    } else {
      const type = roll < 0.8 ? "umbrella" : "castle";
      const h = type === "umbrella" ? 96 : 46;
      beachObs.push({ x: W + 40, w: 42, h, type, tone: Math.random(), dead: false });
    }
  }

  // ---------- Midnight Zone (deep dark scene) ----------
  function angY(a) { return a.baseY + Math.sin(elapsed * 1.5 + a.ph) * a.amp; }
  function enterDeep() {
    deepOn = true; deepWarn = 2.0; deepT = 16; deepNext = Math.floor(score) + 340;
    obstacles = []; enemies = []; anglers = []; blobs = []; lightR = 120;
    // you're greeted by a friendly anglerfish first — it glides in ahead to light the way
    anglers.push({ x: W * 0.66, baseY: player.y, amp: 12, ph: 0, r: 22, got: false });
    // dreamy floating bioluminescent motes
    motes = [];
    for (let i = 0; i < 48; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, vy: 5 + Math.random() * 14, ph: Math.random() * 6, r: 1.4 + Math.random() * 2.4 });
    if (boss.active && boss.phase === "chase") boss.phase = "retreat";
    slowmo = Math.max(slowmo, 1.0);
    showBanner("✨ THE MIDNIGHT ZONE");
    addFloat(player.x, player.y - 40, "meet the anglerfish… follow the light", "#bfe6ff");
    beep(70, 0.6, "sine", 0.08);
  }
  function exitDeep() {
    deepOn = false; jellyEase = EASE_TIME; slowmo = Math.max(slowmo, 1.6); invuln = Math.max(invuln, EASE_TIME + 0.4);
    player.vy = 0; player.y = Math.min(Math.max(player.y, 120), H - 120);
    anglers = []; blobs = []; motes = []; octos = [];
    showBanner("🌊 RISING UP!");
    addScore(30, player.x, player.y - 30, "+30", "#8fffa0");
  }
  function spawnAngler() {
    anglers.push({ x: W + 40, baseY: 90 + Math.random() * (H - 180), amp: 20 + Math.random() * 30, ph: Math.random() * 6, r: 20, got: false });
  }
  function spawnBlob() {
    blobs.push({ x: W + 40, baseY: 70 + Math.random() * (H - 140), amp: 10 + Math.random() * 20, ph: Math.random() * 6, r: 22 + Math.random() * 12 });
  }
  function spawnOcto() {
    octos.push({ x: W + 50, y: 90 + Math.random() * (H - 180), ph: Math.random() * 6, r: 26 });
  }

  function alertShark() {
    if (deepOn) return; // no shark in the midnight zone — the octopus rules there
    if (!boss.active) { startBoss(); }
    else if (boss.phase === "chase") { boss.timer = Math.max(boss.timer, 8); }
    boss.x += 18; boss.lunge = 1.0;   // crashing gives the shark a brief surge
    addFloat(player.x, player.y - 52, "🦈 SHARK ALERTED!", "#ff6a6a");
  }

  function takeHit(cause) {
    if (state !== STATE.PLAY) return;
    if (invuln > 0 || boosting > 0) return;
    // 1) shield absorbs the hit — no chance lost
    if (shield > 0) {
      shield--;
      invuln = 1.2; flash = Math.max(flash, 0.5); shake = Math.max(shake, 12);
      combo = 0; multiplier = 1;
      burst(player.x, player.y, "#8fe8ff", 26, 230);
      beep(320, 0.18, "square", 0.06);
      addFloat(player.x, player.y - 32, "SHIELD!", "#8fe8ff");
      alertShark();
      if (cause === "wall") { player.y = Math.min(Math.max(player.y, 90), H - 90); player.vy = 0; }
      else { player.vy = FLAP_V * 0.6; }
      return;
    }
    // 2) revive chance — you smash through, but the crash ALERTS the shark
    if (lives > 0) {
      lives--;
      invuln = 1.8; flash = Math.max(flash, 0.65); shake = Math.max(shake, 18);
      combo = 0; multiplier = 1;
      burst(player.x, player.y, "#ffffff", 22, 260);
      beep(120, 0.3, "sawtooth", 0.1);      // crunch
      addFloat(player.x, player.y - 34, "REVIVE! " + lives + " left", "#ffd24d");
      // shatter the coral we smashed into (chunky debris), then clear the lane
      for (const o of obstacles) {
        if (o.x < player.x + 150) {
          const col = `hsl(${BIOMES[curBiome].hue + (o.hue % 40) - 20}, 78%, 56%)`;
          burst(o.x + o.w / 2, o.gapY - 8, col, 16, 340, true);
          burst(o.x + o.w / 2, o.gapY + o.gap + 8, col, 16, 340, true);
        }
      }
      obstacles = obstacles.filter(o => o.x > player.x + 150);
      enemies = enemies.filter(en => en.x > player.x + 150);
      player.y = H * 0.45; player.vy = FLAP_V * 0.5;
      alertShark();
      return;
    }
    // 3) out of chances
    die();
  }

  // hitting a coral pillar always SMASHES it apart (then applies the cost)
  function crashObstacle(o) {
    if (invuln > 0 || boosting > 0) return;
    const col = `hsl(${BIOMES[curBiome].hue + (o.hue % 40) - 20}, 78%, 56%)`;
    burst(o.x + o.w / 2, o.gapY - 6, col, 18, 360, true);
    burst(o.x + o.w / 2, o.gapY + o.gap + 6, col, 18, 360, true);
    burst(player.x, player.y, "#ffffff", 14, 220);
    o.smashed = true;
    shake = Math.max(shake, 16); flash = Math.max(flash, 0.45);
    beep(120, 0.3, "sawtooth", 0.1);
    combo = 0; multiplier = 1;
    if (shield > 0) { shield--; invuln = 1.3; addFloat(player.x, player.y - 32, "SHIELD!", "#8fe8ff"); alertShark(); }
    else if (lives > 0) { lives--; invuln = 1.7; addFloat(player.x, player.y - 34, "REVIVE! " + lives + " left", "#ffd24d"); alertShark(); }
    else { die(); }
  }

  function doBoost() {
    if (paused || state !== STATE.PLAY || boost < JET_NEED || boosting > 0 || jetCd > 0) return;
    boost = 0;
    boosting = JET_TIME;
    invuln = JET_TIME + 0.4;
    flash = Math.max(flash, 0.55);
    shake = Math.max(shake, 10);
    showBanner("🚀 AQUAPOD!");
    beep(180, 0.3, "sawtooth", 0.07);
    setTimeout(() => beep(300, 0.2, "sawtooth", 0.05), 120);
  }

  // ---------- Harpoon (attack the jellyfish) ----------
  function fireShot() {
    if (paused || state !== STATE.PLAY || ammo <= 0) return;
    ammo--;
    shots.push({ x: player.x + PLAYER_R, y: player.y, vx: 640, dead: false });
    beep(880, 0.06, "square", 0.045);
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
    el.btnAttack.classList.toggle("hidden", ammo <= 0);
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
    if (boosting > 0) {
      boosting -= realDt;
      if (boosting <= 0) {
        boosting = 0; jetCd = JET_COOLDOWN;
        invuln = Math.max(invuln, 1.5);                          // grace so you don't die the instant the JET ends
        slowmo = Math.max(slowmo, 1.3);                          // ease the rhythm so you can catch on
        obstacles = obstacles.filter(o => o.x > player.x + 180); // clear the lane right in front of you
        enemies = enemies.filter(en => en.x > player.x + 180);
        addFloat(player.x, player.y - 30, "phew…", "#8fffa0");
      }
    }
    if (jetCd > 0) jetCd -= realDt;
    if (mag > 0) mag -= realDt;
    if (dbl > 0) dbl -= realDt;
    if (spd > 0) spd -= realDt;
    if (jellyEase > 0) jellyEase -= realDt;
    if (beachRise > 0) beachRise -= realDt;
    if (sandEnter > 0) sandEnter -= realDt;
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
    speed *= viewScale;           // gentler on narrow phone screens
    if (curBiome >= 2) speed *= 0.8;  // slower rhythm in the deep trench / abyss (moving gaps are tricky)
    if (boosting > 0) speed *= 1.55;
    if (spd > 0) speed *= 1.35;   // 2× SWIM power-up (faster = outrun the shark)
    if (jellyEase > 0) speed *= 0.5 + 0.5 * (1 - jellyEase / EASE_TIME); // ramp speed back up after a special stage
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
      // special stages: trigger + countdown (only one at a time)
      const anySpecial = jellyOn || sandOn || beachOn || deepOn;
      if (!anySpecial && !boss.active && jellyEase <= 0 && score >= stageNext) {
        [enterJelly, enterSand, enterBeach, enterDeep][stageIdx % 4](); // rotate through every scene
        stageIdx++;
        stageNext = Math.floor(score) + 180;
      }
      if (jellyOn) { jellyT -= realDt; if (jellyT <= 0) exitJelly(); }
      if (sandOn) { sandT -= realDt; if (sandT <= 0) exitSand(); }
      if (deepOn) { if (deepWarn > 0) deepWarn -= realDt; else { deepT -= realDt; if (deepT <= 0) exitDeep(); } }
      if (beachOn) {
        beachT -= realDt;
        if (beachT <= 0 && !beachEnding) { beachEnding = true; beachFall = 1.5; beachObs = []; invuln = Math.max(invuln, 2.2); showBanner("🌊 DIVING BACK…"); beep(240, 0.2, "sine", 0.05); }
        if (beachEnding) { beachFall -= realDt; if (beachFall <= 0) finalizeBeach(); }
      }

      // player physics
      if ((jellyOn || deepOn) && boosting <= 0) {
        // zero-gravity swim: UP/DIVE move you, drag glides you to a stop; edges just clamp
        player.vy *= 0.93;
        player.y += player.vy * gdt;
        player.y = Math.min(Math.max(player.y, PLAYER_R + 6), H - PLAYER_R - 6);
        player.rot = Math.max(-0.5, Math.min(0.9, player.vy / 700));
      } else if (boosting > 0) {
        // AQUAPOD: gravity off — HOLD ⬆ / ⬇ (or Up/Down keys) to steer up and down
        if (holdUp) player.vy -= 1500 * gdt;
        if (holdDown) player.vy += 1500 * gdt;
        player.vy *= 0.9;
        player.y += player.vy * gdt;
        player.y = Math.min(Math.max(player.y, 56), H - 56);
        player.rot = Math.max(-0.4, Math.min(0.4, player.vy / 700));
        if (Math.random() < 0.7) burst(player.x - 20, player.y + 3, "#ffd24d", 2, 70);
      } else if (beachOn && beachRise > 0) {
        // smooth ascent — the prawn swims up out of the water onto the shore
        player.vy += (-820 - player.vy) * Math.min(1, gdt * 3);
        player.y += player.vy * gdt;
        player.y = Math.max(70, player.y);
        player.rot = -0.3;
        onSand = false;
      } else if (beachOn && beachEnding) {
        // dive back down and sink into the sea (mirror of the swim-up)
        player.vy += GRAVITY * 0.85 * gdt;
        player.y += player.vy * gdt;
        player.y = Math.min(player.y, H - 50);
        player.rot = Math.min(0.9, player.vy / 700);
        onSand = false;
      } else if (sandOn || beachOn) {
        // ground runner (seabed / beach): gravity pulls you down; UP hops
        player.vy += GRAVITY * gdt;
        player.y += player.vy * gdt;
        const floor = sandTop() - PLAYER_R;
        if (player.y >= floor) { player.y = floor; player.vy = 0; onSand = true; } else onSand = false;
        if (player.y < 40) { player.y = 40; player.vy = 0; }
        player.rot = Math.max(-0.5, Math.min(0.6, player.vy / 900));
      } else {
        const gf = jellyEase > 0 ? (1 - jellyEase / EASE_TIME) : 1; // ease gravity back after a swarm
        player.vy += GRAVITY * gf * gdt;
        player.y += player.vy * gdt;
        player.y = Math.min(Math.max(player.y, PLAYER_R), H - PLAYER_R); // never leave the screen
        player.rot = Math.max(-0.5, Math.min(1.1, player.vy / 700));
      }

      // trail
      player.trail.unshift({ x: player.x, y: player.y });
      if (player.trail.length > 14) player.trail.pop();

      // spawns (pearls come thick and fast during a JET so you sweep them up)
      spawnTimer -= gdt;
      if (spawnTimer <= 0) { if (!jellyOn && !sandOn && !beachOn && !deepOn && jellyEase <= 0) spawnObstacle(); spawnTimer = spawnInterval; }
      if (sandOn && sandEnter <= 0) { rockTimer -= gdt; if (rockTimer <= 0) { spawnRock(); rockTimer = 0.85 + Math.random() * 0.9; } }
      if (beachOn && beachRise <= 0 && !beachEnding) { beachTimer -= gdt; if (beachTimer <= 0) { spawnBeachObs(); beachTimer = 0.9 + Math.random() * 0.9; } }
      if (deepOn && deepWarn <= 0) {
        angTimer -= gdt; if (angTimer <= 0) { spawnAngler(); angTimer = 1.7 + Math.random() * 1.5; }
        blobTimer -= gdt; if (blobTimer <= 0) { spawnBlob(); blobTimer = 1.0 + Math.random() * 1.2; }
      }
      pearlTimer -= gdt;
      if (pearlTimer <= 0) { spawnPearl(); pearlTimer = boosting > 0 ? 0.32 : 0.9 + Math.random() * 0.9; }
      if (!sandOn && !beachOn && !deepOn && (jellyOn || elapsed > 6)) {
        enemyTimer -= gdt;
        if (enemyTimer <= 0) { spawnEnemy(); enemyTimer = jellyOn ? (0.45 + Math.random() * 0.6) : (2.6 + Math.random() * 2.6); }
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
          if (boss.active && boss.phase === "chase") boss.x -= 64; // outswim the predator
        }
        if (!o.smashed && boosting <= 0 && hits(player, o)) crashObstacle(o);
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
          burst(pr.x, py, "#ffffff", 8, 90);
          burst(pr.x, py, "#9fe8ff", 8, 120);
          pops.push({ x: pr.x, y: py, life: 1 });          // bright coin-shine flash
          store.pearlBank++; runPearls++; localStorage.setItem("pd_pearlbank", store.pearlBank);
          sfxPearl(combo);
          if (boss.active && boss.phase === "chase") boss.x -= 20;
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

      // harpoons vs jellyfish
      for (const sh of shots) {
        sh.x += sh.vx * gdt;
        for (const en of enemies) {
          if (en.hit) continue;
          const ey = enemyY(en);
          if (Math.abs(sh.x - en.x) < en.r + 8 && Math.abs(sh.y - ey) < en.r + 8) {
            en.hit = true; sh.dead = true;
            burst(en.x, ey, "#c9b0ff", 18, 220);
            addScore(3, en.x, ey - 10, "+3", "#c9b0ff");
            beep(520, 0.1, "square", 0.05);
          }
        }
      }
      shots = shots.filter(sh => !sh.dead && sh.x < W + 20);
      enemies = enemies.filter(en => !en.hit);

      // seabed hazards: hop over rocks, dodge floating urchins
      for (const rk of rocks) {
        rk.x -= speed * gdt;
        if (rk.type === "urchin") {
          const uy = rk.fy + Math.sin(elapsed * 2 + rk.ph) * 10;
          const dx = rk.x - player.x, dy = uy - player.y;
          if (!rk.dead && dx * dx + dy * dy < (rk.r + PLAYER_R) * (rk.r + PLAYER_R)) crashRock(rk);
        } else {
          const top = sandTop() - rk.h;
          if (!rk.dead && Math.abs(rk.x - player.x) < (rk.w / 2 + PLAYER_R) && player.y + PLAYER_R > top + 4) crashRock(rk);
        }
      }
      rocks = rocks.filter(rk => !rk.dead && rk.x > -60);

      // beach hazards: hop over beachgoers/umbrellas/castles, dodge gulls
      for (const o of beachObs) {
        o.x -= speed * gdt;
        if (o.fy != null) {
          o.fy += Math.max(-1, Math.min(1, (player.y - o.fy) / 60)) * 55 * gdt; // seagull swoops toward the prawn
          const uy = o.fy + Math.sin(elapsed * 2 + o.ph) * 8;
          const dx = o.x - player.x, dy = uy - player.y;
          if (!o.dead && dx * dx + dy * dy < (o.r + PLAYER_R) * (o.r + PLAYER_R)) crashRock(o);
        } else {
          const top = sandTop() - o.h;
          if (!o.dead && Math.abs(o.x - player.x) < (o.w / 2 + PLAYER_R) && player.y + PLAYER_R > top + 4) crashRock(o);
        }
      }
      beachObs = beachObs.filter(o => !o.dead && o.x > -60);

      // midnight zone: collect anglerfish to brighten your light; blobfish just drift
      for (const a of anglers) {
        a.x -= speed * 0.7 * gdt;
        const ay = angY(a);
        const dx = a.x - player.x, dy = ay - player.y;
        if (!a.got && dx * dx + dy * dy < (a.r + PLAYER_R + 8) * (a.r + PLAYER_R + 8)) {
          a.got = true; lightR = Math.min(300, lightR + 42);
          addScore(4, a.x, ay - 12, "💡 +4", "#ffe259"); burst(a.x, ay, "#ffe259", 16, 200);
          beep(900, 0.1, "sine", 0.05);
        }
      }
      anglers = anglers.filter(a => !a.got && a.x > -60);
      for (const b of blobs) b.x -= speed * 0.5 * gdt;
      blobs = blobs.filter(b => b.x > -60);
      for (const m of motes) { m.y -= m.vy * realDt; m.ph += realDt; m.x += Math.sin(m.ph) * 8 * realDt; if (m.y < -6) { m.y = H + 6; m.x = Math.random() * W; } }
      // glowing bubble trail streaming off the prawn — the only thing you can see it by in the dark
      pBubTimer -= realDt;
      if (deepWarn <= 0 && pBubTimer <= 0) {
        const moving = Math.abs(player.vy) > 40;
        pBubTimer = moving ? 0.045 : 0.12;            // faster stream when swimming, gentle drift when still
        const n = moving ? 2 : 1;
        for (let i = 0; i < n; i++) {
          pBubbles.push({
            x: player.x - PLAYER_R * 0.7 + (Math.random() - 0.5) * 8,
            y: player.y + (Math.random() - 0.5) * 10,
            r: 1.6 + Math.random() * 3.2,
            vx: -20 - Math.random() * 20,
            vy: -14 - Math.random() * 16,
            life: 1
          });
        }
      }
      for (const bb of pBubbles) { bb.x += bb.vx * realDt; bb.y += bb.vy * realDt; bb.vy -= 6 * realDt; bb.life -= realDt * 0.9; }
      pBubbles = pBubbles.filter(bb => bb.life > 0);
      // octopus attacker — homes toward the prawn in the dark
      if (deepOn) {
        octoTimer -= gdt;
        if (deepWarn <= 0 && octoTimer <= 0) { spawnOcto(); octoTimer = 5.5 + Math.random() * 3; }
        for (const o of octos) {
          o.x -= speed * 0.3 * gdt;
          o.x += (player.x - o.x) * 0.35 * gdt;
          o.y += (player.y - o.y) * 0.45 * gdt;
          o.ph += realDt * 3;
          const dx = o.x - player.x, dy = o.y - player.y;
          if (dx * dx + dy * dy < (o.r + PLAYER_R) * (o.r + PLAYER_R)) takeHit("octo");
        }
        octos = octos.filter(o => o.x > -80);
      }

      // boss predator chase (paused during special stages)
      if (!jellyOn && !sandOn && !beachOn && !deepOn) updateBoss(realDt, gdt);

      // floor / ceiling (in the jelly swarm the edges just clamp — no death)
      if (!jellyOn && !sandOn && !beachOn && !deepOn && jellyEase <= 0 && (player.y <= PLAYER_R || player.y >= H - PLAYER_R)) takeHit("wall");

      updateHUD();
    }

    // particles
    for (const p of particles) {
      p.x += p.vx * gdt; p.y += p.vy * gdt;
      p.vy += 300 * gdt;
      p.life -= realDt * 1.8;
    }
    particles = particles.filter(p => p.life > 0);
    for (const pp of pops) pp.life -= realDt * 3;
    pops = pops.filter(pp => pp.life > 0);

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

    if (beachOn) {
      // underwater base stays visible while the prawn swims up, then the sky fades in
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, `rgb(${bgTop[0] | 0},${bgTop[1] | 0},${bgTop[2] | 0})`);
      bg.addColorStop(1, `rgb(${bgBot[0] | 0},${bgBot[1] | 0},${bgBot[2] | 0})`);
      ctx.fillStyle = bg; ctx.fillRect(-30, -30, W + 60, H + 60);
      const skyA = beachRise > 0 ? Math.max(0, 1 - beachRise / 1.5)
                 : beachEnding ? Math.max(0, beachFall / 1.5)
                 : 1;
      ctx.save(); ctx.globalAlpha = skyA;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#6fc4ff"); sky.addColorStop(0.55, "#bfe6ff"); sky.addColorStop(1, "#ffe9b0");
      ctx.fillStyle = sky; ctx.fillRect(-30, -30, W + 60, H + 60);
      ctx.fillStyle = "rgba(255,244,170,0.95)"; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, 42, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const cx = ((-bgScroll * 0.2) % (W + 240) + (W + 240)) % (W + 240) - 120;
      cloud(cx, H * 0.2); cloud(cx + 340, H * 0.3);
      ctx.restore();
    } else {
      // biome background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, `rgb(${bgTop[0] | 0},${bgTop[1] | 0},${bgTop[2] | 0})`);
      bg.addColorStop(1, `rgb(${bgBot[0] | 0},${bgBot[1] | 0},${bgBot[2] | 0})`);
      ctx.fillStyle = bg;
      ctx.fillRect(-30, -30, W + 60, H + 60);
      drawGodRays();
      drawReef();
    }

    // far stars
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (const s of farStars) { ctx.fillRect(s.x, s.y, s.r, s.r); }
    // near specks (twinkle like sunlight through water)
    for (const s of stars) {
      const a = 0.4 + Math.sin(s.tw) * 0.35;
      ctx.fillStyle = `rgba(150,225,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }

    // drifting fish + swaying seaweed (underwater only — hidden on beach & in the dark deep)
    if (!beachOn && !deepOn) { drawFishAll(); drawSeaweed(); }

    // rising bubbles (underwater only)
    if (!beachOn) {
      ctx.lineWidth = 1;
      for (const b of bubbles) {
        ctx.fillStyle = "rgba(140,225,255,0.08)";
        ctx.strokeStyle = "rgba(150,230,255,0.28)";
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(220,250,255,0.5)";
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, 7); ctx.fill();
      }
    }

    // seabed floor + rocks (fades in on entry for a smooth sink-down)
    if (sandOn) {
      ctx.globalAlpha = sandEnter > 0 ? Math.max(0, 1 - sandEnter / 1.1) : 1;
      drawSandFloor(); ctx.globalAlpha = 1;
      for (const rk of rocks) drawRock(rk);
    }
    // beach floor + hazards (fades in with the sky; hidden during the dive-back)
    if (beachOn && !beachEnding) {
      ctx.globalAlpha = beachRise > 0 ? Math.max(0, 1 - beachRise / 1.5) : 1;
      drawBeachFloor(); for (const o of beachObs) drawBeachObs(o);
      ctx.globalAlpha = 1;
    }
    // midnight zone creatures (blobfish drift, anglerfish glow)
    if (deepOn) {
      for (const b of blobs) drawBlob(b.x, b.baseY + Math.sin(elapsed * 1.2 + b.ph) * b.amp, b.r);
      for (const o of octos) drawOcto(o.x, o.y, o.ph, o.r);
      for (const a of anglers) drawAngler(a.x, angY(a), a.r);
    }

    // pearls
    for (const pr of pearls) { drawPearl(pr.x, pr.y + Math.sin(pr.ph) * 4, pr.r); }

    // mystery boxes
    for (const bx of boxes) drawBox(bx);

    // enemies (jellyfish)
    for (const en of enemies) { drawJelly(en.x, enemyY(en), en.r, en.pulse); }

    // harpoon shots
    for (const sh of shots) {
      ctx.save();
      ctx.shadowColor = "#7fe8ff"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#dff6ff";
      ctx.beginPath(); ctx.ellipse(sh.x, sh.y, 11, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#7fe8ff";
      ctx.beginPath(); ctx.moveTo(sh.x + 11, sh.y - 4); ctx.lineTo(sh.x + 21, sh.y); ctx.lineTo(sh.x + 11, sh.y + 4); ctx.closePath(); ctx.fill();
      ctx.restore();
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
    // pearl-shine pops (coin-collect flash)
    for (const pp of pops) {
      const k = 1 - pp.life;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = pp.life;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pp.x, pp.y, 6 + k * 30, 0, 7); ctx.stroke();
      const g = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, 34);
      g.addColorStop(0, "rgba(255,255,255," + (pp.life * 0.6) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pp.x, pp.y, 34, 0, 7); ctx.fill();
      ctx.restore();
    }

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

    // midnight-zone darkness with light holes around the prawn & anglerfish
    if (deepOn) {
      ensureDark();
      // pitch black — only the anglerfish's lure carves light out of the dark
      const darkA = deepWarn > 0 ? Math.min(0.985, (2 - deepWarn) / 2 * 0.985) : 0.985;
      dctx.clearRect(0, 0, W, H);
      dctx.fillStyle = "rgba(2,3,10," + darkA + ")";
      dctx.fillRect(0, 0, W, H);
      dctx.globalCompositeOperation = "destination-out";
      for (const a of anglers) darkHole(a.x, angY(a), a.got ? 150 : 128);
      dctx.globalCompositeOperation = "source-over";
      ctx.drawImage(darkCanvas, 0, 0);
      // faint self-glowing motes (distant bioluminescence — they don't light the scene)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const m of motes) {
        const a = Math.max(0, 0.22 + Math.sin(m.ph * 2) * 0.18);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 3.2);
        g.addColorStop(0, "rgba(150,215,255," + a + ")");
        g.addColorStop(1, "rgba(150,215,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 3.2, 0, 7); ctx.fill();
      }
      // the prawn's glowing bubble trail — the only way to see where it is & how it moves
      for (const bb of pBubbles) {
        const a = Math.max(0, bb.life) * 0.8;
        const g = ctx.createRadialGradient(bb.x, bb.y, 0, bb.x, bb.y, bb.r * 3);
        g.addColorStop(0, "rgba(190,240,255," + a + ")");
        g.addColorStop(0.5, "rgba(150,220,255," + (a * 0.5) + ")");
        g.addColorStop(1, "rgba(150,220,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r * 3, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

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

    // lives + active power-up indicators (top-left, screen-fixed)
    if (state === STATE.PLAY) {
      ctx.font = "700 18px 'Trebuchet MS', sans-serif"; ctx.textAlign = "left";
      let iy = 40;
      ctx.fillStyle = "#ffd24d"; ctx.fillText("🛟 " + lives, 16, iy); iy += 26;
      ctx.fillStyle = "#bff0ff"; ctx.fillText("🔱 " + ammo, 16, iy); iy += 26;
      if (jellyOn) { ctx.fillStyle = "#c9b0ff"; ctx.fillText("🪼 SWARM " + Math.ceil(jellyT) + "s", 16, iy); iy += 26; }
      if (sandOn) { ctx.fillStyle = "#ffe0a8"; ctx.fillText("🏖️ TREK " + Math.ceil(sandT) + "s", 16, iy); iy += 26; }
      if (beachOn) { ctx.fillStyle = "#ffd27a"; ctx.fillText("☀️ BEACH " + Math.ceil(beachT) + "s", 16, iy); iy += 26; }
      if (deepOn) { ctx.fillStyle = "#8fe8ff"; ctx.fillText("🌑 DEEP " + Math.ceil(deepT) + "s", 16, iy); iy += 26; }
      if (mag > 0) { ctx.fillStyle = "#8fe8ff"; ctx.fillText("🧲 " + Math.ceil(mag) + "s", 16, iy); iy += 26; }
      if (dbl > 0) { ctx.fillStyle = "#ffe259"; ctx.fillText("💰 2× " + Math.ceil(dbl) + "s", 16, iy); iy += 26; }
      if (spd > 0) { ctx.fillStyle = "#8fffa0"; ctx.fillText("🌊 2× " + Math.ceil(spd) + "s", 16, iy); iy += 26; }
      ctx.textAlign = "left";
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
    const squash = 1 + Math.sin(pulse) * 0.1;
    ctx.shadowColor = "#c39bff"; ctx.shadowBlur = 16;
    ctx.lineCap = "round";
    // long wavy stinging tentacles
    ctx.strokeStyle = "rgba(180,140,255,0.8)"; ctx.lineWidth = 2.2;
    for (let i = -3; i <= 3; i++) {
      const tx = x + i * (r * 0.22);
      const s1 = Math.sin(pulse + i) * 8, s2 = Math.sin(pulse * 1.3 + i) * 12;
      ctx.beginPath();
      ctx.moveTo(tx, y + r * 0.35);
      ctx.bezierCurveTo(tx + s1, y + r * 0.95, tx - s2, y + r * 1.45, tx + s2 * 0.6, y + r * 2.0);
      ctx.stroke();
    }
    // thicker frilly oral arms
    ctx.strokeStyle = "rgba(214,175,255,0.65)"; ctx.lineWidth = 4.5;
    for (let i = -1; i <= 1; i++) {
      const tx = x + i * (r * 0.42);
      ctx.beginPath();
      ctx.moveTo(tx, y + r * 0.3);
      ctx.quadraticCurveTo(tx + Math.sin(pulse + i) * 7, y + r * 0.85, tx, y + r * 1.25);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // bell dome
    const g = ctx.createLinearGradient(x, y - r, x, y + r * 0.5);
    g.addColorStop(0, "rgba(228,205,255,0.97)");
    g.addColorStop(1, "rgba(150,100,255,0.62)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * squash, r * 0.92, 0, Math.PI, 0);
    ctx.closePath(); ctx.fill();
    // rim band under the bell
    ctx.strokeStyle = "rgba(190,150,255,0.9)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - r * squash, y); ctx.lineTo(x + r * squash, y); ctx.stroke();
    ctx.shadowBlur = 0;
    // spots on the bell
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.12, y - r * 0.52, r * 0.08, 0, 7); ctx.fill();
    // cute eyes
    ctx.fillStyle = "#3a1a6a";
    ctx.beginPath(); ctx.arc(x - r * 0.24, y - r * 0.18, r * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.24, y - r * 0.18, r * 0.11, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x - r * 0.21, y - r * 0.21, r * 0.04, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.27, y - r * 0.21, r * 0.04, 0, 7); ctx.fill();
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

  function drawSandFloor() {
    const top = sandTop();
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, "#e8c98a"); g.addColorStop(1, "#b8935a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, top);
    const off = bgScroll * 0.6;
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, top + Math.sin((x + off) / 40) * 5);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // speckles
    ctx.fillStyle = "rgba(120,90,50,0.35)";
    for (let i = 0; i < 34; i++) {
      const sx = ((i * 137 - bgScroll * 0.6) % W + W) % W;
      ctx.fillRect(sx, top + 16 + (i * 53) % (H - top - 24), 3, 3);
    }
  }

  function drawRock(rk) {
    if (rk.type === "urchin") {
      const uy = rk.fy + Math.sin(elapsed * 2 + rk.ph) * 10;
      drawUrchin(rk.x, uy, rk.r, rk.col);
      return;
    }
    const baseY = sandTop(), x = rk.x, h = rk.h, w = rk.w;
    const g = ctx.createLinearGradient(x, baseY - h, x, baseY);
    g.addColorStop(0, "#9298a0"); g.addColorStop(1, "#474d54");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, baseY);
    ctx.quadraticCurveTo(x - w / 2, baseY - h, x, baseY - h);
    ctx.quadraticCurveTo(x + w / 2, baseY - h, x + w / 2, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.ellipse(x - w * 0.15, baseY - h * 0.6, w * 0.18, h * 0.18, 0, 0, 7); ctx.fill();
  }

  function drawUrchin(x, y, r, col) {
    col = col || "#c05aff";
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    for (let a = 0; a < 14; a++) {
      const ang = (a / 14) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * r * 1.5, y + Math.sin(ang) * r * 1.5); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.14, 0, 7); ctx.fill();
    ctx.restore();
  }

  function cloud(cx, cy) {
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, 7); ctx.arc(cx + 26, cy + 6, 20, 0, 7); ctx.arc(cx - 24, cy + 8, 18, 0, 7);
    ctx.fill();
  }

  function drawBeachFloor() {
    const top = sandTop();
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, "#ffe6a8"); g.addColorStop(1, "#e0b96a");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, top);
    const off = bgScroll * 0.6;
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, top + Math.sin((x + off) / 45) * 4);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(160,120,60,0.3)";
    for (let i = 0; i < 30; i++) { const sx = ((i * 149 - bgScroll * 0.6) % W + W) % W; ctx.fillRect(sx, top + 16 + (i * 61) % (H - top - 24), 3, 3); }
  }

  function drawBeachObs(o) {
    const baseY = sandTop();
    if (o.type === "gull") {
      const uy = o.fy + Math.sin(elapsed * 2 + o.ph) * 8;
      const flap = Math.sin(elapsed * 6 + o.ph) * 6;
      ctx.strokeStyle = "#eef2f5"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(o.x - o.r * 1.4, uy - flap); ctx.quadraticCurveTo(o.x, uy + 4, o.x + o.r * 1.4, uy - flap); ctx.stroke();
      ctx.fillStyle = "#f2f5f7"; ctx.beginPath(); ctx.ellipse(o.x, uy + 2, o.r * 0.5, o.r * 0.35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffb400"; ctx.beginPath(); ctx.moveTo(o.x + o.r * 0.5, uy); ctx.lineTo(o.x + o.r * 0.95, uy + 2); ctx.lineTo(o.x + o.r * 0.5, uy + 5); ctx.closePath(); ctx.fill();
      ctx.lineCap = "butt";
      return;
    }
    const x = o.x, h = o.h, w = o.w, top = baseY - h;
    if (o.type === "umbrella") {
      ctx.strokeStyle = "#b5651d"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, top); ctx.stroke();
      const cw = 60;
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? "#ff5a5a" : "#ffffff";
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - cw + i * (cw * 2 / 6), top + 20); ctx.lineTo(x - cw + (i + 1) * (cw * 2 / 6), top + 20); ctx.closePath(); ctx.fill();
      }
    } else if (o.type === "castle") {
      ctx.fillStyle = "#e6b062"; ctx.fillRect(x - w / 2, top, w, h);
      ctx.fillRect(x - w / 2, top - 8, 10, 8); ctx.fillRect(x - 5, top - 8, 10, 8); ctx.fillRect(x + w / 2 - 10, top - 8, 10, 8);
      ctx.strokeStyle = "#7a4a10"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, top - 8); ctx.lineTo(x, top - 26); ctx.stroke();
      ctx.fillStyle = "#ff5a5a"; ctx.beginPath(); ctx.moveTo(x, top - 26); ctx.lineTo(x + 14, top - 22); ctx.lineTo(x, top - 18); ctx.closePath(); ctx.fill();
    } else {
      // human beachgoer
      const skin = o.tone < 0.5 ? "#e8b98a" : "#c98a5a";
      const suit = o.tone < 0.33 ? "#ff5a8a" : (o.tone < 0.66 ? "#3aa0ff" : "#ffcf3a");
      ctx.strokeStyle = skin; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 5, baseY); ctx.lineTo(x - 4, top + h * 0.45); ctx.moveTo(x + 5, baseY); ctx.lineTo(x + 4, top + h * 0.45); ctx.stroke();
      ctx.fillStyle = suit; roundRect(x - 10, top + h * 0.28, 20, h * 0.3, 6); ctx.fill();
      ctx.strokeStyle = skin; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 9, top + h * 0.32); ctx.lineTo(x - 16, top + h * 0.5); ctx.moveTo(x + 9, top + h * 0.32); ctx.lineTo(x + 16, top + h * 0.5); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, top + h * 0.16, 11, 0, 7); ctx.fill();
      ctx.fillStyle = "#3a2a1a"; ctx.beginPath(); ctx.arc(x, top + h * 0.13, 11, Math.PI, 0); ctx.fill();
    }
  }

  function ensureDark() {
    if (!darkCanvas) { darkCanvas = document.createElement("canvas"); dctx = darkCanvas.getContext("2d"); }
    if (darkCanvas.width !== W || darkCanvas.height !== H) { darkCanvas.width = W; darkCanvas.height = H; }
  }
  function darkHole(x, y, r) {
    const g = dctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.65, "rgba(0,0,0,0.8)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g;
    dctx.beginPath(); dctx.arc(x, y, r, 0, 7); dctx.fill();
  }

  function drawBlob(x, y, r) {
    ctx.save();
    // gentle gelatinous jiggle so the whole body looks soft & curvy
    const wob = Math.sin(elapsed * 2 + x * 0.05) * r * 0.06;
    // soft translucent halo
    ctx.shadowColor = "#f0b8d0"; ctx.shadowBlur = 14;
    const bg = ctx.createLinearGradient(x, y - r, x, y + r * 1.3);
    bg.addColorStop(0, "#f2b6cf"); bg.addColorStop(0.55, "#dd95b3"); bg.addColorStop(1, "#c77d9c");
    ctx.fillStyle = bg;
    // rounded, saggy, all-curves silhouette (smooth beziers, no straight edges)
    ctx.beginPath();
    ctx.moveTo(x - r * 0.95, y - r * 0.05);
    ctx.bezierCurveTo(x - r * 1.05, y - r * 0.75, x - r * 0.45, y - r * 1.02, x, y - r * 0.98);      // left cheek up over the head
    ctx.bezierCurveTo(x + r * 0.45, y - r * 1.02, x + r * 1.05, y - r * 0.75, x + r * 0.95, y - r * 0.05); // right cheek
    ctx.bezierCurveTo(x + r * 1.18, y + r * 0.5, x + r * 0.7, y + r * 1.05 + wob, x + r * 0.22, y + r * 1.12); // droopy jowl right
    ctx.bezierCurveTo(x + r * 0.08, y + r * 1.2, x - r * 0.08, y + r * 1.2, x - r * 0.22, y + r * 1.12);       // saggy chin
    ctx.bezierCurveTo(x - r * 0.7, y + r * 1.05 - wob, x - r * 1.18, y + r * 0.5, x - r * 0.95, y - r * 0.05);  // droopy jowl left
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // big curvy droopy bulbous nose
    ctx.fillStyle = "#c97a9a";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.26, y + r * 0.16);
    ctx.bezierCurveTo(x - r * 0.34, y + r * 0.6, x - r * 0.16, y + r * 0.86, x, y + r * 0.86);
    ctx.bezierCurveTo(x + r * 0.16, y + r * 0.86, x + r * 0.34, y + r * 0.6, x + r * 0.26, y + r * 0.16);
    ctx.closePath(); ctx.fill();
    // soft nose highlight
    ctx.fillStyle = "rgba(255,220,235,0.55)"; ctx.beginPath(); ctx.ellipse(x - r * 0.06, y + r * 0.42, r * 0.1, r * 0.16, 0, 0, 7); ctx.fill();
    // big sad eyes (white + pupil + shine)
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.14, r * 0.26, r * 0.24, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.4, y - r * 0.14, r * 0.26, r * 0.24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a1620";
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.05, r * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.05, r * 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x - r * 0.31, y - r * 0.1, r * 0.04, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.49, y - r * 0.1, r * 0.04, 0, 7); ctx.fill();
    // curvy droopy eyebrows
    ctx.strokeStyle = "#8a5565"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - r * 0.62, y - r * 0.34); ctx.quadraticCurveTo(x - r * 0.4, y - r * 0.46, x - r * 0.16, y - r * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + r * 0.62, y - r * 0.34); ctx.quadraticCurveTo(x + r * 0.4, y - r * 0.46, x + r * 0.16, y - r * 0.28); ctx.stroke();
    // curvy pouty lips (a soft wavy frown)
    ctx.strokeStyle = "#7a2f48"; ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.34, y + r * 0.98);
    ctx.quadraticCurveTo(x, y + r * 0.72, x + r * 0.34, y + r * 0.98);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.restore();
  }

  function drawAngler(x, y, r) {
    ctx.save();
    const lx = x + r * 1.2, ly = y - r * 1.25;
    // lure glow
    const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 28);
    g.addColorStop(0, "#fff6b0"); g.addColorStop(1, "rgba(255,240,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 28, 0, 7); ctx.fill();
    // stalk
    ctx.strokeStyle = "#2a2a30"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + r * 0.4, y - r * 0.5); ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.1, lx, ly); ctx.stroke();
    // lure bulb
    ctx.fillStyle = "#fff6b0"; ctx.shadowColor = "#fff2a0"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    // dark body
    ctx.fillStyle = "#20242e"; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.85, 0, 0, 7); ctx.fill();
    // toothy grin
    ctx.fillStyle = "#0a0a10"; ctx.beginPath(); ctx.moveTo(x + r * 0.2, y + r * 0.1); ctx.lineTo(x + r, y - r * 0.1); ctx.lineTo(x + r, y + r * 0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) { const tx = x + r * 0.35 + i * r * 0.18; ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + 3, y + 6); ctx.lineTo(tx + 6, y); ctx.closePath(); ctx.fill(); }
    // eye
    ctx.fillStyle = "#ffdd33"; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.22, r * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.22, r * 0.08, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawOcto(x, y, ph, r) {
    ctx.save();
    // tentacles
    ctx.strokeStyle = "#7a3fd0"; ctx.lineWidth = 6; ctx.lineCap = "round";
    for (let i = -3; i <= 3; i++) {
      const tx = x + i * (r * 0.28);
      ctx.beginPath(); ctx.moveTo(tx, y + r * 0.4);
      ctx.quadraticCurveTo(tx + Math.sin(ph + i) * 10, y + r * 1.1, tx + Math.sin(ph * 1.3 + i) * 16, y + r * 1.7);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // bulbous head
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, "#c78bff"); g.addColorStop(1, "#6a2fb0");
    ctx.fillStyle = g; ctx.shadowColor = "#b06bff"; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.95, 0, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // big angry glowing eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.08, r * 0.24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.08, r * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a0a3a";
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.02, r * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.4, y - r * 0.02, r * 0.12, 0, 7); ctx.fill();
    // angry brows
    ctx.strokeStyle = "#3a1060"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - r * 0.62, y - r * 0.42); ctx.lineTo(x - r * 0.12, y - r * 0.24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + r * 0.62, y - r * 0.42); ctx.lineTo(x + r * 0.12, y - r * 0.24); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.restore();
  }

  function drawShark(x, y, snap) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(255,45,45,0.5)"; ctx.shadowBlur = 16;
    const grd = ctx.createLinearGradient(0, -38, 0, 38);
    grd.addColorStop(0, "#5f6f7c"); grd.addColorStop(1, "#26333d");
    ctx.fillStyle = grd;
    // fat, curvy shark body: tall arched back, deep rounded belly, pointed snout
    ctx.beginPath();
    ctx.moveTo(-58, -2);
    ctx.bezierCurveTo(-30, -32, 18, -36, 52, -18);   // taller arched back
    ctx.quadraticCurveTo(90, -5, 90, 1);             // pointed snout tip
    ctx.quadraticCurveTo(90, 9, 52, 22);             // deep chin
    ctx.bezierCurveTo(12, 38, -32, 32, -58, 2);      // fat rounded belly
    ctx.closePath(); ctx.fill();
    // forked tail that swishes vertically (left)
    const tw = Math.sin(snap * 2) * 7;
    ctx.beginPath(); ctx.moveTo(-54, 0); ctx.lineTo(-84, -26 + tw); ctx.lineTo(-68, 0); ctx.lineTo(-84, 26 + tw); ctx.closePath(); ctx.fill();
    // dorsal fin (top)
    ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(10, -46); ctx.lineTo(26, -16); ctx.closePath(); ctx.fill();
    // pectoral fin (bottom)
    ctx.beginPath(); ctx.moveTo(14, 15); ctx.lineTo(4, 40); ctx.lineTo(36, 17); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // pale belly stripe
    ctx.fillStyle = "rgba(212,222,227,0.28)";
    ctx.beginPath(); ctx.ellipse(6, 9, 48, 9, 0, 0, 7); ctx.fill();
    // gills
    ctx.strokeStyle = "rgba(10,16,20,0.6)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(36 - i * 7, -10); ctx.lineTo(33 - i * 7, 10); ctx.stroke(); }
    // mouth + teeth (snapping)
    const open = (Math.sin(snap) * 0.5 + 0.5) * 6 + 3;
    ctx.strokeStyle = "#12060a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(78, 5); ctx.quadraticCurveTo(54, 13 + open, 36, 9); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i++) { const tx = 42 + i * 8, ty = 9 + open * 0.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 4, ty + 7); ctx.lineTo(tx + 8, ty); ctx.closePath(); ctx.fill(); }
    // fierce red eye
    ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = 10; ctx.fillStyle = "#ff2a2a";
    ctx.beginPath(); ctx.arc(50, -8, 6, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#140000"; ctx.beginPath(); ctx.arc(52, -8, 3, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBox(bx) {
    const p = bx.pu;
    ctx.save();
    ctx.translate(bx.x, bx.y + Math.sin(bx.spin) * 3); // gentle bob
    ctx.shadowColor = p.color; ctx.shadowBlur = 18;
    // rounded badge with the power-up's colour
    ctx.fillStyle = "rgba(6,26,38,0.88)";
    ctx.strokeStyle = p.color; ctx.lineWidth = 3;
    roundRect(-bx.r, -bx.r, bx.r * 2, bx.r * 2, 8); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // the icon / label so you can see what it is
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 " + Math.floor(bx.r * 1.15) + "px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.icon, 0, 1);
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
    if (boosting > 0) drawSub(PLAYER_R);
    else TIERS[curLevel].draw(PLAYER_R);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // cute little submarine ("AQUAPOD") the prawn rides during a jet
  function drawSub(r) {
    const R = r * 1.7;
    ctx.shadowColor = "#ffd24d"; ctx.shadowBlur = 20;
    // spinning tail propeller (left)
    ctx.strokeStyle = "#c77a10"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(-R * 1.28, 0); ctx.stroke();
    ctx.fillStyle = "#ffd24d";
    const pw = Math.abs(Math.sin(performance.now() / 30)) * R * 0.5 + R * 0.12;
    ctx.beginPath(); ctx.ellipse(-R * 1.32, 0, R * 0.12, pw, 0, 0, 7); ctx.fill();
    // hull (yellow capsule)
    const g = ctx.createLinearGradient(0, -R * 0.7, 0, R * 0.7);
    g.addColorStop(0, "#ffe27a"); g.addColorStop(1, "#ff9e2e");
    ctx.fillStyle = g;
    roundRect(-R, -R * 0.62, R * 2, R * 1.24, R * 0.6); ctx.fill();
    // nose cone (right)
    ctx.beginPath(); ctx.moveTo(R * 0.9, -R * 0.5); ctx.quadraticCurveTo(R * 1.5, 0, R * 0.9, R * 0.5); ctx.closePath(); ctx.fill();
    // conning tower / periscope (top)
    ctx.beginPath(); ctx.moveTo(-R * 0.25, -R * 0.6); ctx.lineTo(-R * 0.05, -R * 1.05); ctx.lineTo(R * 0.3, -R * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c77a10"; ctx.fillRect(-R * 0.02, -R * 1.15, R * 0.16, R * 0.18);
    // bottom fins
    ctx.fillStyle = "#ff9e2e";
    ctx.beginPath(); ctx.moveTo(-R * 0.4, R * 0.55); ctx.lineTo(-R * 0.62, R * 0.95); ctx.lineTo(-R * 0.1, R * 0.6); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // porthole window
    ctx.fillStyle = "#08324a"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(R * 0.18, 0, R * 0.5, 0, 7); ctx.fill(); ctx.stroke();
    // prawn's cute face peeking out of the window
    ctx.fillStyle = "#ff8a3c";
    ctx.beginPath(); ctx.arc(R * 0.18, R * 0.12, R * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(R * 0.05, -R * 0.05, R * 0.12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(R * 0.33, -R * 0.05, R * 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = "#120a05";
    ctx.beginPath(); ctx.arc(R * 0.08, -R * 0.05, R * 0.06, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(R * 0.36, -R * 0.05, R * 0.06, 0, 7); ctx.fill();
    // window gl0ss
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath(); ctx.arc(R * 0.02, -R * 0.22, R * 0.14, 0, 7); ctx.fill();
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
    if (!paused) update(dt); // frozen while paused
    draw();
    requestAnimationFrame(loop);
  }

  function togglePause() {
    if (state !== STATE.PLAY) return;
    paused = !paused;
    el.pauseScreen.classList.toggle("hidden", !paused);
    el.btnPause.textContent = paused ? "▶" : "⏸";
  }

  // ---------- UI helpers ----------
  function refreshMenuStats() {
    el.startBest.textContent = store.best;
    el.startStreak.textContent = store.dayStreak;   // show the daily-comeback streak
    el.hudBest.textContent = store.best;
  }

  // ---------- Daily reward (retention hook) ----------
  const DAILY_BASE = 100, DAILY_STEP = 50, DAILY_MAX = 500;
  let pendingDailyReward = 0, pendingDailyStreak = 0;
  function fmtDate(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function checkDailyReward() {
    const now = new Date();
    const today = fmtDate(now);
    if (store.lastClaim === today) return;          // already claimed today
    const y = new Date(now); y.setDate(now.getDate() - 1);
    pendingDailyStreak = (store.lastClaim === fmtDate(y)) ? store.dayStreak + 1 : 1;  // consecutive?
    pendingDailyReward = Math.min(DAILY_MAX, DAILY_BASE + (pendingDailyStreak - 1) * DAILY_STEP);
    el.dailyStreak.textContent = "Day " + pendingDailyStreak + " streak 🔥";
    el.dailyAmount.textContent = "+" + pendingDailyReward + " 🫧";
    el.dailyOverlay.classList.remove("hidden");
  }
  function claimDaily() {
    store.pearlBank += pendingDailyReward;
    store.dayStreak = pendingDailyStreak;
    store.lastClaim = fmtDate(new Date());
    localStorage.setItem("pd_pearlbank", store.pearlBank);
    localStorage.setItem("pd_daystreak", store.dayStreak);
    localStorage.setItem("pd_lastclaim", store.lastClaim);
    el.dailyOverlay.classList.add("hidden");
    burst(W / 2, H / 2, "#ffd83a", 30, 260);
    toast("Daily reward claimed: +" + pendingDailyReward + " 🫧!");
    if (store.sound) sfxPearl(24);
    refreshMenuStats();
  }

  // ---------- PWA install (re-engagement) ----------
  let deferredInstall = null;
  function initPWA() {
    // only register the service worker on builds that ship a manifest (our own hosting)
    if ("serviceWorker" in navigator && document.querySelector('link[rel="manifest"]')) {
      try { navigator.serviceWorker.register("sw.js").catch(function () {}); } catch (e) { /* ignore */ }
    }
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault(); deferredInstall = e;
      if (el.btnInstall) el.btnInstall.classList.remove("hidden");
    });
    window.addEventListener("appinstalled", function () {
      if (el.btnInstall) el.btnInstall.classList.add("hidden");
    });
    if (el.btnInstall) {
      el.btnInstall.addEventListener("click", async function () {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        try { await deferredInstall.userChoice; } catch (e) { /* ignore */ }
        deferredInstall = null;
        el.btnInstall.classList.add("hidden");
      });
    }
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
    const text = `PRAWNSTAR 🦐⭐\nScore: ${score}  (best ${store.best}) — evolved to ${tier.name} ${tier.emoji}!\n${blocks}\nCan you out-swim me?`;
    const url = location.href;
    if (navigator.share) {
      navigator.share({ title: "Prawnstar", text, url }).catch(() => {});
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
  el.btnRetry.addEventListener("click", retry);
  el.btnShare.addEventListener("click", shareScore);
  el.btnRevive.addEventListener("click", reviveByAd);
  el.btnRevivePearl.addEventListener("click", reviveByPearls);
  el.btnDouble.addEventListener("click", watchDoublePearls);
  el.btnBoost.addEventListener("click", doBoost);
  el.btnAttack.addEventListener("click", fireShot);
  el.btnClaimDaily.addEventListener("click", claimDaily);
  el.btnUp.addEventListener("pointerdown", (e) => { e.preventDefault(); holdUp = true; flap(); });
  el.btnDown.addEventListener("pointerdown", (e) => { e.preventDefault(); holdDown = true; dive(); });
  window.addEventListener("pointerup", () => { holdUp = false; holdDown = false; });
  window.addEventListener("keydown", (e) => { if (e.code === "ArrowUp" || e.code === "Space") holdUp = true; else if (e.code === "ArrowDown") holdDown = true; });
  window.addEventListener("keyup", (e) => { if (e.code === "ArrowUp" || e.code === "Space") holdUp = false; else if (e.code === "ArrowDown") holdDown = false; });
  el.btnPause.addEventListener("click", togglePause);
  el.btnResume.addEventListener("click", togglePause);
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyF") fireShot();
    else if (e.code === "KeyB") doBoost();
    else if (e.code === "ArrowDown") { dive(); e.preventDefault(); }
    else if (e.code === "KeyP" || e.code === "Escape") { togglePause(); e.preventDefault(); }
  });
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
  initPWA();
  checkDailyReward();
  requestAnimationFrame(loop);
})();
