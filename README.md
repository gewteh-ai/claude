# 🦐 Prawn Dash 3D

A **3D endless reef runner** (Subway-Surfers style) built with **Three.js** — dodge coral, grab pearls, open mystery boxes, fill the JET, and evolve from a prawn into a **Leviathan**.

Three.js is loaded from a CDN, so it runs in any modern browser. The game is otherwise dependency-free static HTML/CSS/JS.

![theme: reef](https://img.shields.io/badge/theme-reef-22e0ff) ![engine: three.js](https://img.shields.io/badge/engine-three.js-9b5cff) ![type: endless runner](https://img.shields.io/badge/type-endless%20runner-ff2fb9)

## 🎮 How to play

| Action | Input |
|---|---|
| Switch lane | ◀ ▶ arrow keys, or **swipe left/right** |
| Jump | ▲ / **Space**, tap, or **swipe up** |
| JET (when charged) | tap the **🚀 JET** button, or press **B** |

Dodge green **coral blocks** (change lane) and orange **hurdles** (jump). Run through 🫧 **pearls** to score and charge your JET.

## ✨ Features

- **True 3D lane runner** — three lanes, jumping, speed ramp, fog + parallax reef for depth
- **5-tier evolution** — 🦐 Prawn → 🦞 Lobster → 🦀 Crab → 🐙 Kraken → 🐋 Leviathan (your critter grows & recolors as your score climbs)
- **🚀 JET power-up** — fill it with pearls, then fly above the reef, invincible, **magnet-vacuuming** every pearl
- **🎁 Mystery boxes** — random rewards: instant JET, pearl burst, shield, or score bonus
- **🎯 Missions** — persistent goals with progress bars (collect pearls, open boxes, run distance, reach a tier); complete them for a reward and a harder next goal
- **🎵 Music + SFX** — a built-in synth soundtrack (no audio files) and sound effects, both toggleable
- **Monetization hook** — game-over ad slot ready for AdSense/Adsterra
- Persistent best score, distance, and lifetime stats via `localStorage`

## 🚀 Run it

Static files — serve any way you like:

```bash
python3 -m http.server 8000    # then open http://localhost:8000
# or: npx serve .
```

Deploys free on **GitHub Pages** (via the included Actions workflow), Netlify, Cloudflare Pages, etc.

## 📁 Structure

```
index.html   # markup, HUD, screens, loads Three.js (CDN) + game3d.js
style.css    # theme, HUD, missions, popups
game3d.js    # the 3D game: scene, runner, pearls, boxes, JET, missions, music
game.js      # (legacy) the original 2D version, no longer loaded
.github/workflows/deploy.yml  # auto-deploy to GitHub Pages on push
```

## 🔧 Tuning

Open `game3d.js` and tweak the constants near the top: lane width, speed, jump, JET duration/magnet, and the `TIERS` thresholds/colors.

---

Built as a low-effort / high-fun starter. Ship it, share it, theme it. 🐋
