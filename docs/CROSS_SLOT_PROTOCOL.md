# AI Dungeon Multi-VM Cross-Slot Coordination Protocol

## 1. Executive Summary & Architectural Problem

In AI Dungeon **Adventure Mode**, players can attach multiple scripts to an adventure and dynamically reorder, add, or remove them at any time via the Script Manager.

### The QuickJS Isolation Model
AI Dungeon executes each script slot in a **separate, isolated QuickJS Virtual Machine (VM)** instance per lifecycle phase (`onInput`, `onModelContext`, `onOutput`):
- **`globalThis` is ephemeral and isolated:** Each slot starts with a fresh global scope on every hook execution. Globals defined in Slot 1 do **not** exist in Slot 2.
- **`state` is isolated per slot:** The backend namespaces `state` per script (`gameState.scripts[scriptShortId]`). Slot 1 cannot read or write Slot 2's `state` object.
- **Run order is mutable:** A player can drag Slot 2 above Slot 1 mid-adventure, or delete a duplicate slot on the fly.

### Shared Surface Area Across VMs
Only the turn pipeline parameters and shared story array cross VM boundaries:
1. **`text` (and `stop`):** Piped sequentially as a waterfall ($Slot_1 \to Slot_2 \to \dots \to Slot_N$).
2. **`storyCards`:** A shared mutable array of card objects passed across all slots and persisted to the adventure database across turns.
3. **`history` & `info`:** Read-only shared turn context (`info.actionCount`, `history.length`).
4. **`state.memory` & `state.message`:** Shared player-facing memory and toast buffers.

---

## 2. Protocol Overview: Dual-Channel Hybrid IPC

To prevent **Double Engine Collisions** (e.g., when a player loads both standalone `Entity-Cards` and `All-in-One Inner-Entity` in separate slots) while enabling **Modular Discovery** (e.g., `Entity-Cards` in Slot 1 + `Inner-Entity Minds-Only` in Slot 2), the protocol uses two complementary, zero-leakage channels:

1. **Channel A — `storyCards` Zero-Width Steganographic Stamp (Persistent & Order-Independent):**
   - Encodes a compact JSON telemetry payload into invisible zero-width Unicode bits (`\u200B` = `0`, `\u200C` = `1`) bounded by sentinel delimiters (`\u200D\u200C\u200D` ... `\u200D\u200B\u200D`).
   - Appended to the `keys` property of existing control cards (`Configure Auto-Cards`, `Configure Entity Cards`, or `Configure Inner Entity`).
2. **Channel B — `text` Waterfall Stream Handshakes (Turn-Scoped & Immediate):**
   - Uses zero-width token `\u200D\u200B\u200C\u200B\u200D` (`EC_INPUT_HANDSHAKE`) and structured command response prefixes (`/EC ... ->`, `/IE info ->`) in the `onInput` waterfall to coordinate diagnostic banners and command routing within a single turn.

> [!IMPORTANT]
> Because `storyCards` control cards are not triggered as story lore and zero-width characters have zero visual footprint, neither the player nor the LLM context prompt ever sees the protocol metadata.

---

## 3. UML Component & Data Architecture

