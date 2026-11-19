#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT_DIR = path.resolve(__dirname, "..");
const EC_LIB_PATH = path.join(ROOT_DIR, "submodules", "Entity-Cards", "src", "library.js");
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
    const ieInfoOut = sandbox.text;
    assert(ieInfoOut.includes("⚠️ [DOUBLE ENGINE WARNING]"), "/ie -i must display double engine warning block");
    assert(ieInfoOut.includes("Duplicate card engine automatically bypassed"), "/ie -i must explain bypass");

    // Slot 1 /ec -i diagnostics must include double engine warning
    const ecInfoOut = sandbox.AutoCards("input", "/ec -i");
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
    assert(sandbox.text.includes("⚠️ [DOUBLE ENGINE WARNING]"));

    const ecOut = sandbox.AutoCards("input", "/ec -i");
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
    assert.strictEqual(sandbox._AID_DOUBLE_ENGINE_DETECTED, undefined, "No collision in intended modular setup");
    assert.strictEqual(sandbox.state._aid_double_engine_detected, undefined);

    // Verify minds-only links to Slot 1's AutoCards
    sandbox.text = "/ie -i";
    sandbox.InnerEntity("input");
    const infoOut = sandbox.text;
    assert(infoOut.includes("Auto-Cards Linked: Yes"), "Inner-Entity must recognize Slot 1 Auto-Cards");
    assert(!infoOut.includes("DOUBLE ENGINE WARNING"), "No double engine warning in modular setup");

    const ecInfoOut = sandbox.AutoCards("input", "/ec -i");
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

console.log("==================================================================");
console.log("  🎉 ALL INNER-ENTITY DOUBLE ENGINE TESTS PASSED (100%)");
console.log("==================================================================");
