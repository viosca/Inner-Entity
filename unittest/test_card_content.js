const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

console.log("\n==================================================================");
console.log("  SUITE 5: Card Content Integrity & Story Fallback Prevention");
console.log("==================================================================");

const libraryPath = path.join(__dirname, '..', 'dist', 'inner-entity.js');
const libraryCode = fs.readFileSync(libraryPath, 'utf8');

function createEnv() {
    const cards = [];
    const logs = [];
    const sandbox = {
        history: [
            { text: "You arrive in the neon-lit streets of Neo Tokyo.", type: "story" }
        ],
        storyCards: cards,
        info: {
            actionCount: 1,
            useCacheEfficient: false,
            storyModel: { name: "WizardLM-2", version: "8x22B" }
        },
        state: {},
        text: "",
        stop: false,
        console: console,
        log: function(...args) { logs.push(args.join(" ")); },
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
    const ctx = vm.createContext(sandbox);
    vm.runInContext(libraryCode, ctx);
    return { sandbox, ctx, cards, logs };
}

// Test 1: Verify prompt lead-in ends with primed entity sentinel
{
    const { sandbox, ctx } = createEnv();
    sandbox.text = "/ec Neo Tokyo -loc";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerEntity("input");', ctx);

    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n> /ec Neo Tokyo -loc";
    vm.runInContext('InnerEntity("context");', ctx);

    // Turn 2: Continue
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);

    const promptSent = sandbox.text;
    assert(promptSent.includes("ENTITY_BEGIN"), "Prompt must contain ENTITY_BEGIN");
    assert(promptSent.includes("entity: Neo Tokyo"), "Prompt must contain entity: Neo Tokyo");
    assert(promptSent.includes("type: Location"), "Prompt must contain type: Location");
    assert(promptSent.trimEnd().endsWith("type: Location"), "Prompt must end with primed entity block to prevent story continuation");
    console.log("   ✔ Test 1 passed: Prompt ends with primed entity schema lead-in");
}

// Test 2: AI tries to generate story prose - must be discarded and NOT pollute card
{
    const { sandbox, ctx, cards } = createEnv();
    sandbox.text = "/ec Neo Tokyo -loc";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerEntity("input");', ctx);

    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n> /ec Neo Tokyo -loc";
    vm.runInContext('InnerEntity("context");', ctx);
    sandbox.text = "";
    vm.runInContext('InnerEntity("output");', ctx);

    // Turn 2: Player clicks continue, but AI model hallucinates story prose
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);

    // AI outputs pure story prose with dialogue
    const storyProse = '"Look out!" screams a stranger as an aerial speeder swerves past. The rain slicks the pavement.';
    sandbox.text = storyProse;
    vm.runInContext('InnerEntity("output");', ctx);

    // Verify workpiece did NOT absorb the story prose!
    const wp = sandbox.state.AutoCards.generation.workpiece;
    assert(!wp.entry.includes("Look out!"), "Workpiece must not absorb narrative dialogue/story prose");
    assert(!wp.entry.includes("screams a stranger"), "Workpiece must not absorb narrative prose");
    console.log("   ✔ Test 2 passed: Narrative story prose was rejected and discarded");
}

// Test 3: AI outputs YAML cleanly - card is successfully created with YAML content
{
    const { sandbox, ctx, cards } = createEnv();
    sandbox.text = "/ec Neo Tokyo -loc";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerEntity("input");', ctx);

    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n> /ec Neo Tokyo -loc";
    vm.runInContext('InnerEntity("context");', ctx);
    sandbox.text = "";
    vm.runInContext('InnerEntity("output");', ctx);

    // Turn 2: Continue
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);

    // AI outputs valid YAML completion
    sandbox.text = `category: Megacity
atmosphere: Rainy cyberpunk sprawl
key_locations:
- Shinjuku Sector: Nightlife district
- Orbital Spire: Megacorp headquarters
connections: Neutral ground for syndicates
description: The neon-soaked capital of the Pacific Rim.
ENTITY_END`;
    vm.runInContext('InnerEntity("output");', ctx);

    const card = cards.find(c => c.title === "Neo Tokyo");
    assert(card, "Neo Tokyo card must be created in storyCards");
    assert.strictEqual(card.type, "Location", "Card type must be Location");
    assert(card.entry.includes("entity: Neo Tokyo"), "Card entry must contain entity title");
    assert(card.entry.includes("type: Location"), "Card entry must contain entity type");
    assert(card.entry.includes("category: Megacity"), "Card entry must contain YAML fields");
    assert(card.entry.includes("description: The neon-soaked capital"), "Card entry must contain description");
    assert(!card.entry.includes("You arrive in the neon-lit"), "Card entry must NOT contain the story text");
    console.log("   ✔ Test 3 passed: Card contains structured YAML and zero story prose");
}

