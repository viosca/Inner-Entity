#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const vm = require("vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const CORE_PATH = path.join(ROOT_DIR, "src", "core.js");
const OUTPUT_PATH = path.join(ROOT_DIR, "src", "library.js");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const EC_SUBMODULE_PATH = path.join(ROOT_DIR, "submodules", "Entity-Cards", "src", "library.js");
const EC_SIBLING_PATH1 = path.join(ROOT_DIR, "..", "Auto-Cards", "src", "library.js");
const EC_SIBLING_PATH2 = path.join(ROOT_DIR, "..", "Entity-Cards", "src", "library.js");
const EC_REMOTE_URL = "https://raw.githubusercontent.com/viosca/Entity-Cards/main/src/library.js";
const AC_REMOTE_URL = "https://raw.githubusercontent.com/LewdLeah/Auto-Cards/main/src/library.js";

function fetchHttps(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchHttps(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
            }
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => resolve(data));
        }).on("error", reject);
    });
}

function bridgeClassicAutoCards(rawCode) {
    console.log("   Bridging upstream Auto-Cards for Inner-Self & MainSettings compatibility...");
    let code = rawCode;

    // 1. Scoped let instead of const DEFAULT_
    code = code.replace(/const DEFAULT_/g, "let DEFAULT_");

    // 2. Insert MainSettings override block before divider
    const divider = "//—————————————————————————————————————————————————————————————————————————————————";
    const msBlock = `
    // Main settings override local settings
    if (typeof globalThis.MainSettings === "function") {
        const _ovr = {};
        new MainSettings("AutoCards", "AC").merge(_ovr);
        for (const [k, v] of Object.entries(_ovr)) {
            try { eval(k + " = v;"); } catch (e) { /* ignore non-existent settings */ }
        }
    }
${divider}`;

    if (code.includes(divider)) {
        code = code.replace(divider, msBlock);
    }

    // 3. Align cache cap to 30000 for QuickJS memory optimization
    code = code.replace("if (50000 < memoized.size) {", "if (30000 < memoized.size) {");

    // 4. Update trailing invocation and global export
    const trailingOld = "} AutoCards(null); function isolateLSIv2(code, log, text, stop) { const console = Object.freeze({log}); try { eval(code); return [null, text, stop]; } catch (error) { return [error, text, stop]; } }";
    const trailingNew = `}
if (typeof globalThis.InnerSelf !== "function" && typeof globalThis.InnerEntity !== "function") {
    AutoCards(null);
}
globalThis.AutoCards = AutoCards;
globalThis.EntityCards = AutoCards;
function isolateLSIv2(code, log, text, stop) { const console = Object.freeze({log}); try { eval(code); return [null, text, stop]; } catch (error) { return [error, text, stop]; } }`;

    if (code.includes(trailingOld)) {
        code = code.replace(trailingOld, trailingNew);
    } else {
        code = code.replace(/} AutoCards\(null\);[\s\S]*$/, trailingNew);
    }

    return code;
}

async function loadEngine(engine) {
    if (engine === "minds" || engine === "none") {
        return null;
    }

    if (engine === "ac") {
        console.log("   Fetching LewdLeah/Auto-Cards upstream via HTTPS...");
        const rawAC = await fetchHttps(AC_REMOTE_URL);
        return bridgeClassicAutoCards(rawAC);
    }

    // Default: Entity-Cards (via submodule, sibling repo, or HTTPS)
    if (fs.existsSync(EC_SUBMODULE_PATH) && fs.statSync(EC_SUBMODULE_PATH).size > 1000) {
        console.log(`   Loading Entity-Cards from submodule: ${path.relative(ROOT_DIR, EC_SUBMODULE_PATH)}`);
        return fs.readFileSync(EC_SUBMODULE_PATH, "utf8");
    }
    if (fs.existsSync(EC_SIBLING_PATH1)) {
        console.log(`   Loading Entity-Cards from sibling repo: ${EC_SIBLING_PATH1}`);
        return fs.readFileSync(EC_SIBLING_PATH1, "utf8");
    }
    if (fs.existsSync(EC_SIBLING_PATH2)) {
        console.log(`   Loading Entity-Cards from sibling repo: ${EC_SIBLING_PATH2}`);
        return fs.readFileSync(EC_SIBLING_PATH2, "utf8");
    }

    console.log("   Submodule empty or not initialized. Fetching viosca/Entity-Cards via HTTPS...");
    return await fetchHttps(EC_REMOTE_URL);
}

async function buildTarget(engine) {
    console.log(`=== Building Inner-Entity (Engine: ${engine.toUpperCase()}) ===`);

    if (!fs.existsSync(CORE_PATH)) {
        console.error(`Error: Core file not found at ${CORE_PATH}`);
        process.exit(1);
    }

    console.log(`   Reading core: ${path.relative(ROOT_DIR, CORE_PATH)}`);
    const coreCode = fs.readFileSync(CORE_PATH, "utf8").trimEnd();

    let combined;
    let outPaths = [];

    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    if (engine === "minds" || engine === "none") {
        combined = `${coreCode}\n`;
        outPaths = [path.join(DIST_DIR, "inner-self-minds-only.js")];
    } else if (engine === "ac") {
        const engineCode = (await loadEngine(engine)).trimStart();
        combined = `${coreCode}\n\n// ============================================================================\n// BUNDLED CARD ENGINE (CLASSIC AUTO-CARDS)\n// ============================================================================\n\n${engineCode}\n`;
        outPaths = [path.join(DIST_DIR, "inner-self-classic.js")];
    } else {
        const engineCode = (await loadEngine(engine)).trimStart();
        combined = `${coreCode}\n\n// ============================================================================\n// BUNDLED CARD ENGINE (ENTITY-CARDS)\n// ============================================================================\n\n${engineCode}\n`;
        // Flagship outputs to BOTH src/library.js (AID tab standard) and dist/inner-entity.js (dist lineup)
        outPaths = [OUTPUT_PATH, path.join(DIST_DIR, "inner-entity.js")];
    }

    // Syntax validation
    try {
        new vm.Script(combined);
        console.log("   ✔ Syntax validation passed");
    } catch (err) {
        console.error("   ✖ Syntax validation FAILED:", err);
        process.exit(1);
    }

    const lineCount = combined.split("\n").length;
    const sizeKb = (Buffer.byteLength(combined, "utf8") / 1024).toFixed(1);

    for (const p of outPaths) {
        fs.writeFileSync(p, combined, "utf8");
        console.log(`   ✔ Wrote ${path.relative(ROOT_DIR, p)} (${lineCount.toLocaleString()} lines, ${sizeKb} KB)`);
    }
    console.log("=== Target complete! ===\n");
}

async function main() {
    const args = process.argv.slice(2);
    let isAll = false;
    let engine = "ec";

    for (const arg of args) {
        if (arg === "--all") isAll = true;
        else if (arg.startsWith("--engine=")) engine = arg.split("=")[1].toLowerCase();
        else if (arg === "--ac") engine = "ac";
        else if (arg === "--ec") engine = "ec";
        else if (arg === "--minds" || arg === "--none") engine = "minds";
    }

    if (isAll) {
        console.log("Building all distribution targets...\n");
        await buildTarget("ec");
        await buildTarget("ac");
        await buildTarget("minds");
        console.log("All targets built successfully!");
    } else {
        await buildTarget(engine);
    }
}

main().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
});
