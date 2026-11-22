#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT_DIR = path.resolve(__dirname, "..");
const FLAGSHIP_PATH = path.join(ROOT_DIR, "src", "library.js");
const MINDS_ONLY_PATH = path.join(ROOT_DIR, "dist", "inner-self-minds-only.js");

const flagshipCode = fs.readFileSync(FLAGSHIP_PATH, "utf8");
const mindsOnlyCode = fs.readFileSync(MINDS_ONLY_PATH, "utf8");

// Sibling artifact paths
const aidModulesLibPath = path.resolve(ROOT_DIR, "../aid-modules/library-aid-modules.js");
const aidGetoptLibPath = path.resolve(ROOT_DIR, "../aid-getopt/library-aid-getopt.js");
const ecLibPath = path.resolve(ROOT_DIR, "../Entity-Cards/src/library.js");

console.log("==================================================================");
console.log("  TEST SUITE: Inner-Entity CSCP Capability Yielding & Multi-VM");
console.log("  Target: " + FLAGSHIP_PATH);
console.log("==================================================================");

function createSlotVM(sharedCards, sharedInfo, sharedHistory, slotState = {}) {
    const sandbox = {
        log: () => {},
        console: { log: () => {}, error: console.error },
        Math, String, Array, Object, Number, RegExp, Set, Map, JSON,
        parseInt, parseFloat, isNaN, isFinite, Date,
        text: "",
        stop: false,
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
    return { sandbox, ctx: vm.createContext(sandbox) };
}

// ----------------------------------------------------------------------------
// Test 1: loadCSCP() Unit Verification
// ----------------------------------------------------------------------------
console.log("\n--- Part 1: loadCSCP() Unit Verification ---");
{
    const { sandbox, ctx } = createSlotVM([], { actionCount: 1 }, [], {});
    vm.runInContext(mindsOnlyCode, ctx);

    assert.strictEqual(typeof sandbox.loadCSCP, "function", "loadCSCP must be exported");
    assert.strictEqual(sandbox.loadCSCP(), null, "loadCSCP() must return null when no storyCards have DLL");
    console.log("   ✔ loadCSCP() safely returns null with empty cards");
}

// ----------------------------------------------------------------------------
// Test 2: Minds-Only Standalone with AID-Modules in Slot 1
// ----------------------------------------------------------------------------
console.log("\n--- Part 2: Minds-Only Standalone with CSCP (0 Collisions) ---");
{
    const sharedCards = [];
    const sharedInfo = { actionCount: 1 };
    const sharedHistory = [];
    // Slot 1: AID-Modules
    const slot1 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const aidModulesCode = fs.readFileSync(aidModulesLibPath, "utf8");
    vm.runInContext(aidModulesCode, slot1.ctx);
    vm.runInContext("AID.hook('context', 'Story beginning...', false)", slot1.ctx);

    // Slot 2: Minds-Only
    const slot2 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    vm.runInContext(mindsOnlyCode, slot2.ctx);

    slot2.sandbox.text = "/ie -v";
    slot2.sandbox.InnerEntity("input");
    assert.strictEqual(slot2.sandbox.text, "/ie -v", "Prompt preserved on input");
    slot2.sandbox.text = "";
    slot2.sandbox.InnerEntity("output");
    assert(slot2.sandbox.text.includes("/IE version -> Inner Entity"), "Minds-only processed /ie -v on output");

    const cscpPacket = vm.runInContext("loadCSCP().read()", slot2.ctx);
    assert(cscpPacket, "CSCP packet exists");
    assert(cscpPacket.modules["inner-entity"], "inner-entity is registered in CSCP modules");
    assert.deepStrictEqual(cscpPacket.modules["inner-entity"].provides, ["inner-entity"], "Provides inner-entity only");
    assert.strictEqual(cscpPacket.owners["inner-entity"].moduleName, "inner-entity");
    assert.strictEqual(cscpPacket.collisions.length, 0, "Zero capability collisions");

    console.log("   ✔ Minds-Only announced 'inner-entity' with 0 collisions");
}

// ----------------------------------------------------------------------------
// Test 3: Flagship All-in-One Standalone with AID-Modules in Slot 1
// ----------------------------------------------------------------------------
console.log("\n--- Part 3: Flagship All-in-One Standalone with CSCP (Claims Both) ---");
{
    const sharedCards = [];
    const sharedInfo = { actionCount: 1 };
    const sharedHistory = [];
    // Slot 1: AID-Modules
    const slot1 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const aidModulesCode = fs.readFileSync(aidModulesLibPath, "utf8");
    vm.runInContext(aidModulesCode, slot1.ctx);
    vm.runInContext("AID.hook('context', 'Story beginning...', false)", slot1.ctx);

    // Slot 2: Flagship All-in-One
    const slot2 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    vm.runInContext(flagshipCode, slot2.ctx);

    slot2.sandbox.text = "A stranger approaches.";
    slot2.sandbox.InnerEntity("input");
    slot2.sandbox.InnerEntity("context");

    assert(!slot2.sandbox._AID_DOUBLE_ENGINE_DETECTED, "Double engine flag not set for standalone All-in-One");

    const cscpPacket = vm.runInContext("loadCSCP().read()", slot2.ctx);
    assert(cscpPacket, "CSCP packet exists");
    assert(cscpPacket.modules["inner-entity"], "inner-entity registered");
    assert.deepStrictEqual(cscpPacket.owners["inner-entity"].moduleName, "inner-entity");
    assert.deepStrictEqual(cscpPacket.owners["entity-cards"].moduleName, "inner-entity");
    assert.strictEqual(cscpPacket.collisions.length, 0, "Zero collisions when All-in-One runs standalone");

    console.log("   ✔ All-in-One claimed both 'inner-entity' and 'entity-cards' capabilities with 0 collisions");
}

// ----------------------------------------------------------------------------
// Test 4: Upstream Standalone Entity-Cards (Slot 2) + Downstream All-in-One (Slot 3)
// ----------------------------------------------------------------------------
console.log("\n--- Part 4: Upstream Standalone EC + Downstream All-in-One (Capability Yielding) ---");
{
    const sharedCards = [];
    const sharedInfo = { actionCount: 1 };
    const sharedHistory = [];
    const sharedState = {};

    // Slot 1: AID-Modules
    const slot1 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const aidModulesCode = fs.readFileSync(aidModulesLibPath, "utf8");
    vm.runInContext(aidModulesCode, slot1.ctx);
    vm.runInContext("AID.hook('context', 'Story beginning...', false)", slot1.ctx);

    // Slot 2: Standalone Entity-Cards
    const slot2 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const ecCode = fs.readFileSync(ecLibPath, "utf8");
    vm.runInContext(ecCode, slot2.ctx);

    // Slot 3: All-in-One Inner-Entity
    const slot3 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    vm.runInContext(flagshipCode, slot3.ctx);

    // Run input hook: player sends an EC command
    slot2.sandbox.text = "/ec -v";
    const slot2In = slot2.sandbox.AutoCards("input", slot2.sandbox.text);
    slot3.sandbox.text = slot2In;
    slot3.sandbox.InnerEntity("input");

    // Assert that Slot 3 detected the collision and yielded "entity-cards"
    assert.strictEqual(slot3.sandbox._AID_DOUBLE_ENGINE_DETECTED, true, "Double engine detected in globalThis");
    assert.strictEqual(slot3.sandbox.state._aid_double_engine_detected, true, "Double engine detected in state");

    const bundledAC = slot3.sandbox.AutoCards;
    assert.strictEqual(bundledAC._isBypassed, true, "Bundled Entity-Cards engine is bypassed");
    assert(bundledAC._bypassReason.includes("entity-cards"), "Bypass reason mentions capability yield");

    // Context hook execution:
    // Slot 2 executes context
    slot2.sandbox.text = "Recent Story:\nA merchant offers goods.";
    const resS2 = slot2.sandbox.AutoCards("context", slot2.sandbox.text, false);
    const [s2Ctx] = Array.isArray(resS2) ? resS2 : [resS2];

    // Slot 3 executes context: bundled AutoCards bypassed, character minds execute
    slot3.sandbox.text = s2Ctx;
    slot3.sandbox.InnerEntity("context");

    // Verify CSCP packet state
    const cscpPacket = vm.runInContext("loadCSCP().read()", slot3.ctx);
    assert(cscpPacket, "CSCP packet exists");

    // Active capabilities check
    assert.strictEqual(cscpPacket.owners["entity-cards"].moduleName, "entity-cards", "Entity-Cards owns entity-cards");
    assert.strictEqual(cscpPacket.owners["inner-entity"].moduleName, "inner-entity", "Inner-Entity owns inner-entity");
    const slot3Rec = Object.values(cscpPacket.slots).find(s => s.name === "inner-entity");
    assert(slot3Rec, "Inner-Entity slot record exists in CSCP");
    assert(slot3Rec.yielded.includes("entity-cards"), "Inner-Entity yielded 'entity-cards' capability");

    console.log("   ✔ Downstream All-in-One yielded 'entity-cards' to Upstream Slot 2, bypassed bundled card engine, and preserved character minds");
}

// ----------------------------------------------------------------------------
// Test 5: Reverse Order: Upstream All-in-One (Slot 2) + Downstream Standalone EC (Slot 3)
// ----------------------------------------------------------------------------
console.log("\n--- Part 5: Reverse Order: Upstream All-in-One + Downstream Standalone EC ---");
{
    const sharedCards = [];
    const sharedInfo = { actionCount: 1 };
    const sharedHistory = [];

    // Slot 1: AID-Modules
    const slot1 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const aidModulesCode = fs.readFileSync(aidModulesLibPath, "utf8");
    vm.runInContext(aidModulesCode, slot1.ctx);
    vm.runInContext("AID.hook('context', 'Story beginning...', false)", slot1.ctx);

    // Slot 2: All-in-One Inner-Entity
    const slot2 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    vm.runInContext(flagshipCode, slot2.ctx);

    // Slot 3: Standalone Entity-Cards
    const slot3 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const ecCode = fs.readFileSync(ecLibPath, "utf8");
    vm.runInContext(ecCode, slot3.ctx);

    // Run input hook with standard narrative input
    slot2.sandbox.text = "A traveller arrives.";
    slot2.sandbox.InnerEntity("input");

    slot3.sandbox.text = slot2.sandbox.text;
    slot3.sandbox.AutoCards("input", slot3.sandbox.text);

    // Slot 3 (Standalone) yields because Slot 2 already claimed 'entity-cards'
    assert.strictEqual(slot3.sandbox._AID_DOUBLE_ENGINE_DETECTED, true, "Slot 3 Standalone detects double engine");
    assert.strictEqual(slot3.sandbox.AutoCards._isBypassed, true, "Slot 3 AutoCards is bypassed");
    assert(slot3.sandbox.AutoCards._bypassReason.includes("entity-cards"), "Bypass reason mentions capability yield");

    const cscpPacket = vm.runInContext("loadCSCP().read()", slot3.ctx);
    assert(cscpPacket, "CSCP packet exists");
    assert.strictEqual(cscpPacket.owners["entity-cards"].moduleName, "inner-entity", "Inner-Entity owns entity-cards");
    const slot3Rec = Object.values(cscpPacket.slots).find(s => s.name === "entity-cards");
    assert(slot3Rec, "Entity-Cards slot record exists in CSCP");
    assert(slot3Rec.yielded.includes("entity-cards"), "Entity-Cards yielded 'entity-cards' capability");

    console.log("   ✔ Upstream All-in-One claimed 'entity-cards'; Downstream Standalone EC yielded cleanly");
}

// ----------------------------------------------------------------------------
// Test 6: 4-Slot Ecosystem Grand Unification
// Slot 1: AID-Modules
// Slot 2: AID-Getopt
// Slot 3: Entity-Cards (Standalone)
// Slot 4: Inner-Entity (Minds-Only)
// ----------------------------------------------------------------------------
console.log("\n--- Part 6: 4-Slot Full Ecosystem Grand Unification ---");
{
    const sharedCards = [];
    const sharedInfo = { actionCount: 1 };
    const sharedHistory = [];
    const sharedState = {};

    // Slot 1: AID-Modules
    const slot1 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const aidModulesCode = fs.readFileSync(aidModulesLibPath, "utf8");
    vm.runInContext(aidModulesCode, slot1.ctx);
    vm.runInContext("AID.hook('context', 'Story beginning...', false)", slot1.ctx);

    // Slot 2: AID-Getopt
    const slot2 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const aidGetoptCode = fs.readFileSync(aidGetoptLibPath, "utf8");
    vm.runInContext(aidGetoptCode, slot2.ctx);

    // Slot 3: Entity-Cards (Standalone)
    const slot3 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    const ecCode = fs.readFileSync(ecLibPath, "utf8");
    vm.runInContext(ecCode, slot3.ctx);

    // Slot 4: Inner-Entity (Minds-Only)
    const slot4 = createSlotVM(sharedCards, sharedInfo, sharedHistory, {});
    vm.runInContext(mindsOnlyCode, slot4.ctx);

    // Trigger input turn across all slots
    slot1.sandbox.AID.hook("input", "Hakari says hello.", false);
    slot3.sandbox.AutoCards("input", "Hakari says hello.");
    slot4.sandbox.InnerEntity("input");

    // Verify /help in Slot 2 aggregates all cross-slot modules dynamically
    const app = slot2.sandbox.AIDGetopt.cli();
    const helpOutput = app.help();
    assert(helpOutput.includes("Cross-Slot Commands (CSCP):"), "/help includes CSCP section");
    assert(helpOutput.includes("/ie"), "/help includes /ie command");
    assert(helpOutput.includes("/ec"), "/help includes /ec command");
    assert(helpOutput.includes("Character mind simulation"), "/help includes Inner-Entity description");
    assert(helpOutput.includes("Autonomous story cards"), "/help includes EntityCards description");

    // Inspect CSCP bus state
    const cscpPacket = vm.runInContext("loadCSCP().read()", slot4.ctx);
    assert(cscpPacket, "CSCP packet exists");
    assert.strictEqual(cscpPacket.collisions.length, 0, "Zero collisions in modular 4-slot setup");

    const modules = Object.keys(cscpPacket.modules);
    assert(modules.includes("aid-getopt"), "aid-getopt on bus");
    assert(modules.includes("entity-cards"), "entity-cards on bus");
    assert(modules.includes("inner-entity"), "inner-entity on bus");

    console.log("   ✔ 4-Slot Ecosystem (Modules + Getopt + EC + IE) verified with 0 collisions and full /help integration");
}

// ----------------------------------------------------------------------------
// Test 7: 4-Slot Multi-VM Card Generation Isolation & Ephemeral VM Resilience
// Verifies:
//  1) Ephemeral per-hook VMs never self-collide on CSCP 'init' phase
//  2) Downstream Inner-Entity (Minds-Only) pauses thought tasks & deactivates
//     its Thought Task Card while upstream Entity-Cards is generating a card
//  3) Multi-turn continuation preserves ENTITY_BEGIN, merges repeated YAML blocks,
//     strips stray narrative preambles, and finalizes card at 100%
// ----------------------------------------------------------------------------
console.log("\n--- Part 7: 4-Slot Multi-VM Card Generation Isolation & YAML Continuation ---");
{
    const sharedCards = [
        {
            title: "Configure \nInner Entity",
            keys: "Edit the entry above to configure Inner Entity",
            entry: `> Enable Inner Entity: true\n> Show detailed guide: false\n> First name of player character: "Jonathan"\n> Adventure in 1st, 2nd, or 3rd person: 2\n> Max brain size relative to story context: 25%\n> Recent turns searched for name triggers: 10\n> Visual indicator of current NPC triggers: "🎭"\n> Thought formation chance per turn: 100%\n> Half thought chance for Do/Say/Story: false\n> Brain card notes store brains as JSON: false\n> Enable debug mode to see model tasks: false\n> Pin the config card near the top: true\n> Install Auto-Cards: true`,
            description: "Ingrid\nHilda",
            type: "class"
        }
    ];
    const sharedInfo = { actionCount: 1, maxChars: 8000, useCacheEfficient: true };
    const sharedHistory = [
        {
            type: "continue",
            text: `Hilda steps forward, her gray eyes steady on the guards. "Never leave that door unattended," she says.`
        }
    ];
    const slotStates = [{}, {}, {}, {}];

    const aidModulesCode = fs.readFileSync(aidModulesLibPath, "utf8");
    const aidGetoptCode = fs.readFileSync(aidGetoptLibPath, "utf8");
    const ecCode = fs.readFileSync(ecLibPath, "utf8");

    // Simulate AI Dungeon creating a fresh VM per hook (where onModelContext state mutations are not persisted)
    function run4SlotHook(hook, initialText, initialStop = false) {
        let t = initialText;
        let s = initialStop;
        const codes = [aidModulesCode, aidGetoptCode, ecCode, mindsOnlyCode];
        for (let i = 0; i < 4; i++) {
            // Clone state for context hook to emulate AI Dungeon's non-persisted context VM state
            const stateForHook = (hook === "context") ? JSON.parse(JSON.stringify(slotStates[i])) : slotStates[i];
            const vmSlot = createSlotVM(sharedCards, sharedInfo, sharedHistory, stateForHook);
            vm.runInContext(codes[i], vmSlot.ctx);
            vmSlot.sandbox.text = t;
            vmSlot.sandbox.stop = s;
            if (i === 0) {
                const res = vmSlot.sandbox.AID.hook(hook, t, s);
                if (hook === "context" && Array.isArray(res)) { [t, s] = res; } else if (typeof res === "string") { t = res; }
            } else if (i === 2) {
                const res = vmSlot.sandbox.AutoCards(hook, t, s);
                if (hook === "context" && Array.isArray(res)) { [t, s] = res; } else if (typeof res === "string") { t = res; }
            } else if (i === 3) {
                vmSlot.sandbox.InnerEntity(hook);
                t = vmSlot.sandbox.text;
                s = vmSlot.sandbox.stop;
            }
            if (hook === "context" && i === 2) {
                // Persist AutoCards state across hooks as AI Dungeon persists state from input/output or data card
                slotStates[2].AutoCards = stateForHook.AutoCards;
            }
        }
        return hook === "context" ? [t, s] : t;
    }

    // Turn 1: Normal turn -> Inner-Entity activates 🧠 Inner Entity Task card for Hilda
    sharedInfo.actionCount = 2;
    run4SlotHook("context", "World Lore:\n\nRecent Story:\nHilda steps forward.");
    run4SlotHook("output", "(hilda_guard_order = `I must ensure the western tower remains guarded.`) Both guards snap to attention.");
    const ieTaskCard = sharedCards.find(c => c.title && c.title.includes("Inner Entity Task"));
    assert(ieTaskCard, "Inner Entity Task card created on normal NPC turn");

    // Turn 2: Player runs /ec -p brenner (auto-enables EC at 0% and suppresses IE Thought Task Card)
    sharedInfo.actionCount = 3;
    const inText = run4SlotHook("input", "\n> You /ec -p brenner.\n");
    assert(inText.includes("/EC {Brenner} [-person] -> Success!"), "Expected /ec -p brenner to succeed");
    sharedHistory.push({ type: "do", text: inText });

    run4SlotHook("context", "World Lore:\n\nRecent Story:\nHilda steps forward.\n" + inText);
    assert.strictEqual(ieTaskCard.keys, "", "IE Thought Task Card keys MUST be cleared even on the 0% auto-enable turn");
    assert.strictEqual(ieTaskCard.entry, "", "IE Thought Task Card entry MUST be cleared even on the 0% auto-enable turn");
    const outTurn0 = run4SlotHook("output", "Some ignored output");
    assert(outTurn0.includes('>>> please select "continue" (0%) <<<'), "Turn 2 output must show 0% continue prompt");

    // Turn 3: Player clicks Continue (no input hook runs on Continue in AI Dungeon!) -> generation starts
    sharedInfo.actionCount = 4;
    run4SlotHook("context", "World Lore:\n\nRecent Story:\nHilda steps forward.\n" + inText);
    // Verify EC Task Card is active AND IE Thought Task Card is deactivated!
    const ecTaskCard = sharedCards.find(c => c.title && c.title.includes("Auto-Cards Task"));
    assert(ecTaskCard && ecTaskCard.keys !== "" && ecTaskCard.entry.includes("Brenner"), "EC Task Card must be active during card generation");
    assert.strictEqual(ieTaskCard.keys, "", "IE Thought Task Card keys MUST be cleared across VMs during EC card generation");
    assert.strictEqual(ieTaskCard.entry, "", "IE Thought Task Card entry MUST be cleared across VMs during EC card generation");

    // Model outputs first partial chunk on Turn 3
    const outTurn2 = run4SlotHook("output", "ENTITY_BEGIN\nentity: Brenner\ntype: Person\ncategory: Royal Guard Corporal\nmbti: ISTJ—Logistician\nappearance: Young, early twenties, with a serious, clean-shaven face.");
    assert(outTurn2.includes('>>> Generating "Brenner" [Person]: please select "continue"'), "Turn 3 output must show generating progress notice");

    // Turn 4: Player clicks Continue (no input hook runs on Continue in AI Dungeon!)
    sharedInfo.actionCount = 5;
    run4SlotHook("context", "World Lore:\n\nRecent Story:\nHilda steps forward.");
    assert(ecTaskCard.entry.includes("ENTITY_BEGIN\nentity: Brenner"), "Continuation prompt must preserve ENTITY_BEGIN sentinel");
    assert.strictEqual(ieTaskCard.keys, "", "IE Thought Task Card must remain deactivated on Continue turns");

    // Model outputs second chunk with personality
    const outTurn3 = run4SlotHook("output", "personality: Precise, dutiful, and unflappable; speaks in clipped, respectful tones.");
    assert(outTurn3.includes('>>> Generating "Brenner" [Person]: please select "continue"'), "Turn 4 output must show generating progress notice");

    // Turn 5: Player clicks Continue; model repeats ENTITY_BEGIN block with narrative preamble (stall/repeat case)
    sharedInfo.actionCount = 6;
    run4SlotHook("context", "World Lore:\n\nRecent Story:\nHilda steps forward.");
    const outTurn4 = run4SlotHook("output", `"Simple fare," she says again. ENTITY_BEGIN\nentity: Brenner\ntype: Person\ncategory: Royal Guard Corporal\nmbti: ISTJ—Logistician\nappearance: Young, early twenties, with a serious, clean-shaven face.\npersonality: Precise, dutiful, and unflappable; speaks in clipped, respectful tones.`);
    assert(outTurn4.includes('>>> Generated "Brenner" [Person] (100%): Card added to Story Cards!'), "Turn 5 must finalize at 100% and announce card creation");

    const brennerCard = sharedCards.find(c => c.title === "Brenner");
    assert(brennerCard, "Brenner Story Card must be created in storyCards");
    assert.strictEqual(brennerCard.type, "Person", "Brenner card type must be Person");
    assert(brennerCard.entry.includes("category: Royal Guard Corporal"), "Brenner card must contain category");
    assert(brennerCard.entry.includes("personality: Precise, dutiful"), "Brenner card must contain merged personality");
    assert(!brennerCard.entry.includes("Simple fare"), "Brenner card must not contain narrative preamble");
    assert(!brennerCard.entry.includes("ENTITY_BEGIN"), "Brenner card must not contain raw ENTITY_BEGIN sentinel");
    assert.strictEqual((brennerCard.entry.match(/entity:\s*Brenner/gi) || []).length, 1, "entity: Brenner must appear exactly once");

    console.log("   ✔ 4-Slot Multi-VM card generation isolation, thought card suppression, and YAML continuation verified");
}

console.log("\n==================================================================");
console.log("  🎉 ALL INNER-ENTITY CSCP MULTI-VM TESTS PASSED (100% SUCCESS)");
console.log("==================================================================");