// Test 4: AI outputs YAML with duplicate sentinels - deduplicated cleanly
{
    const { sandbox, ctx, cards } = createEnv();
    sandbox.text = "/ec Neo Tokyo -loc";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerEntity("input");', ctx);

    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n> /ec Neo Tokyo -loc";
    vm.runInContext('InnerEntity("context");', ctx);
    sandbox.text = "";
    vm.runInContext('InnerEntity("output");', ctx);

    // Turn 2: Continue
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.info.maxChars = 4000;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);

    // AI repeats ENTITY_BEGIN and entity: Neo Tokyo from scratch
    sandbox.text = `ENTITY_BEGIN
entity: Neo Tokyo
type: Location
category: Megacity
atmosphere: Dense neon fog
description: The cybernetic center of the world.
ENTITY_END`;
    vm.runInContext('InnerEntity("output");', ctx);

    const card = cards.find(c => c.title === "Neo Tokyo");
    assert(card, "Card must be created");
    // Ensure ENTITY_BEGIN was stripped and not repeated inside entry
    assert(!card.entry.includes("ENTITY_BEGIN"), "ENTITY_BEGIN sentinel must be stripped");
    assert(!card.entry.includes("ENTITY_END"), "ENTITY_END sentinel must be stripped");
    // Ensure entity: Neo Tokyo only occurs once in the YAML block
    const matches = card.entry.match(/entity:\s*Neo Tokyo/gi) || [];
    assert.strictEqual(matches.length, 1, "entity: Neo Tokyo must occur exactly once");
    console.log("   ✔ Test 4 passed: Duplicate sentinels and entity headers handled cleanly");
}

