# Inner Entity Unit Tests & OpenRouter Benchmarking

This directory contains automated unit tests and a live AI prompt tweaking/benchmarking harness for **Inner Entity** and **Entity Cards**.

---

## 1. Automated Lifecycle Unit Tests

These tests run entirely offline using a mock AI Dungeon runtime environment. They test hook execution, story card creation, mutual exclusion yielding, Optimized Context prompt caching, and backward-compatibility aliases across all three distribution builds.

### Running the Tests

```bash
# Via npm
npm test

# Or directly with Node.js
node unittest/test_lifecycle.js
```

### What Is Tested:
1. **Flagship Inner Entity (`src/library.js`):**
   - Verifies global exports (`InnerEntity`, `InnerSelf`, `AutoCards`, `EntityCards`).
   - Tests `/ec` command handling in `input`.
   - Tests character detection and task injection in `context` (standard and prompt caching modes).
   - Tests thought processing in `output`.
   - Verifies that direct calls to legacy `InnerSelf()` functions work without error.
2. **Classic Inner Self (`dist/inner-self-classic.js`):**
   - Verifies seamless operation with LewdLeah's upstream classic Auto-Cards engine.
3. **Mind-Only Inner Self (`dist/inner-self-minds-only.js`):**
   - Verifies complete isolation (ensuring `AutoCards` is `undefined`).
   - Tests pure character cognition without any card engine code.
4. **Scoped MainSettings Overrides:**
   - Verifies that scenario-level creator settings override local defaults without side effects.

---

## 2. OpenRouter Model Prompt Tweaking Harness

The `test_openrouter.js` script allows you to test and tweak AI generation prompts against real LLMs via [OpenRouter](https://openrouter.ai/). 

This lets you calibrate token consumption against AI Dungeon's default **100-token slider**, evaluate sentinel boundary adherence (`ENTITY_BEGIN`/`ENTITY_END`), check YAML quality, and test new prompt phrasing before shipping.

### Setting Up OpenRouter.ai

1. **Create an OpenRouter Account:**
   - Go to [openrouter.ai](https://openrouter.ai/) and sign in.
2. **Generate an API Key:**
   - Navigate to [openrouter.ai/keys](https://openrouter.ai/keys).
   - Click **Create Key**, give it a name (e.g. `Inner-Entity-Testing`), and copy the key (`sk-or-v1-...`).
3. **Configure the Key in the Repository:**
   - Create a `.env` file in the project root (`c:\git\Inner-Self\.env`):
     ```env
     OPENROUTER_API_KEY=sk-or-v1-your-key-here
     ```
   - *(Note: `.env` is already included in `.gitignore` and will never be committed to Git).*
   - **Alternative (PowerShell environment variable):**
     ```powershell
     $env:OPENROUTER_API_KEY="sk-or-v1-your-key-here"
     ```

### Running the Benchmark Tool

```bash
# Test a single entity type (default: Person / Futaba)
node unittest/test_openrouter.js --type Person

# Test all 5 NER entity types (Person, Location, Organization, Thing, Event)
node unittest/test_openrouter.js --type all

# Test with a custom entity name
node unittest/test_openrouter.js --type Location --entity "Valdor Grand Citadel"

# Test specific AI Dungeon model equivalents
node unittest/test_openrouter.js --type Person --models "deepseek/deepseek-chat,google/gemma-2-27b-it"

# Adjust max tokens limit (default: 110 tokens)
node unittest/test_openrouter.js --type Person --max_tokens 100
```

### Tested Model Tiers

By default, the script benchmarks against models representing AI Dungeon's story engine tiers:

| Tier | OpenRouter Model ID | AI Dungeon Equivalent |
|:---|:---|:---|
| **Lite Tier** | `meta-llama/llama-3.1-8b-instruct` | Fable / Llama 8B |
| **Mid Tier** | `google/gemma-2-27b-it` | Gemma 31B |
| **Frontier Tier** | `deepseek/deepseek-chat` | DeepSeek V3 |

### Interpreting Benchmark Results

When the script runs, it reports:
- **Tokens (comp):** Total completion tokens generated. Must stay comfortably below ~95-100 tokens to ensure the template completes within AI Dungeon's default 100-token slider.
- **Sentinels:** Confirms whether the model respected `ENTITY_BEGIN` and `ENTITY_END` sentinels.
- **Code Fences:** Checks if the model output markdown code blocks (e.g. ` ```yaml `). The parser strips them automatically, but clean output is preferred.
- **Blank Keys:** Checks for empty YAML fields (e.g. `drive:` with no value).
