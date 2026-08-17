# Voidbound — Audio Credits & Licenses

> SPDX-License-Identifier: CC-BY-NC-ND-4.0 (asset license applies to the
> composition/use within the game; the **upstream source licenses** below
> govern the original files before integration)

This file documents the source and license of every audio file shipped
in `assets/sfx/`. The project is committed to using only audio that is
either in the public domain (CC0) or properly attributed (CC-BY).

If you (the project owner) used a file that is **not** listed here, or
listed a wrong license, please update this file immediately — failing
to do so is a licensing violation.

----------------------------------------------------------------------
## How to add a new audio file
----------------------------------------------------------------------

When you add a new `.wav` (or `.ogg` / `.mp3`) to `assets/sfx/`, append
an entry below in this format:

```
- <filename>
    Source:   <OpenGameArt.org URL | freesound.org URL | author name>
    Author:   <original creator, or "anonymous">
    License:  <CC0 | CC-BY 3.0 | CC-BY 4.0 | Public Domain | ...>
    Required: <credit text from upstream, e.g. "Music by Kevin MacLeod">
    Notes:    <optional: trimmed / pitch-shifted / looped>
```

----------------------------------------------------------------------
## BGM (background music)
----------------------------------------------------------------------

- `bgm_forest.wav`
    Source:   TBD — owner must fill in
    Author:   TBD
    License:  TBD — must be CC0 or CC-BY
    Required: TBD
    Notes:    TBD

- `bgm_desert.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `bgm_ruin.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `bgm_void.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

----------------------------------------------------------------------
## SFX (sound effects)
----------------------------------------------------------------------

- `fireball.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `hit.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `swing.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `die.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `boss_roar.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `crit.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `levelup.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `pickup.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

- `ui_click.wav`
    Source:   TBD
    Author:   TBD
    License:  TBD
    Required: TBD
    Notes:    TBD

----------------------------------------------------------------------
## Compliance workflow (recommended)
----------------------------------------------------------------------

For each new file added, before committing:

  1. Download from a license-clear source (OpenGameArt / Freesound CC0
     filter / own composition).
  2. Confirm the upstream license text permits:
       - redistribution as part of a game binary
       - modification (trimming, looping, pitch shift)
  3. Add entry above with **source URL + author + license**.
  4. If license = CC-BY (not CC0), also note the required credit text
     you must include in this file and in the in-game Credits screen.

A short script `scripts/check_audio_credits.py` (TODO) will enforce
that every `.wav` in `assets/sfx/` has a matching entry here before
build time. Until that exists, the manual review above is required.

----------------------------------------------------------------------
## How to verify a license is OK for game distribution
----------------------------------------------------------------------

Quick checks:

  - **CC0 1.0**: ✅ free for any use, no attribution required.
    Mark License = "CC0 1.0" and you're done.

  - **CC-BY 4.0** (or 3.0): ✅ OK if you:
      1. Keep the copyright notice
      2. State the license (e.g. "CC-BY 4.0")
      3. Indicate any changes you made
      4. Provide the license URL
      5. Do NOT add additional restrictions
    → all of these go in this file and in the in-game Credits screen.

  - **CC-BY-SA** (ShareAlike): ⚠️ OK but anything you mix it with must
    also be CC-BY-SA — could force relicensing. Generally avoid.

  - **CC-BY-NC** (NonCommercial): ❌ **NOT compatible with a
    Steam-distributed game**, even free. The "non-commercial" clause
    covers any commercial distribution platform. Do not use.

  - **CC-BY-NC-ND**: ❌ Same problem as above + no derivatives.

  - **Royalty-Free but not CC0**: usually OK if the license explicitly
    grants game / commercial use. Read the terms.

  - **Unknown / "free to use" without explicit license**: ❌ Do not use.
    "Free" without a license grant is ambiguous and legally unsafe.

----------------------------------------------------------------------

Voidbound Contributors, 2026

SPDX-License-Identifier: CC-BY-NC-ND-4.0
