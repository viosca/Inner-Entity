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

console.log("\n==================================================================");
console.log("  🎉 SUITE 5 PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