// Test 5: Optimize Context (useCacheEfficient = true) routes EC prompt via Task Card,
// prevents collision with Inner Entity NPC Thought Task Card, preserves same-line ENTITY_END,
// and deactivates Task Card immediately upon completion
{
    const { sandbox, ctx, cards } = createEnv();
    sandbox.info.useCacheEfficient = true;
    sandbox.info.maxChars = 8000;

    // Add an NPC agent "@Karane" so Inner Entity first writes an active thought card
    cards.push({
        title: "@Karane",
        keys: "Karane",
        entry: "Karane is a sharp-tongued merc in Neo Tokyo.",
        type: "character",
        description: ""
    });

    // Turn 1: Normal turn with Karane in narration -> populates 🧠 Inner Entity Task card
    sandbox.history.push({ text: "Karane checks her cyberdeck under the neon sign.", type: "story" });
    sandbox.text = "World Lore:\nKarane is a sharp-tongued merc.\n\nRecent Story:\nYou arrive in Neo Tokyo. Karane checks her cyberdeck under the neon sign.";
    // Force chance=100% via Math.random override for deterministic thought request
    const origRandom = sandbox.Math ? sandbox.Math.random : Math.random;
    vm.runInContext('Math.random = () => 0.01;', ctx);
    vm.runInContext('InnerEntity("context");', ctx);
    vm.runInContext('InnerEntity("output");', ctx);

    const thoughtCard = cards.find(c => c.title.includes("Inner Entity Task"));
    assert(thoughtCard && thoughtCard.entry.includes("THOUGHT-WRITING FORMAT") && thoughtCard.keys !== "",
        "Precondition: Inner Entity thought task card should be active after NPC turn");

    // Turn 2: Player issues /ec Neo Tokyo -loc while Optimize Context is ON
    sandbox.text = "/ec Neo Tokyo -loc";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo. Karane checks her cyberdeck.\n> /ec Neo Tokyo -loc";
    vm.runInContext('InnerEntity("context");', ctx);
    sandbox.text = "";
    vm.runInContext('InnerEntity("output");', ctx);

    // Turn 3: Player selects Continue to generate the card under Optimize Context
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);

    const originalStoryContext = "World Lore:\nRecent Story:\nYou arrive in the neon-lit streets of Neo Tokyo. Karane checks her cyberdeck.\n";
    sandbox.text = originalStoryContext;
    vm.runInContext('InnerEntity("context");', ctx);

    // CRITICAL SIMULATION: AI Dungeon DISCARDS sandbox.text returned by contextModifier when useCacheEfficient === true!
    // The model ONLY receives storyCards whose keys match words in originalStoryContext!
    const ecTaskCard = cards.find(c => c.title === "\uD83D\uDDC2\uFE0F Entity Cards Task — do not edit");
    assert(ecTaskCard, "Entity Cards OC Task Card must be created when useCacheEfficient === true");
    assert(ecTaskCard.keys.length > 0, "Entity Cards OC Task Card must have active trigger keys");
    assert(ecTaskCard.entry.length > 0 && ecTaskCard.entry.length <= 2000,
        `OC Task Card entry must be 1..2000 chars (got ${ecTaskCard.entry.length})`);
    assert(ecTaskCard.entry.startsWith("// Entity Cards OC"), "OC Task Card must carry EC OC header stamp");
    assert(ecTaskCard.entry.includes("<SYSTEM>") && ecTaskCard.entry.trimEnd().endsWith("</SYSTEM>"),
        "OC Task Card must have intact <SYSTEM>...</SYSTEM> tags without truncation");
    assert(ecTaskCard.entry.includes("Target Entity Type: Location"), "OC Task Card must narrow to Location schema");
    assert(ecTaskCard.entry.includes("FIRST LINE OF OUTPUT MUST BE: ENTITY_BEGIN"), "OC Task Card must enforce ENTITY_BEGIN");

    // Verify at least one trigger key actually matches originalStoryContext (case-insensitive)
    const lowerCtx = originalStoryContext.toLowerCase();
    const matchedKeys = ecTaskCard.keys.split(",").filter(k => k && lowerCtx.includes(k.trim().toLowerCase()));
    assert(matchedKeys.length >= 3, `OC Task Card keys must match story context (matched: ${matchedKeys.join(", ")})`);

    // Verify 🧠 Inner Entity Task card was DEACTIVATED so it cannot collide with Entity Cards generation!
    assert.strictEqual(thoughtCard.keys, "", "Inner Entity Thought Task Card keys MUST be cleared during EC generation");
    assert.strictEqual(thoughtCard.entry, "", "Inner Entity Thought Task Card entry MUST be cleared during EC generation");

    // Feed YAML completion with same-line ENTITY_END on the description line
    sandbox.text = `ENTITY_BEGIN
entity: Neo Tokyo
type: Location
category: Cyberpunk Megacity
atmosphere: Perpetual acid rain and holographic billboards
key_locations:
- Shinjuku Neon Ward: Mercenary hub
connections: Controlled by rival zaibatsu syndicates
description: A sprawling neon megacity where syndicates rule from orbital spires. ENTITY_END`;
    vm.runInContext('InnerEntity("output");', ctx);

    const created = cards.find(c => c.title === "Neo Tokyo");
    assert(created, "Neo Tokyo card must be created under Optimize Context");
    assert(created.entry.includes("description: A sprawling neon megacity where syndicates rule from orbital spires."),
        "Same-line ENTITY_END must NOT erase the description line! Got:\n" + created.entry);
    assert(!created.entry.includes("ENTITY_END"), "ENTITY_END must be stripped");

    // Verify OC Task Card is immediately deactivated once generation finishes
    assert.strictEqual(ecTaskCard.keys, "", "Entity Cards OC Task Card keys must be cleared immediately on completion");
    assert.strictEqual(ecTaskCard.entry, "", "Entity Cards OC Task Card entry must be cleared immediately on completion");
    console.log("   ✔ Test 5 passed: Optimize Context routes EC prompt via Task Card, prevents Thought Card collision, and preserves same-line ENTITY_END");
}

