# Inner Entity Testing Sandbox 🎭📇

An interactive live testbed for **Inner Entity** — giving characters minds of their own while dynamically building living world lore.

Originally created as **Inner Self** by **LewdLeah** ❤️  
Optimized Context prompt cache engine by **XloSky**  
Extended with **Entity Cards (NER)** and maintained by **Randy Viosca** ([@Random_Variable](https://play.aidungeon.com/profile/Random_Variable))

---

## What is Inner Entity?

Inner Entity unifies two powerful AI Dungeon systems into a single seamless experience:

* **Inner Self (Character Cognition):** Simulated NPCs maintain private thoughts, secrets, goals, and shifting opinions about you and the world. When present in the scene, they autonomously reflect on what just happened, indicated by a `🎭` thought badge.
* **Entity Cards (World-Building NER):** The engine dynamically detects plot-significant people, places, factions, relics, and events, compiling them into token-dense YAML story cards with 4-letter **MBTI** profiles and character archetypes.
* **Optimized Context Ready:** Fully compatible with AI Dungeon's prompt caching via dynamic task cards.

---

## How to Play in This Sandbox

### 1. Give an NPC a Mind
Open the **"Configure Inner Entity"** story card notes. At the bottom, add the first name of any character in your story (e.g. `Molly` or `Joe`). Whenever they are mentioned in narration or dialogue, they will begin forming their own private mental reflections!

### 2. Generate Structured Lore Cards
Type an `/ec` command into the input bar for any person, place, or faction:
* `/ec Molly Millions -p` *(or `/ec -p Molly Millions`)*
* `/ec Neo-Tokyo -loc`
* `/ec -org Arasaka Corporation`
* `/ec Excalibur -item`

### 3. Roleplay and Watch Them React
Interact naturally in Do, Say, or Story mode. NPCs will remember past interactions, act on their secret motivations, and adapt their behavior over time.

---

## Testing Different Modes in This Sandbox

You don't need separate scenarios to test individual features! You can isolate any mode directly using the in-game configuration cards:

* **Full Inner Entity (Default):** NPC brains and Entity Cards active together.
* **Minds Only:** In the *Configure Inner Entity* card, set `> Install Entity Cards / Auto-Cards: false`.
* **Entity Cards Only:** In the *Configure Inner Entity* card, set `> Is Inner Self enabled by default: false` (or leave the character list empty).
* **Classic Auto-Cards:** In the *Configure Auto-Cards* card, set `> Operating Mode: Classic Auto-Cards` for LewdLeah's classic prose lore.

---

## Tips for Testers & Creators

* **Response Length Slider:** Setting your **Response Length** slider to **250+ tokens** (in Gameplay Settings) allows entity cards to finish generating in a single turn.
* **Director Mode:** Open the flame menu (Gameplay Settings) and change your character name to "Author" to freely direct the scene without locking yourself into an in-game avatar.
* **Instant Type Pruning:** Adding `-<type>` (like `-p` for Person or `-loc` for Location) reduces prompt overhead by ~80% and eliminates schema confusion.
* **Instant System Diagnostics:** Type `/ec info` (or `/ec diag`) at any time to output a full diagnostic report of your story model, prompt cache status, script versions, and card counts.

---

## Full Documentation & Source Code

For the complete creator guide, scenario installation instructions, and technical documentation:
* **Inner Entity GitHub:** [github.com/viosca/Inner-Entity](https://github.com/viosca/Inner-Entity)
* **Entity Cards GitHub:** [github.com/viosca/Entity-Cards](https://github.com/viosca/Entity-Cards)
* **Original Inner Self & Auto-Cards by LewdLeah:** [play.aidungeon.com/profile/LewdLeah](https://play.aidungeon.com/profile/LewdLeah)

*Note: Prompts and cognitive models in this sandbox are actively being benchmarked and refined. Feel free to tweak configuration cards, experiment, and enjoy!*
