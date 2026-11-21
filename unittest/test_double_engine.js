#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT_DIR = path.resolve(__dirname, "..");
const EC_SIBLING_PATH = path.join(ROOT_DIR, "..", "Entity-Cards", "src", "library.js");
const EC_SUBMODULE_PATH = path.join(ROOT_DIR, "submodules", "Entity-Cards", "src", "library.js");
const EC_LIB_PATH = fs.existsSync(EC_SIBLING_PATH) ? EC_SIBLING_PATH : EC_SUBMODULE_PATH;
const IE_ALL_IN_ONE_PATH = path.join(ROOT_DIR, "dist", "inner-entity.js");
const IE_MINDS_PATH = path.join(ROOT_DIR, "dist", "inner-self-minds-only.js");
const IE_CLASSIC_PATH = path.join(ROOT_DIR, "dist", "inner-self-classic.js");

console.log("==================================================================");
console.log("  TEST SUITE: Inner Entity Double Engine & Collision Guard");
console.log("==================================================================");

function createMockAIDContext(initialCards = []) {
    const cards = [...initialCards];
    const logged = [];
    const sandbox = {
        log: (...args) => {
            logged.push(args.join(" "));
            console.log("   [AID LOG]:", ...args);
        },
        console: { log: (...args) => console.log("   [CONSOLE]:", ...args), error: console.error },
        Math, String, Array, Object, Number, RegExp, Set, Map, JSON,
        parseInt, parseFloat, isNaN, isFinite, Date,
        text: "",
        stop: false,
        history: [
            { text: "Karane said, \"Hakari's probably in the classroom.\"", type: "say" },
            { text: "Hakari stepped into the room and greeted Karane.", type: "story" }
        ],
        storyCards: cards,
        info: {
            maxChars: 64000,
            actionCount: 2,
            useCacheEfficient: false,
            storyModel: { name: "DeepSeek", version: "v3" }
        },
        state: {},
        addStoryCard(...args) {
            let card = (args.length === 1)
                ? { title: args[0], entry: "", keys: "", type: "class", description: "" }
                : { keys: args[0], entry: args[1], type: args[2], title: args[3], description: args[4] };
            cards.push(card);
            return card;
        },
        removeStoryCard(index) {
            cards.splice(index, 1);
        }
    };
    sandbox.globalThis = sandbox;
    return { sandbox, ctx: vm.createContext(sandbox), logged, cards };
}

const ecCode = fs.readFileSync(EC_LIB_PATH, "utf8");
const ieAllCode = fs.readFileSync(IE_ALL_IN_ONE_PATH, "utf8");
const ieMindsCode = fs.readFileSync(IE_MINDS_PATH, "utf8");
const ieClassicCode = fs.readFileSync(IE_CLASSIC_PATH, "utf8");

const initialIEConfigCard = {
    type: "class",
    title: "Configure \nInner Entity",
    keys: "qm`x/`hetofdno/bnl.qsnghmd.MdveMd`i".replace(/./g, c => String.fromCharCode(c.charCodeAt()^1)),
    entry: `> Inner Entity grants story characters persistent minds.
> Enable Inner Self: true
> Predetermined player character name: Player
> Adventure PoV: 2
> Thought chance: 100
> Half thought chance: false
> Look back distance: 5
> Brain size percent: 30
> Visual indicator: 🎭
> Brain card notes format: human
> Task output debug mode: false
> Pin this config card: false
> Install Entity Cards / Auto-Cards: true
> Character names:`,
    description: `Hakari\nKarane`
};

