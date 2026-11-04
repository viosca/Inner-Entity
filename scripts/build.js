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

async function loadEngine(engine) {
    if (engine === "minds" || engine === "none") {
        return null;
    }

    if (engine === "ac") {
        console.log("   Fetching LewdLeah/Auto-Cards upstream via HTTPS...");
        return await fetchHttps(AC_REMOTE_URL);
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
    let outPath;

    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    if (engine === "minds" || engine === "none") {
        combined = `${coreCode}\n`;
        outPath = path.join(DIST_DIR, "inner-self-minds-only.js");
    } else {
        const engineCode = (await loadEngine(engine)).trimStart();
        combined = `${coreCode}\n\n// ============================================================================\n// BUNDLED CARD ENGINE (${engine.toUpperCase()})\n// ============================================================================\n\n${engineCode}\n`;
        outPath = (engine === "ac") ? path.join(DIST_DIR, "inner-self-classic.js") : OUTPUT_PATH;
    }

    // Syntax validation
    try {
        new vm.Script(combined);
        console.log("   ✔ Syntax validation passed");
    } catch (err) {
        console.error("   ✖ Syntax validation FAILED:", err);
        process.exit(1);
    }

    fs.writeFileSync(outPath, combined, "utf8");
    const lineCount = combined.split("\n").length;
    const sizeKb = (Buffer.byteLength(combined, "utf8") / 1024).toFixed(1);

    console.log(`   ✔ Wrote ${path.relative(ROOT_DIR, outPath)} (${lineCount.toLocaleString()} lines, ${sizeKb} KB)`);
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
        console.log("Building all 3 distribution targets...\n");
        await buildTarget("ec");
        await buildTarget("ac");
        await buildTarget("minds");
        console.log("All 3 targets built successfully!");
    } else {
        await buildTarget(engine);
    }
}

main().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
});