```mermaid
classDiagram
    class AIDungeonHost {
        +int info_actionCount
        +Array history
        +Array~StoryCard~ storyCards
        +Map~SlotID, Object~ gameState_scripts
        +executePhase(phase, slots)
    }

    class QuickJSVM_Slot1 {
        +Object globalThis
        +Object state_slot1
        +String slotUid
        +onInput(text) String
        +onModelContext(text, stop) Array
        +onOutput(text) String
    }

    class QuickJSVM_Slot2 {
        +Object globalThis
        +Object state_slot2
        +String slotUid
        +onInput(text) String
        +onModelContext(text, stop) Array
        +onOutput(text) String
    }

    class CrossSlotStamp {
        +String t "turnKey (actionCount:historyLen)"
        +String p "phase (input | context | output)"
        +String u "slotUid (ec-xxxxxx | ie-xxxxxx)"
        +String e "engineType (ec | ie)"
        +int c "collisionFlag (0 | 1)"
        +encodeCrossSlotStamp(obj) String
        +decodeCrossSlotStamp(str) Object
    }

    class ControlStoryCard {
        +String title "Configure Auto-Cards | Configure Inner Entity"
        +String keys "Visible Keys + Zero-Width Binary Stamp"
        +String entry
        +String description
    }

    AIDungeonHost --> QuickJSVM_Slot1 : "1. Invokes with state_slot1"
    AIDungeonHost --> QuickJSVM_Slot2 : "2. Pipes text & storyCards with state_slot2"
    QuickJSVM_Slot1 ..> ControlStoryCard : "Reads / Writes Stamp in card.keys"
    QuickJSVM_Slot2 ..> ControlStoryCard : "Reads / Writes Stamp in card.keys"
    ControlStoryCard *-- CrossSlotStamp : "Steganographic payload"
    QuickJSVM_Slot1 --> QuickJSVM_Slot2 : "Pipes text waterfall (Channel B)"
```

---

## 4. Wire Format & Encoding Specification

### 4.1 Channel A: Zero-Width Binary Stamp (`storyCards[i].keys`)

Each byte of the UTF-8 JSON payload is serialized MSB-first (bits 7 down to 0) into 8 zero-width characters:

| Element | Unicode Sequence | Purpose |
| :--- | :--- | :--- |
| **`STAMP_START`** | `\u200D\u200C\u200D` (ZWJ + ZWNJ + ZWJ) | Marks start of steganographic frame |
| **Bit `0`** | `\u200B` (Zero-Width Space, ZWSP) | Binary 0 |
| **Bit `1`** | `\u200C` (Zero-Width Non-Joiner, ZWNJ) | Binary 1 |
| **`STAMP_END`** | `\u200D\u200B\u200D` (ZWJ + ZWSP + ZWJ) | Marks end of steganographic frame |

#### JSON Payload Schema
```json
{
  "t": "12:24",
  "p": "context",
  "u": "ec-8f92a1",
  "e": "ec",
  "c": 0
}
```

- **`t` (`turnKey`):** Composite key `"${info.actionCount}:${history.length}"`. Identifies the exact turn and prevents stale stamps from previous turns from triggering false collisions.
- **`p` (`phase`):** Current hook execution phase (`"input"`, `"context"`, or `"output"`).
- **`u` (`slotUid`):** Persistent per-slot identifier generated once and stored in `state._aid_slot_uid` (prefixed with `"ec-"` for standalone Entity-Cards or `"ie-"` for bundled Inner-Entity).
- **`e` (`engine`):** Engine flavor claiming primary ownership (`"ec"` or `"ie"`).
- **`c` (`collision`):** `0` when normal; `1` when a downstream slot detected another card engine during the same `turnKey` + `phase`.

### 4.2 Channel B: `text` Stream Handshakes (`onInput`)

| Token / Pattern | Value / Regex | Role |
| :--- | :--- | :--- |
| **`EC_INPUT_HANDSHAKE`** | `\u200D\u200B\u200C\u200B\u200D` | Emitted by upstream standalone EC during `onInput`, stripped by downstream IE to confirm upstream EC presence. |
| **EC Command Banner** | `/^\s*\/(?:EC\|AC)\b[^\n]*->/i` | Detected by downstream engines when upstream EC processes `/ec -i` or another command. |
| **IE Diagnostic Banner** | `/^\s*\/(?:IE\|IS)\s+info\s*->/i` | Inspected by downstream standalone EC to either inject a Double Engine Warning (if IE is `all-in-one`/`classic`) or flip `Auto-Cards Linked: No` $\to$ `Yes` (if IE is `minds-only`). |

---

## 5. UML Sequence Diagrams

### 5.1 Double Engine Collision Detection & Bypass (`onModelContext` / `onOutput`)

When a player accidentally installs two card engines in separate slots (e.g., Slot 1 Standalone `Entity-Cards` + Slot 2 `All-in-One Inner-Entity`, in **any** slot order):