// ----------------------------------------------------------------------------
// Test 1: Slot 1 Standalone EC + Slot 2 All-in-One Inner-Entity
// ----------------------------------------------------------------------------
{
    const { sandbox, ctx, cards } = createMockAIDContext([{ ...initialIEConfigCard }]);

    // Slot 1: Standalone Entity-Cards
    vm.runInContext(ecCode, ctx);
    const slot1EC = sandbox.AutoCards;
    assert.strictEqual(typeof slot1EC, "function");
    assert.strictEqual(sandbox._AID_STANDALONE_EC, true);
    assert.strictEqual(Boolean(sandbox._AID_DOUBLE_ENGINE_DETECTED), false);

    // Initial context run for Slot 1 creates Auto-Cards config card
    sandbox.AutoCards("context", "A peaceful afternoon in the park.", false);
    const acCardsSlot1 = cards.filter(c => c.title && c.title.includes("Auto-Cards"));
    assert.strictEqual(acCardsSlot1.length, 1, "Slot 1 should create exactly 1 Auto-Cards config card");

    // Slot 2: Flagship All-in-One Inner-Entity loaded in downstream slot
    vm.runInContext(ieAllCode, ctx);

    // Assert collision detected
    assert.strictEqual(sandbox._AID_DOUBLE_ENGINE_DETECTED, true, "globalThis._AID_DOUBLE_ENGINE_DETECTED must be true");
    assert.strictEqual(sandbox.state._aid_double_engine_detected, true, "state._aid_double_engine_detected must be true");

    // globalThis.AutoCards must remain Slot 1's instance
    assert.strictEqual(sandbox.AutoCards, slot1EC, "globalThis.AutoCards must remain Slot 1's active engine");

    // Slot 2 /ie -i diagnostics must include double engine warning
    sandbox.text = "/ie -i";
    sandbox.InnerEntity("input");
    assert.strictEqual(sandbox.text, "/ie -i", "Input prompt must be preserved");
    sandbox.text = "";
    sandbox.InnerEntity("output");
    const ieInfoOut = sandbox.text;
    assert(ieInfoOut.includes("⚠️ [DOUBLE ENGINE WARNING]"), "/ie -i must display double engine warning block");
    assert(ieInfoOut.includes("Duplicate card engine automatically bypassed"), "/ie -i must explain bypass");

    // Slot 1 /ec -i diagnostics must include double engine warning
    const ecPromptIn = sandbox.AutoCards("input", "/ec -i");
    assert.strictEqual(ecPromptIn.replace(/\u200D\u200B\u200C\u200B\u200D/g, ""), "/ec -i", "Input prompt must be preserved");
    const ecInfoOut = sandbox.AutoCards("output", "");
    assert(ecInfoOut.includes("⚠️ [DOUBLE ENGINE DETECTED]"), "/ec -i must display double engine warning block");
    assert(ecInfoOut.includes("Only ONE card engine is active"), "/ec -i must explain only one engine is active");

    // Downstream InnerEntity context execution does NOT duplicate card calls or card configs
    sandbox.text = "Hakari said, 'Let us go.'";
    sandbox.InnerEntity("context");
    const acCardsSlot2 = cards.filter(c => c.title && c.title.includes("Auto-Cards"));
    assert.strictEqual(acCardsSlot2.length, 1, "Must NOT create duplicate Auto-Cards config card");

    console.log("   ✔ Test 1 passed: Slot 1 Standalone EC + Slot 2 All-in-One IE cleanly detected & protected");
}

// ----------------------------------------------------------------------------
// Test 2: Slot 1 All-in-One Inner-Entity + Slot 2 Standalone EC (Reverse Order)
// ----------------------------------------------------------------------------
{
    const { sandbox, ctx, cards } = createMockAIDContext([{ ...initialIEConfigCard }]);

    // Slot 1: All-in-One Flagship Inner-Entity
    vm.runInContext(ieAllCode, ctx);
    const slot1BundledEC = sandbox.AutoCards;
    assert.strictEqual(typeof slot1BundledEC, "function");
    assert.strictEqual(sandbox._AID_BUNDLED_EC, true);

    sandbox.InnerEntity("context");
    const acCardsSlot1 = cards.filter(c => c.title && c.title.includes("Auto-Cards"));
    assert.strictEqual(acCardsSlot1.length, 1);

    // Slot 2: Standalone Entity-Cards loads downstream
    vm.runInContext(ecCode, ctx);

    // Assert collision detected
    assert.strictEqual(sandbox._AID_DOUBLE_ENGINE_DETECTED, true);
    assert.strictEqual(sandbox.state._aid_double_engine_detected, true);
    assert.strictEqual(sandbox.AutoCards, slot1BundledEC, "globalThis.AutoCards must remain Slot 1's bundled engine");

    // Warnings present in both commands
    sandbox.text = "/ie -i";
    sandbox.InnerEntity("input");
    sandbox.text = "";
    sandbox.InnerEntity("output");
    assert(sandbox.text.includes("⚠️ [DOUBLE ENGINE WARNING]"));

    sandbox.AutoCards("input", "/ec -i");
    const ecOut = sandbox.AutoCards("output", "");
    assert(ecOut.includes("⚠️ [DOUBLE ENGINE DETECTED]"));

    // No duplicate config cards
    const acCardsSlot2 = cards.filter(c => c.title && c.title.includes("Auto-Cards"));
    assert.strictEqual(acCardsSlot2.length, 1, "Must NOT duplicate Auto-Cards config card");

    console.log("   ✔ Test 2 passed: Reverse order (Slot 1 All-in-One + Slot 2 Standalone EC) safely handled");
}

