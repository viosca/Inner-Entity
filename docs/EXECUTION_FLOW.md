# Modular Ecosystem Execution Flow & Lifecycle Guide 🔄

This document details the turn lifecycle, state transitions, and execution waterfall across the 4-slot modular architecture in AI Dungeon:

```
Slot 0: AID-Modules (jHwEbn7_bYGC)
  ↓
Slot 1: AID-Getopt (Ka2D5sBoDFnn)
  ↓
Slot 2: Entity-Cards (05_w3s9zrrvt)
  ↓
Slot 3: Inner-Entity (bL_qS9DsI5wI)
```

By breaking each execution phase into its own dedicated diagram, the decision branches, edge conditionals, and cross-slot handoffs can be clearly traced.

---

## 1. High-Level Turn Lifecycle

AI Dungeon executes scripts in four sequential phases per turn:

```mermaid
stateDiagram-v2
    [*] --> Idle : Adventure Initialized

    state "Phase 1: Input Hook" as InputPhase {
        Idle --> InputRouting : Player Action (Do / Say / Story / Author)
        InputRouting --> CommandTrapped : [Slash command matched]
        InputRouting --> StoryInputAccepted : [Standard story prose]
    }

    state "Phase 2: Context Hook" as ContextPhase {
        StoryInputAccepted --> ContextAssembly : Build model context
        ContextAssembly --> EntityTaskPrimed : [Entity detected & cooldown met]
        ContextAssembly --> ThoughtTaskPrimed : [NPC trigger >= threshold]
        EntityTaskPrimed --> PromptReady
        ThoughtTaskPrimed --> PromptReady
        ContextAssembly --> PromptReady : [No tasks active]
    }

    state "Phase 3: Model Inference" as InferencePhase {
        PromptReady --> LLM_Inference : Send context to story model
        LLM_Inference --> RawOutputReceived : Completion returned
    }

    state "Phase 4: Output Hook" as OutputPhase {
        RawOutputReceived --> LoreCardParsing : Extract YAML lore cards
        LoreCardParsing --> BrainCardParsing : Extract NPC internal monologues
        BrainCardParsing --> StoryRendered : Narration & badges prepared
    }

    CommandTrapped --> CommandDelivered : [Skip inference to save tokens]
    StoryRendered --> Idle : Output displayed to player
    CommandDelivered --> Idle : Diagnostics / manual displayed
```

---

## 2. Phase 1: Input Hook & Slash Command Routing

In Phase 1, each slot inspects the raw player input. If an input matches a slash command, it is unwrapped (stripping 3rd-person character names and author tags), parsed, written to `state.message`, and flagged with `state._aid_system_command = true` so the AI model is not invoked.

