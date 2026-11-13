# Inner Entity Ecosystem: Configuration Matrix & Architecture Guide 🧭

This document provides a comprehensive guide to the builds, deployment topologies, dependencies, and configuration options across **Inner Entity (IE)**, **Entity Cards (EC)**, **Auto-Cards (AC)**, and **AID-Getopt**.

---

## 1. Component Glossary

* **IE (Inner Entity / Inner Self):** Simulates autonomous non-player character (NPC) minds, personal goals, secrets, internal monologues, and reflection badges (`🎭`).
* **EC (Entity Cards):** Automated Named Entity Recognition (NER) engine generating structured, token-calibrated YAML/Lorebook cards for People (with MBTI profiles), Locations, Organizations, Things, and Events.
* **AC (Auto-Cards):** LewdLeah’s original, lightweight prose-based story card generator that synthesizes narrative summary paragraphs based on keyword appearance.
* **AID-Getopt:** POSIX/GNU command-line parser (`-s`, `-v`, `--help`) with an input unwrap engine for 3rd-person roleplay, authoring preambles, and action wrappers.
* **AID-Modules (AMS):** Cross-slot discovery and lifecycle registry for AI Dungeon scripts, exposing `/aid-modules`.

---

## 2. Builds & Distributions Matrix

| Build / Artifact | Bundled Components | Footprint | Primary Target Slot | Embedded Getopt? | Best For |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`inner-entity.js`**<br>*(Flagship All-in-One)* | **IE + EC**<br>*(Minds + NER Cards)* | ~550 KB<br>(~11,000 lines) | Single Slot (Slot 0 or 1) | **Yes**<br>*(Embedded in EC & IE)* | **All-in-one convenience.** Players wanting living NPC minds and structured lorebook cards in a single script slot without managing multi-slot dependencies. |
| **`inner-self-minds-only.js`**<br>*(Minds-Only / Plain)* | **IE Only**<br>*(Pure Cognition)* | ~150 KB<br>(~3,000 lines) | Slot 2 (Modular)<br>or Single Slot | **Yes**<br>*(Embedded in Core)* | **Thinkers only or modular setups.** Players who only want character thoughts and zero card generation, OR who pair it with a separate card engine in Slot 1. |
| **`inner-self-classic.js`**<br>*(Inner Self Classic)* | **IE + Classic AC**<br>*(Minds + Prose Cards)* | ~220 KB<br>(~4,500 lines) | Single Slot | **Yes**<br>*(Embedded in Core)* | **Vintage narrative play.** Character minds paired with LewdLeah’s classic paragraph card generation instead of YAML/NER schemas. |
| **`Entity-Cards/src/library.js`**<br>*(Entity Cards Standalone)* | **EC + AC Modes**<br>*(NER + Prose Cards)* | ~400 KB<br>(~8,000 lines) | Slot 1 (Modular)<br>or Single Slot | **Yes**<br>*(Embedded `getoptLong`)* | **Dedicated lore tracking.** Worldbuilding and entity logging without NPC thought simulation. Switchable between NER and Classic modes via config card. |
| **`Auto-Cards v1.1.3`**<br>*(Classic Upstream)* | **Classic AC Only**<br>*(Prose Paragraphs)* | ~75 KB<br>(~1,500 lines) | Single Slot or Slot 1 | **No**<br>*(Regex only)* | **Ultra-lightweight play.** Minimalist prose card generator with minimal QuickJS memory footprint. |
| **`library-sandbox.js`**<br>*(AID-Getopt Router)* | **Getopts + AMS + Output Sandbox** | ~65 KB<br>(~1,300 lines) | **Slot 0**<br>*(Master Router)* | **Native**<br>*(Full Engine)* | **Master utility.** Unwraps 3rd-person text/actions across all scripts and traps command output so menus/manuals don't consume AI generation tokens. |

---

## 3. Topologies & Top-Level Architectures

### Topology A: The Single-Slot "All-in-One" Powerhouse
A single script slot containing `dist/inner-entity.js`.

```mermaid
flowchart TD
    Player["Player Action / Prompt"] --> Slot0["Slot 0: Inner Entity (Flagship All-in-One)"]
    Slot0 --> Minds["Character Minds & Thoughts (IE)"]
    Slot0 --> NER["Named Entity Recognition & Story Cards (EC)"]
    Slot0 --> Cards["Story Cards List"]
```

* **Pros:**
  * Maximum convenience: 1 script slot to install, update, or disable.
  * Generates both `Configure Inner Self` and `Configure Auto-Cards` automatically.
  * Zero cross-slot script coordination required.
* **Cons:**
  * Largest script footprint (~11,000 lines).
  * Updating card logic requires re-pasting or re-attaching the entire bundle.
  * In-game command output (e.g. `/ie help`) is processed within normal game text unless intercepted by an upstream router.
* **Dependencies:**
  * None. Completely self-contained with embedded getopt and card engine.

---

### Topology B: The Modular Multi-Slot Trio (Pro Setup)
Three dedicated slots working together sequentially down the AI Dungeon waterfall.

```mermaid
flowchart TD
    Player["Player Action / Prompt"] --> S0["Slot 0: AID-Getopt Router (Master CLI & Sandbox)"]
    S0 -->|"Clean unwrapped input"| S1["Slot 1: Entity Cards (NER & Story Cards)"]
    S1 -->|"globalThis.AutoCards available"| S2["Slot 2: Inner Entity (Minds-Only)"]
    S2 -->|"Calls getAutoCards()"| S1
```