```mermaid
sequenceDiagram
    autonumber
    participant Host as AI Dungeon Host
    participant S1 as Slot 1 VM (Primary Card Engine)
    participant Cards as Shared storyCards (Control Card)
    participant S2 as Slot 2 VM (Secondary Card Engine)

    Note over Host, S2: Phase: onModelContext (turnKey = "15:30")

    Host->>S1: Invoke Slot 1 onModelContext(text, stop)
    S1->>S1: Resolve slotUid = state_1._aid_slot_uid ("ec-a1b2c3")
    S1->>Cards: readCrossSlotStamp()
    Cards-->>S1: null or old turnKey ("14:28")
    S1->>S1: Clear stale state_1._aid_double_engine_detected
    S1->>Cards: writeCrossSlotStamp({t:"15:30", p:"context", u:"ec-a1b2c3", e:"ec", c:0})
    S1->>S1: Execute Entity Cards Context & NER Logic
    S1-->>Host: Return [modifiedText, stop]

    Host->>S2: Invoke Slot 2 onModelContext(modifiedText, stop)
    S2->>S2: Resolve slotUid = state_2._aid_slot_uid ("ie-d4e5f6")
    S2->>Cards: readCrossSlotStamp()
    Cards-->>S2: {t:"15:30", p:"context", u:"ec-a1b2c3", e:"ec", c:0}
    Note over S2: Stamp matches turnKey "15:30" & phase "context",<br/>but stamp.u ("ec-a1b2c3") != myUid ("ie-d4e5f6")!
    S2->>S2: Set state_2._aid_double_engine_detected = true
    S2->>Cards: writeCrossSlotStamp({t:"15:30", p:"context", u:"ec-a1b2c3", e:"ec", c:1})
    S2->>S2: Bypass embedded AutoCards execution (Minds logic still runs)
    S2-->>Host: Return [finalText, stop]
```

---

### 5.2 Diagnostic Command Handshake (`/ec -i` & `/ie -i` across VMs)

Because `/ec -i` or `/ie -i` is handled during `onInput`, the upstream slot generates the diagnostic report before it knows whether a downstream slot also has a card engine. The downstream slot intercepts the formatted output in `text` and augments it in-flight:

```mermaid
sequenceDiagram
    autonumber
    participant User as Player Input
    participant S1 as Slot 1 VM (Upstream Engine)
    participant Cards as Shared storyCards
    participant S2 as Slot 2 VM (Downstream Engine)

    User->>S1: Types "/ie -i"
    alt Slot 1 is All-in-One IE and Slot 2 is Standalone EC
        S1->>Cards: readCrossSlotStamp()
        S1->>S1: Generate "/IE info ->" diagnostic report
        S1-->>S2: Pipes text = "/IE info -> ... [all-in-one] ..."
        S2->>S2: Matches /^\s*\/(?:IE|IS)\s+info\s*->/i and /\[(all-in-one|classic)\]/i
        S2->>S2: Flag collision (state_2._aid_double_engine_detected = true)
        S2->>Cards: writeCrossSlotStamp({t: turnKey, p: "input", u: "upstream-ie", c: 1})
        S2->>S2: Append "⚠️ [DOUBLE ENGINE WARNING]" to text
        S2-->>User: Displays diagnostic report with Double Engine Warning
    else Slot 1 is Minds-Only IE and Slot 2 is Standalone EC (Intended Modular Setup)
        S1->>S1: Generate "/IE info -> ... [minds-only] ... Auto-Cards Linked: No"
        S1-->>S2: Pipes text to Slot 2
        S2->>S2: Matches /\[minds-only\]/i
        S2->>S2: Replaces "Auto-Cards Linked: No" with "Auto-Cards Linked: Yes"
        S2-->>User: Displays "Auto-Cards Linked: Yes" with ZERO collision warnings
    end
```

---

## 6. Slot Lifecycle & Collision State Machine

The state machine below models how each card engine slot transitions between **Active Primary**, **Yielded Secondary (Bypassed)**, **Modular Linked**, and **Self-Healed Single Engine** states as the player reorders or deletes scripts mid-adventure.