// Test 6: Optimize Context multi-branch classification fits <= 2000 chars across ALL presets (standard, lite, authoring)
{
    for (const preset of ["standard", "lite", "authoring"]) {
        const { sandbox, ctx, cards } = createEnv();
        sandbox.info.useCacheEfficient = true;
        sandbox.info.maxChars = 8000;

        // Enable Entity Cards via API.toggle(true) so Configure Entity Cards is constructed
        vm.runInContext('EntityCards().API.toggle(true);', ctx);
        sandbox.text = "World Lore:\nRecent Story:\nThe Obsidian Rose Syndicate rules the docks.";
        vm.runInContext('InnerEntity("context");', ctx);
        sandbox.text = "The rain falls.";
        vm.runInContext('InnerEntity("output");', ctx);

        // Next context turn constructs Configure Entity Cards
        sandbox.text = "World Lore:\nRecent Story:\nThe Obsidian Rose Syndicate rules the docks.";
        vm.runInContext('InnerEntity("context");', ctx);

        // Set preset in Configure Entity Cards (disable auto-select preset by model so explicit preset sticks)
        const ecCfg = cards.find(c => c.title && c.title.includes("Configure") && c.title.includes("Entity Cards"));
        assert(ecCfg, "Configure Entity Cards must exist");
        ecCfg.entry = ecCfg.entry
            .replace(/Auto-select preset by model:\s*true/i, "Auto-select preset by model: false")
            .replace(/Active Preset:\s*\w+/i, "Active Preset: " + preset);

        // Request untyped /ec card (forces full 5-type classification prompt!)
        sandbox.text = "/ec The Obsidian Rose Syndicate";
        sandbox.history.push({ text: sandbox.text, type: "do" });
        vm.runInContext('InnerEntity("input");', ctx);
        sandbox.text = "World Lore:\nRecent Story:\nThe Obsidian Rose Syndicate rules the docks.\n> /ec The Obsidian Rose Syndicate";
        vm.runInContext('InnerEntity("context");', ctx);
        sandbox.text = "";
        vm.runInContext('InnerEntity("output");', ctx);

        // Continue turn -> generation fires
        sandbox.text = "";
        sandbox.history.push({ text: "", type: "continue" });
        vm.runInContext('InnerEntity("input");', ctx);
        sandbox.text = "World Lore:\nRecent Story:\nThe Obsidian Rose Syndicate rules the docks.\n";
        vm.runInContext('InnerEntity("context");', ctx);

        const ecTaskCard = cards.find(c => c.title === "\uD83D\uDDC2\uFE0F Entity Cards Task — do not edit");
        assert(ecTaskCard && ecTaskCard.entry.length > 0, `OC Task Card must be active for preset=${preset}`);
        assert(ecTaskCard.entry.length <= 2000,
            `OC Task Card for preset=${preset} exceeded 2000 chars (${ecTaskCard.entry.length})`);
        assert(ecTaskCard.entry.trimEnd().endsWith("</SYSTEM>"),
            `OC Task Card for preset=${preset} must end cleanly with </SYSTEM>`);
        assert(ecTaskCard.entry.includes("'Person'") && ecTaskCard.entry.includes("'Organization'"),
            `OC Task Card for preset=${preset} must include multi-type branches`);
    }
    console.log("   ✔ Test 6 passed: Multi-branch Optimize Context prompts fit <= 2000 chars with intact </SYSTEM> across standard, lite, and authoring presets");
}