// ----------------------------------------------------------------------------
// Test 3: Intended Modular Setup (Slot 1 Standalone EC + Slot 2 Minds-Only)
// ----------------------------------------------------------------------------
{
    const { sandbox, ctx, cards } = createMockAIDContext([{ ...initialIEConfigCard }]);

    // Slot 1: Standalone Entity-Cards
    vm.runInContext(ecCode, ctx);
    assert.strictEqual(sandbox._AID_STANDALONE_EC, true);

    // Slot 2: Minds-Only Inner-Entity (Zero card engine embedded)
    vm.runInContext(ieMindsCode, ctx);

    // Assert NO collision detected
    assert.strictEqual(Boolean(sandbox._AID_DOUBLE_ENGINE_DETECTED), false, "No collision in intended modular setup");
    assert.strictEqual(sandbox.state._aid_double_engine_detected, undefined);

    // Verify minds-only links to Slot 1's AutoCards
    sandbox.text = "/ie -i";
    sandbox.InnerEntity("input");
    sandbox.text = "";
    sandbox.InnerEntity("output");
    const infoOut = sandbox.text;
    assert(infoOut.includes("Auto-Cards Linked: Yes"), "Inner-Entity must recognize Slot 1 Auto-Cards");
    assert(!infoOut.includes("DOUBLE ENGINE WARNING"), "No double engine warning in modular setup");

    sandbox.AutoCards("input", "/ec -i");
    const ecInfoOut = sandbox.AutoCards("output", "");
    assert(!ecInfoOut.includes("DOUBLE ENGINE DETECTED"), "No double engine warning in Slot 1 EC");

    console.log("   ✔ Test 3 passed: Modular setup (Slot 1 EC + Slot 2 Minds-Only) links cleanly with zero false warnings");
}

// ----------------------------------------------------------------------------
// Test 4: Classic Double Engine (Slot 1 Standalone EC + Slot 2 Classic All-in-One)
// ----------------------------------------------------------------------------
{
    const { sandbox, ctx, cards } = createMockAIDContext([{ ...initialIEConfigCard }]);

    // Slot 1: Standalone Entity-Cards
    vm.runInContext(ecCode, ctx);
    const slot1EC = sandbox.AutoCards;

    // Slot 2: Classic All-in-One (Inner-Self + Classic Auto-Cards)
    vm.runInContext(ieClassicCode, ctx);

    // Assert collision detected
    assert.strictEqual(sandbox._AID_DOUBLE_ENGINE_DETECTED, true);
    assert.strictEqual(sandbox.state._aid_double_engine_detected, true);
    assert.strictEqual(sandbox.AutoCards, slot1EC, "globalThis.AutoCards preserved as Slot 1 engine");

    console.log("   ✔ Test 4 passed: Classic All-in-One collision with Standalone EC safely guarded");
}

// ----------------------------------------------------------------------------
// Test 5: Dynamic Reconfiguration Mid-Adventure: Removing duplicate script clears warning
// ----------------------------------------------------------------------------
{
    const { sandbox, ctx, cards } = createMockAIDContext([{ ...initialIEConfigCard }]);
    // Persistent state carries collision flag from previous turn
    sandbox.state._aid_double_engine_detected = true;

    // Turn 2: Player resolved the duplicate by keeping ONLY All-in-One in Slot 1
    vm.runInContext(ieAllCode, ctx);

    // Primary engine automatically clears stale double engine flag
    assert.strictEqual(sandbox._AID_DOUBLE_ENGINE_DETECTED, false, "Double engine flag reset to false");
    assert.strictEqual(sandbox.state._aid_double_engine_detected, undefined, "state flag removed");

    sandbox.text = "/ie -i";
    sandbox.InnerEntity("input");
    sandbox.text = "";
    sandbox.InnerEntity("output");
    assert(!sandbox.text.includes("DOUBLE ENGINE WARNING"), "Warning must clear once duplicate script is removed");

    sandbox.AutoCards("input", "/ec -i");
    const ecOut = sandbox.AutoCards("output", "");
    assert(!ecOut.includes("DOUBLE ENGINE DETECTED"), "Warning must clear in /ec -i as well");

    console.log("   ✔ Test 5 passed: Dynamic reconfiguration clears warnings when duplicate is resolved mid-adventure");
}