```mermaid
stateDiagram-v2
    [*] --> Uninitialized : VM Hook Invoked

    state "Slot Initialization" as Init {
        Uninitialized --> CheckIntraVM : Assign / Load state._aid_slot_uid
        CheckIntraVM --> BypassedIntraVM : Duplicate in same VM (AutoCards._isBypassed)
        CheckIntraVM --> ReadStamp : Isolated VM (Check storyCards Stamp)
    }

    ReadStamp --> ClaimPrimary : No stamp for (turnKey, phase) OR stamp.u == myUid
    ReadStamp --> CollisionYield : stamp.t == turnKey AND stamp.p == phase AND stamp.u != myUid

    state "Active Primary Engine" as ClaimPrimary {
        [*] --> ClearStaleFlags : Delete stale state._aid_double_engine_detected (if c == 0)
        ClearStaleFlags --> WritePrimaryStamp : Stamp {t: turnKey, p: phase, u: myUid, c: 0}
        WritePrimaryStamp --> ExecuteCardEngine : Run NER / Context / Card Generation
    }

    state "Yielded Secondary Engine (Bypassed)" as CollisionYield {
        [*] --> FlagCollision : Set state._aid_double_engine_detected = true
        FlagCollision --> WriteCollisionBit : Update Stamp {..., c: 1}
        WriteCollisionBit --> NoOpReturn : Bypass Card Engine & Warn on /ec -i or /ie -i
    }

    ClaimPrimary --> DynamicReconfig : Next Turn / Player Reorders or Removes Slot
    CollisionYield --> DynamicReconfig : Next Turn / Player Reorders or Removes Slot

    state "Dynamic Reconfiguration (Next Turn)" as DynamicReconfig {
        [*] --> ReevaluateOrder
        ReevaluateOrder --> ClaimPrimary : Duplicate removed OR moved to Slot 1
        ReevaluateOrder --> CollisionYield : Moved to downstream slot behind another engine
    }
```

---

## 7. Resilience to Live Adventure Mode Mutations

| Player Action Mid-Adventure | Protocol Behavior | Resulting State |
| :--- | :--- | :--- |
| **1. Installs Standalone EC (Slot 1) + All-in-One IE (Slot 2)** | Slot 1 stamps `(turnKey, phase, u: slot1, c: 0)`. Slot 2 sees `u != slot2`, sets `c: 1`, and bypasses its bundled card engine. | Slot 1 handles cards; Slot 2 runs character minds only. Both `/ec -i` and `/ie -i` show a helpful warning. |
| **2. Drags Slot 2 above Slot 1 (Reorders slots live)** | On the very next turn (`turnKey` increments), the new top slot (All-in-One IE) sees no stamp for the new `turnKey`, clears its bypass flag, claims Primary (`u: slotIE`), and runs. The new bottom slot (Standalone EC) sees `u: slotIE` and yields. | Seamless handoff of card engine ownership to whichever slot executes first, with zero duplicate cards created. |
| **3. Deletes duplicate slot (or replaces All-in-One with `minds-only`)** | On the next turn, only one card engine runs. It sees no competing stamp (`c: 0`), deletes `state._aid_double_engine_detected`, and resumes normal operation. | Self-healing: warnings automatically disappear from `/ec -i` and `/ie -i` on the next turn. |
| **4. Installs Standalone EC + Minds-Only IE (Any order)** | `minds-only` has no embedded `AutoCards` engine, so it never stamps or conflicts. It reads `hasExternalAutoCardsCard()` / waterfall banners to confirm linkage. | `Auto-Cards Linked: Yes`, zero collision warnings, full modular cooperation. |

---

## 8. CSCP v1.1.0 Integration & Dynamic StoryCard DLL Hydration

Starting with version 2.8.0, `Inner-Entity` natively implements the **Cross-Slot Coordination Protocol (CSCP v1.1.0)** standard. While Channel A and Channel B provide lightweight direct collision detection between card engines, CSCP establishes an ecosystem-wide capability negotiation bus across all installed AI Dungeon scripts.