// Test 7: Optimize Context multi-turn continuation & toggling Optimize Context OFF cleans up Task Card
{
    const { sandbox, ctx, cards } = createEnv();
    sandbox.info.useCacheEfficient = true;
    sandbox.info.maxChars = 8000;

    sandbox.text = "/ec Neo Tokyo -loc";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n> /ec Neo Tokyo -loc";
    vm.runInContext('InnerEntity("context");', ctx);
    sandbox.text = "";
    vm.runInContext('InnerEntity("output");', ctx);

    // Turn 2: Continue -> AI outputs partial YAML WITHOUT ENTITY_END (forces multi-turn continuation)
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);

    sandbox.text = `ENTITY_BEGIN
entity: Neo Tokyo
type: Location
category: Megacity
atmosphere: Perpetual neon haze blankets the lower wards.`;
    vm.runInContext('InnerEntity("output");', ctx);

    // Turn 3: Continue -> verify OC Task Card switches to continuation format
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerEntity("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);

    const ecTaskCard = cards.find(c => c.title === "\uD83D\uDDC2\uFE0F Entity Cards Task — do not edit");
    assert(ecTaskCard.entry.includes("CONTINUE AFTER THESE LINES"), "Turn 2+ OC Task Card must include continuation section");
    assert(ecTaskCard.entry.includes("category: Megacity"), "Turn 2+ OC Task Card must include previously generated fields");
    assert(ecTaskCard.entry.length <= 2000, "Continuation OC Task Card must fit <= 2000 chars");

    // Now toggle Optimize Context OFF before next context call -> OC Task Card must deactivate!
    sandbox.info.useCacheEfficient = false;
    sandbox.text = "World Lore:\nRecent Story:\nYou arrive in Neo Tokyo.\n";
    vm.runInContext('InnerEntity("context");', ctx);
    assert.strictEqual(ecTaskCard.keys, "", "Toggling useCacheEfficient=false must clear OC Task Card keys");
    assert.strictEqual(ecTaskCard.entry, "", "Toggling useCacheEfficient=false must clear OC Task Card entry");
    console.log("   ✔ Test 7 passed: Multi-turn OC continuation & toggling Optimize Context OFF verified");
}

// Test 8: dist/inner-self-classic.js fallback routes Classic Auto-Cards prompt via Task Card under Optimize Context
{
    const classicCode = fs.readFileSync(path.join(__dirname, '..', 'dist', 'inner-self-classic.js'), 'utf8');
    const cards = [];
    const sandbox = {
        history: [
            { text: "The long journey across the northern wastes begins.", type: "story" },
            { text: "You enter the ancient citadel of Valdris.", type: "story" }
        ],
        storyCards: cards,
        info: { actionCount: 1, useCacheEfficient: true, maxChars: 8000 },
        state: {},
        text: "",
        stop: false,
        console: console,
        log: () => {},
        addStoryCard(...args) {
            let card = (args.length === 1)
                ? { title: args[0], entry: "", keys: "", type: "class", description: "" }
                : { keys: args[0], entry: args[1], type: args[2], title: args[3], description: args[4] };
            cards.push(card);
            return card;
        },
        removeStoryCard(index) { cards.splice(index, 1); }
    };
    sandbox.globalThis = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(classicCode, ctx);

    sandbox.text = "/ac Valdris";
    sandbox.history.push({ text: sandbox.text, type: "do" });
    vm.runInContext('InnerSelf("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou enter the ancient citadel of Valdris.\n> /ac Valdris";
    vm.runInContext('InnerSelf("context");', ctx);
    sandbox.text = "";
    vm.runInContext('InnerSelf("output");', ctx);

    // Continue turn -> Classic Auto-Cards triggers generation under Optimize Context
    sandbox.text = "";
    sandbox.history.push({ text: "", type: "continue" });
    vm.runInContext('InnerSelf("input");', ctx);
    sandbox.text = "World Lore:\nRecent Story:\nYou enter the ancient citadel of Valdris.\n";
    vm.runInContext('InnerSelf("context");', ctx);

    const taskCard = cards.find(c => c.title.includes("Task — do not edit"));
    assert(taskCard && taskCard.keys.length > 0, "Classic build must activate Task Card during AC generation under Optimize Context");
    assert(taskCard.entry.includes("Valdris") && taskCard.entry.includes("<SYSTEM>"),
        "Classic Task Card must carry the Valdris generation prompt");
    assert(taskCard.entry.length <= 2000, "Classic Task Card must fit <= 2000 chars");
    console.log("   ✔ Test 8 passed: dist/inner-self-classic.js routes Classic Auto-Cards prompt via Task Card under Optimize Context");
}

console.log("\n==================================================================");
console.log("  🎉 SUITE 5 PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
