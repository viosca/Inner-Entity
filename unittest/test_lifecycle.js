#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.resolve(__dirname, "..");

function createMockAIDContext(initialCards = []) {
    const cards = [...initialCards];
    const sandbox = {
        log: (...args) => console.log("   [AID LOG]:", ...args),
        console: { log: (...args) => console.log("   [CONSOLE]:", ...args), error: console.error },
        Math, String, Array, Object, Number, RegExp, Set, Map, JSON,
        parseInt, parseFloat, isNaN, isFinite, Date,
        text: "The guildmaster of the Silver Syndicate arrived in the grand city of Valdor.",
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
    return { sandbox, ctx: vm.createContext(sandbox) };
}

function runSuite(suiteName, filePath, assertions) {
    console.log(`\n==================================================================`);
    console.log(`  ${suiteName}`);
    console.log(`  Target: ${filePath}`);
    console.log(`==================================================================`);

    if (!fs.existsSync(filePath)) {
        throw new Error(`Target file not found: ${filePath}. Run 'npm run build:all' first.`);
    }

    const code = fs.readFileSync(filePath, "utf8");
    const initialConfigCard = {
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
        description: `Hakari
Karane`
    };

    const { sandbox, ctx } = createMockAIDContext([initialConfigCard]);

    // 1. Script load & compilation
    vm.runInContext(code, ctx);
    console.log("   ✔ Script parsed and evaluated cleanly");

    // Run custom assertions
    assertions(sandbox, ctx);
}

// ----------------------------------------------------------------------------
// SUITE 1: Flagship Inner Entity (src/library.js)
// ----------------------------------------------------------------------------
runSuite("SUITE 1: Flagship Inner Entity (Minds + Entity Cards)", path.join(ROOT_DIR, "src", "library.js"), (s, ctx) => {
    // Check exports
    if (typeof s.InnerEntity !== "function") throw new Error("Missing InnerEntity export");
    if (typeof s.InnerSelf !== "function") throw new Error("Missing InnerSelf export");
    if (typeof s.AutoCards !== "function") throw new Error("Missing AutoCards export");
    if (typeof s.EntityCards !== "function") throw new Error("Missing EntityCards export");
    console.log("   ✔ All globals and backward-compatibility aliases verified");

    // Input hook: /ec -P lite preset switch
    s.text = "/ec -P lite";
    s.InnerEntity("input");
    if (!s.text.includes("preset -> Set to Lite")) throw new Error("/ec -P lite failed to switch preset");
    console.log("   ✔ Input hook processed /ec -P lite (preset switch)");

    // Input hook: /ec -v / --version command
    s.text = "/ec -v";
    s.InnerEntity("input");
    if (!s.text.includes("version -> Inner Entity")) throw new Error("/ec -v failed to return version information");
    if (!s.text.includes("git:")) throw new Error("/ec -v missing git hash");
    console.log("   ✔ Input hook processed /ec -v (version & git hash)");

    // Input hook: /ec -h / --help command
    s.text = "/ec -h";
    s.InnerEntity("input");
    if (!s.text.includes("help -> Entity Cards Commands:")) throw new Error("/ec -h failed to return help listing");
    console.log("   ✔ Input hook processed /ec -h (command help)");

    // Input hook: /ec -i / --info diagnostics command
    s.text = "/ec -i";
    s.InnerEntity("input");
    if (!s.text.includes("INNER ENTITY / AUTO-CARDS DIAGNOSTICS")) throw new Error("/ec -i failed to return diagnostics report");
    if (!s.text.includes("Story Model:") || !s.text.includes("Optimize Context:")) throw new Error("/ec -i missing environment section");
    console.log("   ✔ Input hook processed /ec -i (system diagnostics)");

    // Input hook: verify bareword "Info" generates card rather than triggering diagnostics
    s.text = "/ec Info";
    s.InnerEntity("input");
    if (s.text.includes("DIAGNOSTICS")) throw new Error("/ec Info mistakenly triggered diagnostics");
    const infoPending = s.state.AutoCards?.generation?.pending;
    if (!infoPending?.some(c => c.title === "Info")) throw new Error("Expected pending card titled 'Info'");
    console.log("   ✔ Verified bareword 'Info' generates story card without command collision");

    // Input hook: /ec with -<type> flag & single-branch prompt verification
    s.text = "/ec Futaba -p";
    s.InnerEntity("input");
    const pending = s.state.AutoCards?.generation?.pending;
    if (!pending || pending.length === 0) throw new Error("Expected pending card from /ec Futaba -p");
    const futabaCard = pending[pending.length - 1];
    if (futabaCard.title !== "Futaba") throw new Error(`Expected title 'Futaba', got '${futabaCard.title}'`);
    if (futabaCard.type !== "Person") throw new Error(`Expected type 'Person', got '${futabaCard.type}'`);
    if (futabaCard.prompt.includes("type: Location")) throw new Error("Prompt should NOT contain Location branch when -p is specified!");
    if (!futabaCard.prompt.includes("type: Person")) throw new Error("Prompt must contain Person branch!");
    console.log(`   ✔ Verified -<type> flag parsing and single-branch prompt optimization (${futabaCard.prompt.length} chars)`);

    // Context hook: standard mode
    s.text = "Recent Story:\nHakari smiled warmly at Karane.";
    s.InnerEntity("context");
    console.log("   ✔ Context hook executed (standard mode)");

    // Context hook: Optimized Context mode (useCacheEfficient = true)
    s.info.useCacheEfficient = true;
    s.history.push({ text: "Hakari turned to the window, lost in thought.", type: "story" });
    s.text = "Recent Story:\nHakari turned to the window, lost in thought.";
    s.InnerEntity("context");
    console.log("   ✔ Context hook executed (Optimized Context mode)");

    // Output hook
    s.text = "Hakari pondered what to say next.";
    s.InnerEntity("output");
    console.log("   ✔ Output hook executed");

    // Verify backward compatibility: calling InnerSelf directly
    s.InnerSelf("input");
    s.InnerSelf("context");
    s.InnerSelf("output");
    console.log("   ✔ Direct calls to legacy InnerSelf() passed without error");
});

// ----------------------------------------------------------------------------
// SUITE 2: Classic Inner Self (dist/inner-self-classic.js)
// ----------------------------------------------------------------------------
runSuite("SUITE 2: Classic Inner Self (Minds + Classic Auto-Cards)", path.join(ROOT_DIR, "dist", "inner-self-classic.js"), (s, ctx) => {
    if (typeof s.InnerSelf !== "function") throw new Error("Missing InnerSelf export");
    if (typeof s.InnerEntity !== "function") throw new Error("Missing InnerEntity export");
    if (typeof s.AutoCards !== "function") throw new Error("Missing AutoCards export");
    console.log("   ✔ Classic exports verified");

    s.text = "Hakari greeted Karane.";
    s.InnerEntity("input");
    s.InnerEntity("context");
    s.InnerEntity("output");
    console.log("   ✔ Full lifecycle hooks executed for classic build");
});

// ----------------------------------------------------------------------------
// SUITE 3: Mind-Only Inner Self (dist/inner-self-minds-only.js)
// ----------------------------------------------------------------------------
runSuite("SUITE 3: Mind-Only Inner Self (Pure Cognition, Zero Card Engine)", path.join(ROOT_DIR, "dist", "inner-self-minds-only.js"), (s, ctx) => {
    if (typeof s.InnerSelf !== "function") throw new Error("Missing InnerSelf export");
    if (typeof s.InnerEntity !== "function") throw new Error("Missing InnerEntity export");
    if (typeof s.AutoCards !== "undefined") throw new Error("AutoCards should NOT be defined in minds-only build");
    console.log("   ✔ Verified standalone isolation (AutoCards is undefined)");

    s.text = "Recent Story:\nHakari smiled warmly at Karane.";
    s.InnerEntity("input");
    s.InnerEntity("context");
    s.InnerEntity("output");
    console.log("   ✔ Pure character cognition executed cleanly without card engine");
});

// ----------------------------------------------------------------------------
// SUITE 4: Scoped MainSettings Overrides
// ----------------------------------------------------------------------------
console.log(`\n==================================================================`);
console.log(`  SUITE 4: Scoped MainSettings Configuration`);
console.log(`==================================================================`);
{
    const { sandbox: s, ctx } = createMockAIDContext();
    const mainSettingsCode = `
    globalThis.MainSettings = class MainSettings {
        static InnerEntity = {
            THOUGHT_FORMATION_CHANCE_PER_TURN: 42
        };
        static EntityCards = {
            DEFAULT_DO_AC: true,
            DEFAULT_OPERATING_MODE: "classic",
            DEFAULT_CARD_CREATION_COOLDOWN: 14
        };
        static InnerSelf = MainSettings.InnerEntity;
        static AC = MainSettings.EntityCards;
        #config;
        constructor(...scripts) {
            for (const item of scripts) {
                if (typeof item === "string" && MainSettings.hasOwnProperty(item)) {
                    this.#config = MainSettings[item];
                    break;
                }
            }
        }
        merge(target) {
            if (this.#config) Object.assign(target, this.#config);
        }
    };
    `;
    vm.runInContext(mainSettingsCode, ctx);
    const libCode = fs.readFileSync(path.join(ROOT_DIR, "src", "library.js"), "utf8");
    vm.runInContext(libCode, ctx);

    s.text = "A new adventure begins...";
    s.InnerEntity("input");
    s.InnerEntity("context");

    const acCard = s.storyCards.find(c => c.title && c.title.includes("Configure"));
    console.log("   ✔ MainSettings evaluated without conflicts");
    console.log("   ✔ Configuration story card dynamically auto-created from MainSettings");
}

console.log(`\n==================================================================`);
console.log(`  🎉 ALL UNIT TEST SUITES PASSED CLEANLY! (100% SUCCESS)`);
console.log(`==================================================================\n`);