### 8.1 Dynamic DLL Hydration via `loadCSCP()`

Rather than bundling redundant full client implementations, `Inner-Entity` discovers and hydrates the official CSCP client exported into `storyCards` by `aid-modules` (or peer infrastructure modules):

1. **Carrier Card Scan:** `loadCSCP()` searches `storyCards` for cards with delimiter `\u200D\uFE00\u200D` ... `\u200D\uFE0F\u200D` (preferring dedicated carrier `Configure \nSystem Modules`).
2. **16 Variation Selector Unpacking:** Decodes nibbles encoded in `\uFE00` through `\uFE0F` back into JavaScript source code.
3. **Indirect Eval Execution:** Executes via `(0, eval)(code)` to safely evaluate into `globalThis.AID_CSCP` in QuickJS / `<isolated-vm>` contexts.

### 8.2 Inner-Entity Capability Registration

`Inner-Entity` announces to CSCP both at startup (`init`) and at the head of every lifecycle hook (`InnerEntity(hook)`):

```javascript
const res = cscp.announce({
    name: "inner-entity",
    displayName: isBundled ? `Inner-Entity [${flavor}]` : "Inner-Entity [minds-only]",
    version: "2.8.0",
    buildType: isBundled ? "all-in-one" : "modular",
    provides: isBundled ? ["inner-entity", "entity-cards"] : ["inner-entity"],
    prefix: "/ie",
    aliases: ["/is"],
    commands: isBundled ? ["/ie", "/is", "/ec", "/ac"] : ["/ie", "/is"],
    description: "Character mind simulation, monologues, and personality tracking",
    helpSummary: "NPC mind simulation, internal monologues, and cognitive state"
}, { phase: hookPhase, slotUid: myUid });
```

### 8.3 Automated Capability Yielding

- **Standalone Minds-Only:** Declares `provides: ["inner-entity"]`. Never collides with upstream or downstream card engines (`Entity-Cards`), ensuring guaranteed 0-collision coexistence.
- **Flagship All-in-One:** Declares `provides: ["inner-entity", "entity-cards"]`.
  - When running as sole card engine: Claims ownership of both capabilities.
  - When standalone `Entity-Cards` runs in an upstream slot: `res.yielded` contains `"entity-cards"`. `Inner-Entity` sets `_AID_DOUBLE_ENGINE_DETECTED = true`, bypasses its bundled card engine (`getAutoCards()._isBypassed = true`), but keeps **100% active character mind simulation**.
  - When running upstream of standalone `Entity-Cards`: Standalone `Entity-Cards` detects that `inner-entity` already owns `"entity-cards"` and yields cleanly.
- **Unified `/help` Directory:** Upstream routers (such as `aid-getopt`) automatically aggregate `/ie`, `/is`, `/ec`, and `/aid-modules` into a single, cohesive command directory for the player.

### 8.4 Cross-Slot Task Synchronization & Thought Suppression

During active card generation or memory compression (whether single-turn or multi-turn continuation):
1. **Thought Task Suppression:** `Entity-Cards` clears the trigger keys and entry of `Inner-Entity`'s thought task card (`🧠 Inner Entity Task — do not edit`) to ensure that NPC thoughts are not requested from the model while an entity is being generated.
2. **Event Stamping (`[AC_EVENT_ACTIVE]`):** `Entity-Cards` stamps `[AC_EVENT_ACTIVE]` into shared `storyCards` (on `🗂️ Auto-Cards Task — do not edit`).
3. **VM Coordination:** When `Inner-Entity` runs its `onModelContext` and `onOutput` hooks in its own isolated VM, `isExternalACEventActive()` inspects `storyCards` for the active event stamp and suppresses NPC thought generation and output replacements for that turn.
4. **Clean Narration Continuity:** Character monologue and narrative story prose are cleanly prevented from bleeding into `Continue` clicks during multi-turn YAML construction until the card reaches 100% completion.

