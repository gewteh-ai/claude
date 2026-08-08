# 🦐⭐ PrawnStar

A polished, **addictive one-tap arcade game** built with pure HTML/CSS/JS — **no dependencies, no build step, runs offline**.

Tap / click / press **Space** to swim a **prawn** through a glowing coral reef. Grab pearls, open mystery boxes, dodge jellyfish, and evolve all the way to a **Leviathan** 🐋.

![theme: reef](https://img.shields.io/badge/theme-reef-22e0ff) ![deps: none](https://img.shields.io/badge/dependencies-none-9b5cff) ![offline: yes](https://img.shields.io/badge/offline-ready-ff2fb9)

## ✨ Features

- **Addictive one-tap loop** — instant tap-to-retry, escalating speed & shrinking gaps, near-miss tension
- **5-tier evolution** — 🦐 Prawn → 🦞 Lobster (20) → 🦀 Crab (50) → 🐙 Kraken (95) → 🐋 Leviathan (160)
- **🫧 Pearls & combos** — grab pearl clusters to build a multiplier (up to x5)
- **🎁 Mystery boxes** — swim into a spinning box for a random reward: JET charge, pearl burst, shield, score bonus, slow-mo, or a combo boost
- **🚀 JET power-up** — fill the meter with pearls, then fly invincibly and magnet-vacuum every pearl
- **⏱️ Near-miss slow-mo** — squeak through a gap for a slow-motion "CLOSE!" bonus
- **🛡️ Shield** — higher tiers gain regenerating shields that absorb a hit
- **🪼 Jellyfish hazards** — dodge them (or smash through during a JET)
- **🦈 Shark boss chase** — in the deep, a predator hunts you; keep scoring (pass coral, grab pearls) to push it back and survive the encounter, or get eaten
- **🌊 Depth biomes** — the reef transforms as you dive: Coral Reef → Kelp Forest → Deep Trench → Bioluminescent Abyss, with moving gaps in the deep
- **⚡ Power-ups** — Magnet and Double-Score from mystery boxes
- **🌊 Living reef background** — light rays, distant coral silhouettes, swaying seaweed, and drifting fish
- **Virality & retention** — share-score button, high score & streak saved locally
- **Monetization hook** — game-over ad slot ready for AdSense/Adsterra

## 🚀 Run it

Static files — serve any way you like:

```bash
python3 -m http.server 8000    # then open http://localhost:8000
# or: npx serve .
```

Deploys free on **GitHub Pages** (via the included Actions workflow), Netlify, Cloudflare Pages, etc.

## 🎮 Controls

| Action | Input |
|---|---|
| Swim up | Tap, click, **Space**, or **↑** |
| JET (when charged) | tap the **🚀 JET** button, or press **B** |

## 📁 Structure

```
index.html   # markup, HUD, screens; loads game.js
style.css    # reef theme, HUD, missions/reward popups
game.js      # the game: swim loop, pearls, boxes, JET, jellyfish, evolution, reef background
game3d.js    # (experimental) a 3D Three.js runner variant, not currently loaded
.github/workflows/deploy.yml  # auto-deploy to GitHub Pages on push
```

---

Built as a low-effort / high-fun starter. Ship it, share it, theme it. 🐋