// ----------------------------------------------------------------------------
// Test 6: True Multi-VM Adventure Mode (Isolated globalThis & Per-Slot state,
//         Live Slot Reordering, Removal, and Modular Replacement)
// ----------------------------------------------------------------------------
{
    // Simulates AI Dungeon's exact server-side QuickJS multi-script architecture:
    // - Each attached script has its own persistent state: gameState.scripts[slotId]
    // - Each hook invocation creates a brand-new isolated VM context (globalThis is NOT shared!)
    // - Only storyCards, text, stop, history, and info are shared across slots.
    const sharedCards = [{ ...initialIEConfigCard }];
    const sharedHistory = [
        { text: "Karane said, \"Hakari's probably in the classroom.\"", type: "say" },
        { text: "Hakari stepped into the room and greeted Karane.", type: "story" }
    ];
    const sharedInfo = {
        maxChars: 64000,
        actionCount: 10,
        useCacheEfficient: false,
        storyModel: { name: "DeepSeek", version: "v3" }
    };
    const perSlotStates = {
        slotEC: {},
        slotIEAll: {},
        slotIEMinds: {}
    };

    function runSlotHookInIsolatedVM(slotCode, entryFnName, slotState, hook, textVal, stopVal = false) {
        const sandbox = {
            log: () => {},
            console: { log: () => {}, error: console.error },
            Math, String, Array, Object, Number, RegExp, Set, Map, JSON,
            parseInt, parseFloat, isNaN, isFinite, Date,
            text: textVal,
            stop: stopVal,
            history: sharedHistory,
            storyCards: sharedCards,
            info: sharedInfo,
            state: slotState,
            addStoryCard(...args) {
                let card = (args.length === 1)
                    ? { title: args[0], entry: "", keys: "", type: "class", description: "" }
                    : { keys: args[0], entry: args[1], type: args[2], title: args[3], description: args[4] };
                sharedCards.push(card);
                return card;
            },
            removeStoryCard(index) {
                sharedCards.splice(index, 1);
            }
        };
        sandbox.globalThis = sandbox;
        const isolatedCtx = vm.createContext(sandbox);
        vm.runInContext(slotCode, isolatedCtx);

        if (entryFnName === "AutoCards") {
            if (hook === "context") {
                const [t, s] = sandbox.AutoCards("context", sandbox.text, sandbox.stop);
                return { text: t, stop: s };
            }
            return { text: sandbox.AutoCards(hook, sandbox.text), stop: sandbox.stop };
        } else {
            sandbox.InnerEntity(hook);
            return { text: sandbox.text, stop: sandbox.stop };
        }
    }

    function runWaterfallHook(activeSlots, hook, initialText, initialStop = false) {
        let curText = initialText;
        let curStop = initialStop;
        for (const slot of activeSlots) {
            const res = runSlotHookInIsolatedVM(slot.code, slot.fn, slot.state, hook, curText, curStop);
            curText = res.text;
            curStop = res.stop;
        }
        return { text: curText, stop: curStop };
    }

    const slotEC = { id: "05_w3s9zrrvt", code: ecCode, fn: "AutoCards", state: perSlotStates.slotEC };
    const slotIEAll = { id: "ie_all_in_one", code: ieAllCode, fn: "InnerEntity", state: perSlotStates.slotIEAll };
    const slotIEMinds = { id: "bL_qS9DsI5wI", code: ieMindsCode, fn: "InnerEntity", state: perSlotStates.slotIEMinds };

    // --- Phase A: Order 1 [Slot 1: Standalone EC -> Slot 2: All-in-One IE] in separate VMs ---
    let activeOrder = [slotEC, slotIEAll];

    // 1. Test /ec -i across separate VMs
    let resIn = runWaterfallHook(activeOrder, "input", "/ec -i");
    assert.strictEqual(resIn.text.replace(/\u200D\u200B\u200C\u200B\u200D/g, ""), "/ec -i", "Multi-VM Order 1: /ec -i must preserve prompt on input");
    let res = runWaterfallHook(activeOrder, "output", "");
    assert(res.text.includes("⚠️ [DOUBLE ENGINE DETECTED]"), "Multi-VM Order 1: /ec -i must include double engine warning on output");

    // 2. Test /ie -i across separate VMs
    resIn = runWaterfallHook(activeOrder, "input", "/ie -i");
    assert.strictEqual(resIn.text.replace(/\u200D\u200B\u200C\u200B\u200D/g, ""), "/ie -i", "Multi-VM Order 1: /ie -i must preserve prompt on input");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(res.text.includes("⚠️ [DOUBLE ENGINE WARNING]"), "Multi-VM Order 1: /ie -i must include double engine warning on output");

    // 3. Test /ec -v across separate VMs (Slot 2 must NOT re-parse '/EC version ->' as a card title!)
    resIn = runWaterfallHook(activeOrder, "input", "/ec -v");
    assert.strictEqual(resIn.text.replace(/\u200D\u200B\u200C\u200B\u200D/g, ""), "/ec -v", "Multi-VM Order 1: /ec -v must preserve prompt on input");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(res.text.includes("/EC version ->"), "Multi-VM Order 1: /ec -v must deliver version output");
    assert(!res.text.includes("Generating card"), "Multi-VM Order 1: Slot 2 must not re-parse /EC version output as a card title");

    // 4. Test Context & Output turn across separate VMs
    sharedInfo.actionCount = 11;
    sharedHistory.push({ text: "Hakari looked at Karane.", type: "story" });
    delete perSlotStates.slotIEAll.AutoCards;
    runWaterfallHook(activeOrder, "context", "Recent Story:\nHakari looked at Karane.");
    runWaterfallHook(activeOrder, "output", "Karane blushed and looked away.");

    assert(perSlotStates.slotEC.AutoCards, "Multi-VM Order 1: Primary Slot 1 (Standalone EC) must execute and populate its state.AutoCards");
    assert.strictEqual(perSlotStates.slotIEAll.AutoCards, undefined, "Multi-VM Order 1: Secondary Slot 2 (All-in-One IE) bundled card engine must be completely bypassed during context & output");

    const acCardsAfterPhaseA = sharedCards.filter(c => c.title && c.title.includes("Auto-Cards"));
    assert.strictEqual(acCardsAfterPhaseA.length, 1, "Multi-VM Order 1: Exactly 1 Auto-Cards control card must exist");

    // --- Phase B: Player Reorders Scripts Mid-Adventure [Slot 1: All-in-One IE -> Slot 2: Standalone EC] ---
    activeOrder = [slotIEAll, slotEC];
    sharedInfo.actionCount = 12;
    sharedHistory.push({ text: "They walked down the hallway.", type: "story" });

    runWaterfallHook(activeOrder, "input", "/ec -i");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(res.text.includes("⚠️ [DOUBLE ENGINE DETECTED]"), "Multi-VM Reordered: /ec -i must still show warning on output");

    runWaterfallHook(activeOrder, "input", "/ie -i");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(res.text.includes("⚠️ [DOUBLE ENGINE WARNING]"), "Multi-VM Reordered: /ie -i must still show warning on output");

    runWaterfallHook(activeOrder, "context", "Recent Story:\nThey walked down the hallway.");
    runWaterfallHook(activeOrder, "output", "The bell rang loudly.");

    const acCardsAfterPhaseB = sharedCards.filter(c => c.title && c.title.includes("Auto-Cards"));
    assert.strictEqual(acCardsAfterPhaseB.length, 1, "Multi-VM Reordered: Still exactly 1 Auto-Cards control card");

    // --- Phase C: Player Fixes Setup Mid-Adventure by Swapping to [Slot 1: Standalone EC -> Slot 2: Minds-Only IE] ---
    activeOrder = [slotEC, slotIEMinds];
    sharedInfo.actionCount = 13;
    sharedHistory.push({ text: "Hakari opened the door.", type: "story" });

    runWaterfallHook(activeOrder, "input", "/ec -i");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(!res.text.includes("DOUBLE ENGINE DETECTED"), "Multi-VM Resolved: /ec -i warning must clear immediately on output");

    runWaterfallHook(activeOrder, "input", "/ie -i");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(!res.text.includes("DOUBLE ENGINE WARNING"), "Multi-VM Resolved: /ie -i warning must clear immediately on output");
    assert(res.text.includes("Auto-Cards Linked: Yes"), "Multi-VM Resolved: Minds-Only in VM #2 must detect Standalone EC in VM #1");

    // --- Phase D: Player Reorders Modular Pair [Slot 1: Minds-Only IE -> Slot 2: Standalone EC] ---
    activeOrder = [slotIEMinds, slotEC];
    sharedInfo.actionCount = 14;
    sharedHistory.push({ text: "Karane followed behind.", type: "story" });

    runWaterfallHook(activeOrder, "input", "/ie -i");
    res = runWaterfallHook(activeOrder, "output", "");
    assert(!res.text.includes("DOUBLE ENGINE WARNING"), "Multi-VM Inverted Modular: No false double engine warning on output");
    assert(res.text.includes("Auto-Cards Linked: Yes"), "Multi-VM Inverted Modular: Auto-Cards Linked is Yes on output");

    console.log("   ✔ Test 6 passed: Multi-VM Adventure Mode (isolated VMs & states, live reordering, removal & modular linking) verified");
}

console.log("==================================================================");
console.log("  🎉 ALL INNER-ENTITY DOUBLE ENGINE TESTS PASSED (100%)");
console.log("==================================================================");
