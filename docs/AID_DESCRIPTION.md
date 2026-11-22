---
title: "Inner Entity (Minds)"
short_description: "Autonomous character minds, private goals, secrets, and thought simulation with CSCP multi-slot coordination and card generation thought suppression (v2.8.0)"
tags: ["utility", "script", "npc", "minds", "cognition", "inner-self", "cscp"]
version: "2.8.0-IE"
---

# Inner Entity 🎭
### Autonomous Character Minds & Dynamic Cognition for AI Dungeon
**Originally created as Inner Self by LewdLeah ❤️**  
**Optimized Context prompt cache engine by XloSky**  
**Modernized and maintained by Randy Viosca ([@Random_Variable](https://play.aidungeon.com/profile/Random_Variable))**

Inner Entity brings autonomous memory, private goals, secrets, and self-reflection to story NPCs. Characters dynamically form and maintain their own thoughts, adapting their behavior naturally over long adventures.

---

### Key Capabilities
* **Segmented Character Minds:** Simulated NPCs build, reflect upon, and update their own mental models (opinions, secrets, private plans).
* **Autonomous Thought Badges (`🎭`):** Active NPCs reflect on scene events in real time, indicated by the `🎭` visual indicator.
* **Optimized Context Support:** Fully compatible with AI Dungeon's prompt caching via dynamic task cards for fast generation and token efficiency.
* **Smart Trigger Scoring:** Dialogue and narration mentions are intelligently weighted so off-scene characters do not think out of turn.
* **Cross-Slot Coordination Protocol (CSCP):** Coordinates seamlessly with upstream **Entity Cards** and **AID-Modules** in multi-slot setups. Dynamically yields card generation capabilities to avoid double-engine collisions.
* **Cross-VM Thought Suppression:** Inhibits background NPC thoughts while upstream Entity-Cards is conducting multi-turn card generation, preventing corrupted story cards.
* **Modular Engine Flavors:** Available as All-in-One Flagship (Minds + Entity Cards), Minds-Only (ideal for multi-slot pairing with standalone Entity-Cards), or Classic Auto-Cards.

---

### In-Game Commands
* `/ie -s`, `--status`, `--list` — Lists active simulated character minds and current reflections.
* `/ie -c`, `--characters` — Lists configured scenario NPCs.
* `/ie -i`, `--info`, `--diag` — Displays cognitive engine diagnostics and cache status.
* `/ie -v`, `--version` — Displays script build version, git hash, and engine flavor.
* `/ie -h`, `--help` — Displays command help and usage syntax.

---

### Configuration Cards
* **"Configure Inner Entity" Card:** Add character first names (e.g. `Molly` or `Joe`) to give them minds, configure thought frequency, and adjust simulation thresholds.

---

### Documentation & Source Code
* **GitHub Repository:** [github.com/viosca/Inner-Entity](https://github.com/viosca/Inner-Entity)
* **Cross-Slot Protocol (CSCP):** [CROSS_SLOT_PROTOCOL.md](https://github.com/viosca/Inner-Entity/blob/main/docs/CROSS_SLOT_PROTOCOL.md)
* **Dynamic Slot Management Guide:** [DYNAMIC_SLOT_MANAGEMENT_GUIDE.md](https://github.com/viosca/Inner-Entity/blob/main/docs/DYNAMIC_SLOT_MANAGEMENT_GUIDE.md)
* **Original Inner Self by LewdLeah:** [play.aidungeon.com/profile/LewdLeah](https://play.aidungeon.com/profile/LewdLeah)
