# Voidbound Privacy Policy

Last updated: 2026-08-17

Voidbound ("the game", "we", "our") is a single-player, offline-first
desktop game. This privacy policy explains what data the game
collects, stores, and transmits.

----------------------------------------------------------------------
## Short version
----------------------------------------------------------------------

**The game itself does not collect, transmit, or sell any personal
data.** All gameplay data (characters, progress, settings, key
bindings) is stored locally on your computer. The only network
contact the game makes is through Steam (the platform you
downloaded it from), which is governed by Valve's Privacy Policy:

  https://store.steampowered.com/privacy_agreement/

----------------------------------------------------------------------
## What is stored on your computer
----------------------------------------------------------------------

When you play, the game creates and modifies the following files
inside your operating system's user-data directory:

  - Windows: `%APPDATA%\Voidbound\`
  - macOS:   `~/Library/Application Support/Voidbound/`
  - Linux:   `~/.local/share/Voidbound/`

Files include:

  - `account.json`        — your local account record (if used)
  - `characters/*.json`   — saved characters (level, items, etc.)
  - `settings.json`       — your local settings (volume, keybinds)
  - `screenshots/*.png`   — screenshots you take in-game
  - `logs/*.log`          — diagnostic logs (opt-in via env var)

These files:

  - are stored **only** on your machine
  - are **never** uploaded to any server operated by the developer
  - can be deleted at any time by closing the game and deleting the
    folder above

----------------------------------------------------------------------
## What is transmitted
----------------------------------------------------------------------

The game does **not** initiate any outbound network connections of its
own. Network activity comes exclusively from:

  1. **Steam client** (if Steam is running and you launched the game
     through it). Valve's privacy policy applies:
     https://store.steampowered.com/privacy_agreement/

  2. **Tauri webview** (Windows WebView2 / macOS WKWebView / Linux
     WebKitGTK) — same engine your browser uses. Webview itself may
     make standard local resource requests for the bundled HTML/JS
     that ships inside the game binary. These requests go to local
     file paths inside the installation folder, not to any external
     server.

The game **does not** use:

  - analytics SDKs (Google Analytics, GameAnalytics, Unity Analytics,
    etc.)
  - crash reporting SDKs (Sentry, Bugsnag, etc.)
  - ad networks
  - social features that transmit user data
  - telemetry or "phone home" pings

----------------------------------------------------------------------
## Children
----------------------------------------------------------------------

The game is rated for general audiences (no real-world violence
against identifiable persons; fantasy combat only). We do not
knowingly collect data from children under 13, and because we do
not collect data from anyone, COPPA / GDPR-K / equivalent
regulations are not engaged by the game itself.

----------------------------------------------------------------------
## Changes to this policy
----------------------------------------------------------------------

If this policy changes, the changes will be:

  - posted at this same URL
  - summarized in the game's release notes (CHANGELOG.md)
  - effective immediately upon posting, unless stated otherwise

----------------------------------------------------------------------
## Contact
----------------------------------------------------------------------

Questions or concerns:

  - GitHub issue: https://github.com/wang19baby/Voidbound/issues
    (subject prefix `[Privacy]`)
  - Email: see https://github.com/wang19baby/Voidbound (profile)

We will respond within 30 days.

----------------------------------------------------------------------

Voidbound Contributors, 2026

SPDX-License-Identifier: CC-BY-4.0