* **Slot 0:** `AID-Getopt Router` (Scenario: `Ka2D5sBoDFnn`)
* **Slot 1:** `Entity Cards (NER)` (Scenario: `05_w3s9zrrvt`)
* **Slot 2:** `Inner Entity (Minds)` (Scenario: `bL_qS9DsI5wI`)

* **Pros:**
  * **Zero LLM token waste:** Slot 0 traps commands (`/aid-getopt`, `/aid-modules`, etc.) and renders menus via `state.message`, preventing AI model generation from firing.
  * **Universal 3rd-person support:** Slot 0 unwraps author tags (`[AI, polish...] Author as Jonathon /ie -s`) and character action prefixes (`> Jonathon /ec -s`) before downstream scripts receive the input.
  * **Independent upgradability:** You can upgrade or tune Entity Cards without touching character mind simulation, or vice-versa.
  * **Cross-script discovery:** `/aid-modules` in Slot 0 tracks all attached scripts via `state._aid_modules`.
* **Cons:**
  * Requires managing three script slots in the adventure's Script Manager.
* **Dependencies:**
  * Slot 2 calls Slot 1 via `globalThis.AutoCards`.
  * Downstream scripts sync metadata to `state._aid_modules` for Slot 0 discovery.

---

### Topology C: The "Thinkers Only" Setup
A single script slot containing `dist/inner-self-minds-only.js`.

* **Pros:**
  * Ultra-lightweight character cognition engine (~3,000 lines).
  * NPCs have inner thoughts, private goals, secrets, and reflection badges (`🎭`).
  * Leaves the player's Story Cards list 100% clean—no automatic lore or entity cards are created.
* **Cons:**
  * No automated world lore or NPC background card generation.
* **Dependencies:**
  * None. Standalone with embedded getopt parser in core.

---

### Topology D: The "Worldbuilders Only" Setup
A single script slot containing `Entity-Cards/src/library.js`.

* **Pros:**
  * Complete Named Entity Recognition (People, Locations, Factions, Items, Events).
  * Generates structured YAML/Lorebook cards and MBTI profiles automatically.
  * Supports toggling between NER mode and Classic Auto-Cards prose mode.
* **Cons:**
  * Characters do not simulate inner thoughts, private goals, or reflection badges.
* **Dependencies:**
  * None. Completely self-contained with embedded `getoptLong`.

---

## 4. Getopt Dependencies: Embedded vs. External

### Does IE (Minds-Only) or the All-in-One Bundle need an Embedded Getopt?

**Yes.** Here is why:

1. **Standalone Resilience:**
   If a user plays with `inner-self-minds-only.js` or `inner-entity.js` without `AID-Getopt Router` in Slot 0, any player command typed in 3rd-person mode (e.g. `> Jonathon /ie -s`) or with authoring preambles (`[AI, polish...] Author as Jonathon /ie -s`) would fail to match if relying solely on basic regex.
   
2. **Hard vs. Soft Dependencies:**
   * **Hard Dependency (Avoided):** Requiring `AID-Getopt` in Slot 0 to run at all. If the router were absent, commands would crash or silently fail.
   * **Soft Dependency / Progressive Enhancement (Implemented):**
     * `src/core.js` embeds a compact tokenizer, `unwrapCommandInput()` helper, and POSIX/GNU flag parser directly in the script.
     * When running standalone, `/ie` commands parse cleanly with full 3rd-person, author mode, and quote handling.
     * When `AID-Getopt Router` is present in Slot 0, `core.js` detects `globalThis.AIDGetopt` and delegates command output trapping to the master sandbox to save context tokens.

---

## 5. Cross-Script Waterfall Mechanics

In AI Dungeon, each turn executes scripts sequentially within the **same QuickJS JavaScript runtime context**:

```
Hook: onInput
  Slot 0: AID-Getopt Router (normalizes command, unwraps text)
    ↓
  Slot 1: Entity Cards (initializes globalThis.AutoCards)
    ↓
  Slot 2: Inner Entity (reads globalThis.AutoCards, calls getAutoCards())
```

### Key Execution Rules:
1. **Downstream CAN call Upstream (Slot 2 $\rightarrow$ Slot 1):**
   Because Slot 1 executes before Slot 2, any objects attached to `globalThis` by Slot 1 (`globalThis.AutoCards`, `globalThis.EntityCards`) are already in memory when Slot 2 executes. Slot 2 can call Slot 1 JS functions directly.
2. **Upstream CANNOT call Downstream (Slot 0 $\rightarrow$ Slot 2 in the same turn):**
   When Slot 0 executes, Slot 1 and Slot 2 have not run yet for that turn.
3. **`globalThis` vs. `state` Persistence:**
   * `globalThis` is completely reset on every turn by QuickJS.
   * `state` is the **only** object serialized and persisted across turns in the database.
   * To allow Slot 0's `/aid-modules` command to discover Slot 1 and Slot 2, downstream modules register their manifest into `state._aid_modules`. Slot 0 reads `state._aid_modules` on subsequent turns, achieving full two-way discovery across the ecosystem.