```mermaid
flowchart TD
    Start(["Player submits input (Do / Say / Story / Author Mode)"]) --> S0_Input["Slot 0: AID-Modules"]

    %% SLOT 0
    S0_Input --> CheckMod{"Input matches /aid-modules or /ams?"}
    CheckMod -- "Yes" --> ExecMod["Read state._aid_modules manifest<br/>Format installed modules, versions & git commits<br/>Write table to state.message"]
    ExecMod --> SetFlag["Set state._aid_system_command = true"]

    CheckMod -- "No" --> S0_Sync["Sync manifest to state._aid_modules"]
    S0_Sync --> S1_Input["Slot 1: AID-Getopt"]

    %% SLOT 1
    S1_Input --> CheckGetopt{"Input matches /aid-getopt or /aid-getopts?"}
    CheckGetopt -- "Yes" --> ExecGetopt["unwrapCommandInput() strips 3rd person & author tags<br/>Parse sub-flags: --diag, --test, --version, --help<br/>Write manual or test results to state.message"]
    ExecGetopt --> SetFlag

    CheckGetopt -- "No" --> S1_Init["Initialize globalThis.AIDGetopt"]
    S1_Init --> S2_Input["Slot 2: Entity-Cards (NER)"]

    %% SLOT 2
    S2_Input --> CheckEC{"Input matches /ec or /ac?"}
    CheckEC -- "Yes" --> ExecEC["getoptLong parses flags: -P, -v, -i, -h, or title<br/>Execute card command or switch preset<br/>Write confirmation to state.message"]
    ExecEC --> SetFlag

    CheckEC -- "No" --> S2_Init["Expose globalThis.AutoCards & globalThis.EntityCards"]
    S2_Init --> S3_Input["Slot 3: Inner-Entity (Minds)"]

    %% SLOT 3
    S3_Input --> CheckIE{"Input matches /ie or /is?"}
    CheckIE -- "Yes" --> ExecIE["AIDGetopt unwraps 3rd person & author tags<br/>Parse flags: -s, -i, -c, -v, -h<br/>Verify hasAutoCards() is true from Slot 2<br/>Write cognition diagnostics to state.message"]
    ExecIE --> SetFlag

    CheckIE -- "No" --> S3_Normal["Normalize whitespace & punctuation"]
    
    %% EXIT
    SetFlag --> ShortCircuit["Trap Turn: Suppress Model Inference<br/>(Zero token waste)"]
    S3_Normal --> NextPhase["Proceed to Phase 2 (Context Hook)"]
```

---

## 3. Phase 2: Context Hook & Task Injection

When normal story input is received, Phase 2 builds the context window sent to the AI story model. Slots 2 and 3 scan the narrative text to determine whether an entity card or an NPC thought should be generated.

```mermaid
flowchart TD
    StartContext["Enter Context Hook Waterfall"] --> S0_S1["Slots 0 & 1: Passthrough"]
    S0_S1 --> S2_Context["Slot 2: Entity-Cards (NER)"]

    %% SLOT 2
    S2_Context --> CheckECCooldown{"Turns since last card >= cooldown (e.g. 28)<br/>AND new entity recognized in recent story?"}
    CheckECCooldown -- "Yes" --> EC_Inject["Prime YAML entity generation task (%@GEN@%)<br/>Select schema template (Standard / Lite / Authoring)<br/>Append schema lead-in to context prompt"]
    CheckECCooldown -- "No" --> EC_Pass["Pass story context unchanged"]

    EC_Inject --> S3_Context["Slot 3: Inner-Entity (Minds)"]
    EC_Pass --> S3_Context

    %% SLOT 3
    S3_Context --> CheckMindTrigger{"NPC trigger score >= threshold?<br/>(Narration mentions weighted 3:1 over dialogue)"}
    
    CheckMindTrigger -- "Yes" --> CheckSlot2Link{"hasAutoCards() is true?<br/>(Slot 2 loaded upstream)"}
    
    CheckSlot2Link -- "Yes: Slot 2 present" --> CallSlot2["Call Slot 2 getAutoCards()('context', text, stop)<br/>Notify Card Engine of active character reflection"]
    CheckSlot2Link -- "No: Standalone" --> SimStandalone["Run cognitive loop independently"]
    
    CallSlot2 --> IE_InjectThought["Format NPC thought prompt / task card<br/>Inject personality, goals & private secrets<br/>Request internal monologue from model"]
    SimStandalone --> IE_InjectThought

    CheckMindTrigger -- "No" --> IE_Pass["Preserve story context unchanged"]

    IE_InjectThought --> ContextReady(["Context Ready for Inference"])
    IE_Pass --> ContextReady
```

---

## 4. Phase 3: Model Inference & Sandboxing

Phase 3 handles the handoff between scripted system commands and AI model generation:

