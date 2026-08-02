# 🦐 Prawn Dash

A polished, **addictive one-tap arcade game** built with pure HTML/CSS/JS — **no dependencies, no build step, runs offline**.

Tap / click / press **Space** to swim a **prawn** through a glowing coral reef. Survive to a score of **10** and your prawn **levels up into a lobster** 🦞 (bigger, with claws). Miss a gap and you restart instantly — the classic "one more try" loop that makes these games so sticky.

![theme: neon](https://img.shields.io/badge/theme-neon-22e0ff) ![deps: none](https://img.shields.io/badge/dependencies-none-9b5cff) ![offline: yes](https://img.shields.io/badge/offline-ready-ff2fb9)

## ✨ Features

- **Addictive core loop** — instant tap-to-retry, escalating speed & shrinking gaps, near-miss tension
- **5-tier evolution** — 🦐 Prawn → 🦞 Lobster (20) → 🦀 Crab (50) → 🐙 Kraken (95) → 🐋 Leviathan (160), each with a celebration burst + rising chime + big banner, and shown on the game-over screen
- **Excitement Pack** —
  - 🫧 **Pearls & combos**: grab pearl clusters to build a combo multiplier (up to x5) and rack up points
  - ⏱️ **Near-miss slow-mo**: squeak through a tight gap for a slow-motion "CLOSE!" bonus
  - 🛡️ **Shield ability**: higher tiers gain regenerating shield charges that absorb a hit (armor scales with evolution)
  - 🚀 **JET power-up** (Subway-Surfers style): pearls fill a meter — launch a 4.5s invincible jet that flies you forward, **magnetizes and vacuums up pearls**, and smashes through coral and jellyfish
  - 🪼 **Jellyfish hazard**: drifting enemies you must dodge (or smash during a boost)
  - Screen flash + floating score popups for extra juice
- **Underwater theme** — ocean gradient, rising bubbles, glowing coral/kelp obstacles, hand-drawn prawn & lobster
- **Polished visuals** — glow, particle bursts, light specks, bubble trail, screen shake
- **Sound with zero asset files** — tiny built-in WebAudio synth for flaps/scores/crashes
- **Virality** — Share Score button (native share sheet + clipboard fallback with emoji result)
- **Retention** — high score & play streak saved in `localStorage`
- **Mobile + desktop** — responsive canvas, touch & keyboard controls
- **Monetization hooks pre-wired** (see below)

## 🚀 Run it

It's just static files. Any of these work:

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: Node
npx serve .
```

Then open <http://localhost:8000>. Or simply double-click `index.html`.

### Deploy free
Drop the folder onto **GitHub Pages**, **Vercel**, **Netlify**, or **Cloudflare Pages** — no config needed.

## 💰 Monetization hooks (add your keys after deploy)

The money-making integrations are stubbed so the game runs with **no keys** now. To go live:

| Hook | Where | What to do |
|---|---|---|
| **Game-over banner ad** | `#ad-slot` in `index.html` + `requestAd()` in `game.js` | Insert your AdSense / Adsterra / GAM tag |
| **Rewarded "Revive" video** | `revive()` + `requestAd()` in `game.js` | Call a rewarded-video network; resume on completion |
| **Pro / no-ads** | (stub) | Gate the ad slot behind a purchase flag |

> Note: ads/payments can't run in an offline sandbox — wire real keys once deployed to a public URL.

## 🎨 Make it your own (niche = virality)

Themes travel fast inside communities. Easy tweaks:

- **Colors:** edit the `--neon-*` variables in `style.css`
- **Difficulty:** `GRAVITY`, `FLAP_V`, `SPEED_BASE`, `GAP_BASE` in `game.js`
- **Theme the orb/obstacles** for a niche (football, K-pop, coding, local flavor) to spark community sharing

## 🕹️ Controls

| Action | Input |
|---|---|
| Fly / flap | Tap, click, **Space**, or **↑** |
| Start / retry | On-screen button |

## 📁 Structure

```
index.html   # markup, screens, HUD, ad slot
style.css    # neon theme & layout
game.js      # engine: loop, physics, spawning, particles, audio, share, hooks
```

---

Built as a low-effort / high-virality starter. Ship it, share it, theme it. 🎮