```mermaid
flowchart TD
    ContextReady["Context / Command Output Ready"] --> CheckSysFlag{"state._aid_system_command === true?"}

    CheckSysFlag -- "Yes: Command Active" --> SuppressModel["Bypass Model Generation<br/>• Model inference is halted<br/>• LLM context tokens are preserved<br/>• Zero AI generation quota consumed"]
    SuppressModel --> DeliverCommand["Extract response from state.message"]

    CheckSysFlag -- "No: Normal Turn" --> SendToModel["Send assembled context to story model<br/>(DeepSeek / Gemma / Wayfarer / Muse)"]
    SendToModel --> ModelInference["Model generates continuation, YAML entity card, or NPC thought"]

    DeliverCommand --> OutputPhase(["Enter Phase 4 (Output Hook)"])
    ModelInference --> OutputPhase
```

---

## 5. Phase 4: Output Hook & Card Persistence

In Phase 4, the model's raw completion is intercepted. If an entity card or character thought was generated, it is parsed, stored in the player's Story Cards list, and cleaned from the story text.

```mermaid
flowchart TD
    StartOutput["Enter Output Hook Waterfall"] --> S0_S1["Slots 0 & 1: Output Passthrough"]
    S0_S1 --> S2_Output["Slot 2: Entity-Cards (NER)"]

    %% SLOT 2
    S2_Output --> CheckECGen{"Was an entity card generated this turn?<br/>(Contains %@GEN@% or YAML sentinel)"}
    CheckECGen -- "Yes" --> ParseYAML["Extract YAML entity payload<br/>Create or update Story Card (Person, Place, Org, etc.)<br/>Strip task delimiters and sentinels from story narration"]
    CheckECGen -- "No" --> EC_OutPass["Pass story text unchanged"]

    ParseYAML --> S3_Output["Slot 3: Inner-Entity (Minds)"]
    EC_OutPass --> S3_Output

    %% SLOT 3
    S3_Output --> CheckIEGen{"Was an NPC thought simulated this turn?<br/>(Contains internal monologue delimiters)"}
    CheckIEGen -- "Yes" --> ParseBrain["Extract internal monologue & goal adjustments<br/>Update NPC brain story card notes<br/>Append reflection badge (🎭) to story text"]
    CheckIEGen -- "No" --> IE_OutPass["Format story spacing (prespace continue/story)"]

    ParseBrain --> CheckSysOut{"state._aid_system_command === true?"}
    IE_OutPass --> CheckSysOut

    %% DELIVER
    CheckSysOut -- "Yes" --> ShowCmd["Display formatted command menu / diagnostics to player"]
    CheckSysOut -- "No" --> ShowStory["Display updated story narration & reflection badges to player"]

    ShowCmd --> EndTurn(["Turn Complete"])
    ShowStory --> EndTurn
```

---

## 6. Summary of Cross-Slot State & Globals

| Variable | Scope | Set By | Read By | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| **`state._aid_modules`** | Persistent (`state`) | Slots 0, 1, 2, 3 | Slot 0 (`aid-modules`) | Cross-turn module discovery registry, tracking names, versions, and git commits. |
| **`state._aid_system_command`** | Turn-only (`state`) | Any matching slot | Phase 3 Sandbox & Phase 4 | Signals that a slash command was processed, halting LLM generation to save tokens. |
| **`state.message`** | Turn-only (`state`) | Any matching slot | Player UI | In-game notification banner used to display manuals and diagnostics. |
| **`globalThis.AIDGetopt`** | Turn-only (`globalThis`) | Slot 1 (`aid-getopt`) | Slots 2 & 3 | Standard POSIX/GNU flag parser and `unwrapCommandInput()` helper. |
| **`globalThis.AutoCards`** | Turn-only (`globalThis`) | Slot 2 (`Entity-Cards`) | Slot 3 (`Inner-Entity`) | Exposes the card engine API so Slot 3 can trigger entity generation via `getAutoCards()`. |
| **`hasAutoCards()`** | Function | Slot 3 (`Inner-Entity`) | Slot 3 (`Inner-Entity`) | Dynamic check (`typeof globalThis.AutoCards === "function"`) verifying Slot 2 is present. |
