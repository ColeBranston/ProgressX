import { MICRONUTRIENT_DEFS } from "@/app/internal_components/mydiet/microNutrients"
import { OverviewResult, OverviewSource } from "./googleOverview"
import { FoodMatch } from "./foodDatabase"

// The diet assistant: a local Gemma model (via Ollama) that works out the nutrition of a food the
// user describes loosely ("about a bowl of beef stew"). It never logs anything itself - it proposes
// an entry, and the user confirms it on the diet page.
//
// Numbers come from the in-house food database (USDA FoodData Central + Canadian Nutrient File, see
// foodDatabase.ts). Optionally, when SERPAPI_API_KEY is set, it can also read Google's AI Overview for
// foods the database doesn't have (restaurant items and the like).
//
// Small models are unreliable at filling big tool calls, so the work is split:
//  1. the chat model talks to the user, searches, and calls propose_food_entry(food_id, amount)
//  2. a separate call with a JSON schema (constrained decoding) picks the portion and how many
//     (or, for Google results, copies the numbers out of the text); the server does the maths.

export type ChatMessage = {
    role: "user" | "assistant" | "tool"
    content: string
    tool_calls?: { function: { name: string, arguments: Record<string, unknown> } }[]
    tool_name?: string
}

export type Nutrition = {
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
    fiberG: number
    micronutrients: Record<string, number>
}

// A way of measuring the food: the nutrition for one of these is `base` x multiplier
export type ServingOption = { label: string, multiplier: number }

export type FoodProposal = {
    name: string
    // what the user said they had, e.g. "about a bowl"
    amount: string
    // how far to trust the numbers, and how they were worked out in plain words. Both are built by
    // the server from what actually happened (match quality, how the amount was read), not by the model
    accuracy: "high" | "medium" | "low"
    explanation: string[]
    // where the numbers came from (filled in by the server, never by the model)
    basis: "database" | "link" | "pasted" | "photo" | "ai_overview" | "search" | "estimate"
    sourceLabel: string
    // the database entry used, e.g. "Stew, beef"
    matchedName: string | null
    base: Nutrition
    options: ServingOption[]
    optionIndex: number
    quantity: number
    sources: OverviewSource[]
}

export const FOOD_SEARCH_TOOL = "search_foods"
export const PAGE_TOOL = "read_food_page"
// food_id the model passes to propose a food from a page it read
export const PAGE_FOOD_ID = "page"
// food_id for nutrition facts the user pasted into the chat
export const PASTED_FOOD_ID = "pasted"
export const GOOGLE_TOOL = "google_ai_overview"
export const PROPOSE_TOOL = "propose_food_entry"

export function systemPrompt(today: string, googleEnabled: boolean): string {
    return `You are the nutrition assistant inside ProgressX, a fitness app. Today is ${today}.
The user tells you what they ate, often roughly (e.g. "about a bowl of beef stew"), and you put it on a card for their food log.

Where the numbers come from, in this order:
a. Numbers the user gives (calories, protein, carbs, fat, any micronutrient) always win. Never search the database for a food whose numbers they gave, and never replace their numbers with database ones.
b. A link the user gives (recipe, menu item, product page) or a label photo.
c. Only when they give neither: the food database.

How to work:
1. A rough amount like "a bowl", "a plate", "a serving" or "two slices" is fine - don't ask about it. Only if you can't tell what the food is (e.g. "some food"), ask ONE short question.
2. Call ${FOOD_SEARCH_TOOL} with a few plain words for the food, e.g. "beef stew", "pepperoni pizza", "chicken curry rice". Each result line is: id | name | kcal per 100 g | portions.
3. Pick the result that best matches what they ate (prefer plain, everyday versions unless they said otherwise). If nothing fits, search again with different words (at most 3 searches).${googleEnabled ? `
   If the database clearly doesn't have it (e.g. a specific restaurant item), call ${GOOGLE_TOOL} instead.` : ""}
   If the user gave nutrition numbers themselves (e.g. "Calories 120, Fat 2 g, Carbs 24 g", "450 cal 35p 40c 15f", "30g protein and 200 calories"), don't search: call ${PROPOSE_TOOL} with food_id "${PASTED_FOOD_ID}" and the numbers will be read from their messages.
   If the user gave a link to the food (a recipe, menu item or product page), call ${PAGE_TOOL} with it instead of searching, then use food_id "${PAGE_FOOD_ID}".
4. Call ${PROPOSE_TOOL} with the chosen id as food_id and the amount the user ate in their words. The app works out the numbers and shows the user a card to confirm. Don't write nutrition numbers in your message.
5. If they ate several foods ("a banana and a cup of yogurt"), do steps 2-4 for each food separately, one card per food. Drinks with add-ins are separate foods too: a "double double" is brewed coffee + 2 cream + 2 sugar.
If the database doesn't have the food, say so${googleEnabled ? " (or try Google)" : ""} and ask what's in it - never propose a different food.

Nothing is logged until the user presses "Add to log" on a card, so never say a food was added or logged; say you've put it on a card for them to check.
Keep messages short and friendly, plain text. When the user corrects or adds detail ("it was a big bowl", "it had potatoes", "it was canned"), search again if the food changed, then call ${PROPOSE_TOOL} again.
Only help with food and nutrition; politely decline anything else.`
}

type Tool = { type: "function", function: { name: string, description: string, parameters: Record<string, unknown> } }

export function tools(googleEnabled: boolean): Tool[] {
    const list: Tool[] = [
        {
            type: "function",
            function: {
                name: FOOD_SEARCH_TOOL,
                description: "Search the food database (USDA and Health Canada). Returns up to 8 foods: id | name | kcal per 100 g | portions.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "A few plain words for the food, e.g. 'beef stew'" },
                    },
                    required: ["query"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: PROPOSE_TOOL,
                description: "Show the user a food log entry to confirm.",
                parameters: {
                    type: "object",
                    properties: {
                        food_id: { type: "string", description: "The id of the chosen search result, e.g. 'survey-2706592'" },
                        name: { type: "string", description: "Short food name for the log, e.g. 'Beef stew'" },
                        amount: { type: "string", description: "How much the user ate, in their words, e.g. 'about a bowl', '2 slices', '300 g'" },
                    },
                    required: ["food_id", "name", "amount"],
                },
            },
        },
    ]
    list.push({
        type: "function",
        function: {
            name: PAGE_TOOL,
            description: "Read the nutrition facts from a link the user gave (a recipe, a restaurant menu item, a product page). Only links the user wrote can be read.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The link exactly as the user wrote it" },
                },
                required: ["url"],
            },
        },
    })
    if (googleEnabled) {
        list.push({
            type: "function",
            function: {
                name: GOOGLE_TOOL,
                description: "Search Google and return its AI Overview, for foods the database doesn't have (e.g. restaurant items).",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "e.g. 'Tim Hortons medium double double nutrition facts'" },
                    },
                    required: ["query"],
                },
            },
        })
    }
    return list
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places

// ---------- database foods: picking the portion ----------

export const GRAMS_OPTION = "grams"

// Typical amounts for vague descriptions, shared with the Google path
const TYPICAL_SIZES = "Typical sizes if they were vague: a bowl of soup, stew or cereal is about 1.5 cups; a big bowl about 2 cups; a plate of pasta or rice about 2 cups; a handful of nuts about 1 oz (28 g)."

function portionLabels(match: FoodMatch): string[] {
    return [...new Set(match.portions.map((p) => p.label))]
}

// Asked before any database match is shown: small models know "a double double" is coffee, but
// shown a "Double hamburger" next to it they'll happily agree that's the same thing
// Uses only the user's own words (the chat model tends to rename the food after whatever it found).
// A free-text answer: asked for JSON, small models just echo the words back instead of explaining them.
export function describePrompt(userSaid: string[]): string {
    return `The user said they ate: ${userSaid.map((text) => `"${text}"`).join(" / ")}
In one short sentence, what food or drink is that and what is in it? Explain any slang, brands or nicknames.`
}

// match comes first: a wrong one (a hamburger for "a double double") is rejected before any maths
export const MATCH_LEVELS = ["same", "similar", "different"] as const
export type MatchLevel = typeof MATCH_LEVELS[number]

export function portionSchema(match: FoodMatch) {
    return {
        type: "object",
        properties: {
            match: { type: "string", enum: [...MATCH_LEVELS] },
            differences: { type: "string" },
            portion: { type: "string", enum: [...portionLabels(match), GRAMS_OPTION] },
            quantity: { type: "number" },
        },
        required: ["match", "differences", "portion", "quantity"],
    }
}

// A weight stated outright ("300g", "6 oz", "half a pound") is used as is rather than left to the model
export function statedGrams(amount: string): number | null {
    const text = amount.toLowerCase().replace(/half an? /g, "0.5 ").replace(/quarter (of )?an? /g, "0.25 ")
    const found = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|gr|oz|ounces?|lbs?|pounds?)\b/)
    if (!found) return null
    const value = parseFloat(found[1])
    const unit = found[2]
    const grams = unit.startsWith("k") ? value * 1000 : unit.startsWith("o") ? value * 28.35 : unit.startsWith("l") || unit.startsWith("p") ? value * 453.6 : value
    return grams > 0 && grams <= 5000 ? Math.round(grams) : null
}

export function portionPrompt(amount: string, userSaid: string[], plainFoods: string, match: FoodMatch): string {
    const portions = match.portions.map((p) => `- "${p.label}" = ${p.grams} g`).join("\n")
    return `What the user said: ${userSaid.map((text) => `"${text}"`).join(" / ")}
What that is: ${plainFoods}
Database food: "${match.name}". Amount, in their words: "${amount}".

match: how well "${match.name}" fits one of the foods they mentioned (or one part of it, e.g. the cream in a coffee with cream):
- "same": the same food, in a plain or typical version.
- "similar": the same kind of dish but not quite what they described, e.g. it's missing an ingredient they mentioned, or is made differently (beef stew vs "beef stew with potatoes and dumplings", fried vs grilled chicken).
- "different": a different food or drink, or it adds a main ingredient they didn't mention (coffee vs a hamburger, a banana vs banana bread, plain yogurt vs yogurt with oats).
differences: if "similar", what's different in a few words (e.g. "no dumplings in this entry"); otherwise "".

Portion sizes for this food:
${portions || "(none listed)"}
- "${GRAMS_OPTION}" = 1 g

Choose the portion that matches how they described the amount, and quantity = how many of that portion they ate (e.g. 2 for "two slices" with "1 slice"; 1.5 for "a bowl" with "1 cup").
If they gave a weight, use "${GRAMS_OPTION}" and the number of grams (1 oz = 28 g, 1 lb = 454 g).
"1 typical serving" means an average portion; use it when they said "a serving" or gave no amount.
${TYPICAL_SIZES}`
}

function nutritionFrom(per100g: Record<string, number>): Nutrition {
    const micronutrients: Record<string, number> = {}
    for (const def of MICRONUTRIENT_DEFS) {
        const value = per100g[def.name]
        if (def.name !== "Fibre" && typeof value === "number" && value > 0) micronutrients[def.name] = round(value, 4)
    }
    const fiberG = Math.max(0, per100g.fiberG ?? 0)
    // the Micros panel tracks fibre separately from the macro field; keep them in step
    if (fiberG > 0) micronutrients.Fibre = fiberG
    return {
        calories: Math.max(0, per100g.calories ?? 0),
        proteinG: Math.max(0, per100g.proteinG ?? 0),
        carbsG: Math.max(0, per100g.carbsG ?? 0),
        fatsG: Math.max(0, per100g.fatsG ?? 0),
        fiberG,
        micronutrients,
    }
}

// "slices" -> "slice", "dishes" -> "dish", "potatoes" -> "potato"
const stem = (word: string) => word.replace(/(?<=(?:s|x|z|ch|sh|o))es$/, "").replace(/(?<!s)s$/, "")
const wordsOf = (text: string) => new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map(stem))
const NOT_FOOD_WORDS = new Set(["and", "with", "the", "for", "made", "some", "homemade", "style", "plain", "food", "dish", "meal", "fresh"].map(stem))

// Words from the search that the matched entry doesn't have ("kimchi" for "beef and kimchi stew" -> "Stew, beef")
export function missingWords(query: string, match: FoodMatch): string[] {
    const have = new Set([...wordsOf(match.name), ...wordsOf(match.category)])
    return [...wordsOf(query)].filter((w) => !NOT_FOOD_WORDS.has(w) && !have.has(w))
}

// ---------- amount maths (never left to the model) ----------

const UNICODE_FRACTIONS: Record<string, string> = { "½": " 1/2", "⅓": " 1/3", "⅔": " 2/3", "¼": " 1/4", "¾": " 3/4", "⅛": " 1/8" }
const UNIT_ALIASES: Record<string, string> = {
    cups: "cup", c: "cup", tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
    slices: "slice", pieces: "piece", pcs: "piece", bars: "bar", cookies: "cookie", biscuits: "biscuit", crackers: "cracker",
    servings: "serving", portions: "serving", portion: "serving", eggs: "egg", scoops: "scoop", packets: "packet", pouches: "pouch",
    cans: "can", bottles: "bottle", ml: "ml", millilitres: "ml", milliliters: "ml", l: "l", litre: "l", liter: "l",
    oz: "oz", ounce: "oz", ounces: "oz", g: "g", gram: "g", grams: "g", gr: "g", kg: "kg", lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
}
const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, quarter: 0.25 }

// "about 1 1/2 cups" -> { qty: 1.5, unit: "cup" }; "a cup" -> 1 cup; "3/4 cup (30 g)" -> 0.75 cup, grams 30
export function parseAmount(text: string): { qty: number, unit: string, grams: number | null } | null {
    let t = text.toLowerCase()
    for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) t = t.replaceAll(glyph, ascii)
    const gramsInBrackets = t.match(/\((\d+(?:\.\d+)?)\s*g\)/)
    const grams = gramsInBrackets ? parseFloat(gramsInBrackets[1]) : null
    t = t.replace(/\(.*?\)/g, " ")
    const found = t.match(/(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:\.\d+)?)|\b(a|an|one|two|three|four|five|six|half|quarter)\b)\s*(?:of\s+an?\s+|an?\s+)?([a-z]+)/)
    if (!found) return null
    const qty = found[1] ? +found[1] + +found[2] / +found[3]
        : found[4] ? +found[4] / +found[5]
        : found[6] ? parseFloat(found[6])
        : WORD_NUMBERS[found[7]]
    const word = found[8]
    const unit = UNIT_ALIASES[word] ?? word.replace(/(?<=(?:s|x|z|ch|sh|o))es$/, "").replace(/(?<!s)s$/, "")
    if (!Number.isFinite(qty) || qty <= 0) return null
    return { qty, unit: unit === "g" ? "g" : unit, grams: unit === "g" ? qty : grams }
}

const TO_GRAMS: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 }

// How many reference servings the user's amount is, when that can be worked out exactly
export function servingsFromAmount(amount: string, reference: string): number | null {
    const said = parseAmount(amount)
    if (!said) return null
    const ref = parseAmount(reference)
    if (said.unit === "serving") return said.qty
    if (said.unit in TO_GRAMS) {
        const refGrams = ref?.grams ?? (ref && ref.unit in TO_GRAMS ? ref.qty * TO_GRAMS[ref.unit] : null)
        return refGrams ? (said.qty * TO_GRAMS[said.unit]) / refGrams : null
    }
    if (ref && ref.unit === said.unit) return said.qty / ref.qty
    return null
}

const VAGUE_WORDS = /\b(about|around|roughly|approximately|approx|maybe|like|some|bit|few|couple|big|large|small|little|huge|heaping|half|bowl|plate|handful)\b/i
const NUMBER_WORDS: Record<string, string> = { a: "1", an: "1", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6" }

// How the amount was decided: said outright as a weight, counted in one of the food's own portions
// ("2 slices" with "1 slice"), or estimated from a vague description ("a bowl", "some")
function amountBasis(amount: string, portionLabel: string | null): "stated" | "counted" | "estimated" {
    if (!/[a-z0-9]/i.test(amount)) return "estimated" // they didn't say
    if (statedGrams(amount)) return "stated"
    if (!portionLabel || VAGUE_WORDS.test(amount)) return "estimated"
    // "2 servings" of a label's serving, or the same unit as it ("1.5 cups" of "3/4 cup")
    if (servingsFromAmount(amount, portionLabel) !== null) return "counted"
    const said = amount.toLowerCase().replace(/\b(a|an|one|two|three|four|five|six)\b/g, (w) => NUMBER_WORDS[w])
    // "a grande", "grande": one of that size
    const hasCount = /\d/.test(said) || said.trim().split(/\s+/).length <= 2
    const shared = [...wordsOf(said)].some((w) => wordsOf(portionLabel).has(w))
    return hasCount && shared ? "counted" : "estimated"
}

export function proposalFromDatabase(
    food: { name: string, amount: string },
    match: FoodMatch,
    choice: Record<string, unknown>,
    opts: { looseSearch: boolean, searchQuery: string },
): FoodProposal {
    // nutrition is stored per 100 g, so a portion's multiplier is its weight / 100
    const options: ServingOption[] = []
    for (const label of portionLabels(match)) {
        const grams = match.portions.find((p) => p.label === label)!.grams
        options.push({ label: `${label} (${round(grams, 0)} g)`, multiplier: grams / 100 })
    }
    options.push({ label: "g", multiplier: 0.01 })

    const labels = portionLabels(match)
    const grams = statedGrams(food.amount)
    let optionIndex = grams || choice.portion === GRAMS_OPTION ? options.length - 1 : labels.indexOf(String(choice.portion))
    if (optionIndex < 0) optionIndex = options.length > 1 ? 0 : options.length - 1
    const isGrams = optionIndex === options.length - 1
    const quantity = grams ?? Number(choice.quantity)
    const safeQuantity = round(Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, isGrams ? 5000 : 50) : isGrams ? 100 : 1)

    // ---- how much to trust it, and why ----
    const missing = opts.searchQuery ? missingWords(opts.searchQuery, match) : []
    const level: MatchLevel = choice.match === "similar" || opts.looseSearch || missing.length > 0 ? "similar" : "same"
    const differences = [
        missing.length ? `this entry doesn't include ${missing.join(", ")}` : "",
        String(choice.differences ?? "").trim().replace(/\.$/, "").slice(0, 160),
    ].filter(Boolean).join("; ")
    const basis = amountBasis(food.amount, isGrams ? null : labels[optionIndex])
    const totalGrams = Math.round(options[optionIndex].multiplier * 100 * safeQuantity)
    const said = food.amount.trim() || "your description"

    const explanation: string[] = []
    if (level === "same") {
        explanation.push(`Matched "${match.name}" in ${match.source}.`)
    } else {
        explanation.push(`There's no exact entry for what you described, so this uses the closest one: "${match.name}" (${match.source}).`)
        if (opts.looseSearch) explanation.push("No entry contained all the words you used, so it's a partial match.")
        if (differences) explanation.push(`Difference: ${differences}. Add more detail, or adjust before adding if that matters.`)
    }
    if (basis === "stated") {
        explanation.push(`Amount: ${totalGrams} g, as you said.`)
    } else if (basis === "counted") {
        explanation.push(`Amount: ${safeQuantity} × ${options[optionIndex].label}, as you said.`)
    } else {
        explanation.push(`Amount: "${said}" was read as ${isGrams ? `${totalGrams} g` : `${safeQuantity} × ${options[optionIndex].label}, about ${totalGrams} g`}, a typical size. Change it if yours was different.`)
    }
    const accuracy = level === "same" ? (basis === "estimated" ? "medium" : "high") : basis === "estimated" ? "low" : "medium"

    return {
        name: food.name.trim().slice(0, 80) || match.name,
        amount: food.amount.trim().slice(0, 80),
        accuracy,
        explanation,
        basis: "database",
        sourceLabel: match.source,
        matchedName: match.name,
        base: nutritionFrom(match.per100g),
        options,
        optionIndex,
        quantity: safeQuantity,
        sources: [],
    }
}

// ---------- Google results (optional): reading the numbers out of the text ----------

// JSON keys for the micronutrients, with the unit in the name so the model reads the right number.
// Vitamin D is asked for in mcg (what most sources list) and converted to the app's IU.
const MICRO_FIELDS = MICRONUTRIENT_DEFS
    .filter((def) => def.name !== "Fibre") // comes from fiber_g
    .map((def) => {
        const unit = def.name === "Vitamin D" ? "mcg" : def.measure === "μg" ? "mcg" : def.measure.toLowerCase()
        const key = `${def.name.toLowerCase().replace(/\(.*?\)/g, "").trim().replace(/[^a-z0-9]+/g, "_")}_${unit}`
        return { key, name: def.name, toAppUnit: def.name === "Vitamin D" ? 40 : 1 }
    })

const nullableNumber = { type: ["number", "null"] }

// property order matters: the servings eaten come last so the model copies per-serving numbers first
export const EXTRACTION_SCHEMA = {
    type: "object",
    properties: {
        reference_serving: { type: "string" },
        calories: nullableNumber,
        protein_g: nullableNumber,
        carbs_g: nullableNumber,
        fat_g: nullableNumber,
        fiber_g: nullableNumber,
        ...Object.fromEntries(MICRO_FIELDS.map((field) => [field.key, nullableNumber])),
        portions_eaten: { type: "number" },
    },
    required: ["reference_serving", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", ...MICRO_FIELDS.map((field) => field.key), "portions_eaten"],
}

export function extractionPrompt(food: { name: string, amount: string }, userSaid: string[], results: OverviewResult[]): string {
    const facts = results.length
        ? `Search results:\n${results.map((result) => `[${result.query}]\n${result.text}`).join("\n\n")}`
        : "There are no search results. Give your best typical values for this food from general knowledge."
    return `Food the user ate: ${food.name}, amount: "${food.amount}".
What the user said: ${userSaid.map((text) => `"${text}"`).join(" / ")}

${facts}

Copy the nutrition facts into the JSON. Numbers the user wrote themselves always win over anything else.
- Shorthand: "35p 40c 15f" or "P35/C40/F15" means 35 g protein, 40 g carbs, 15 g fat; "450 cal" is 450 calories.
- reference_serving: the serving the numbers are for, e.g. "1 cup (245 g)" or "1 slice (111 g)". If the user gave the numbers for everything they ate (e.g. "my wrap was 450 cal, 35g protein"), it's that whole amount (e.g. "1 wrap") and portions_eaten is 1.
- Each nutrient: the number for ONE reference serving, exactly as written (do not multiply). null if it isn't given - never fill one nutrient from another (sugar is not carbs, saturated fat is not fat).
- portions_eaten (last): how many reference servings the user ate, e.g. 2 for "2 cups" when the reference is 1 cup, or 300 / 245 for 300 g.
  ${TYPICAL_SIZES}`
}

function amount(value: unknown, max: number): number {
    const n = typeof value === "string" ? parseFloat(value) : Number(value)
    if (!Number.isFinite(n) || n < 0) return 0
    return round(Math.min(n, max))
}

// ---------- nutrition facts pasted into the chat ----------

// The nutrients the user gave numbers for, in any of the ways people type them: label style
// ("Calories 120, Protein 5 g"), plain ("35g protein, 40 carbs"), shorthand ("450 cal 35p 40c 15f",
// "P35 C40 F15") or micronutrients ("600mg sodium"). Questions like "how many calories in 3 eggs" have
// no number next to a nutrient, so they don't count.
const NUM = String.raw`\d+(?:[.,]\d+)?`
const UNIT = String.raw`(?:\s*(?:g|grams?|mg|milligrams?|mcg|µg|μg|iu)\b)?`
const STATED: [string, RegExp[]][] = [
    ["calories", [
        new RegExp(String.raw`${NUM}\s*(?:k?cals?|kcals?|calories|cal)\b`, "i"),
        new RegExp(String.raw`\b(?:calories|k?cals?|energy)\b\s*[:=\-]?\s*${NUM}`, "i"),
    ]],
    ["protein", [
        new RegExp(String.raw`${NUM}${UNIT}\s*(?:of\s+)?prot(?:ein)?s?\b`, "i"),
        new RegExp(String.raw`\bprot(?:ein)?s?\b\s*[:=\-]?\s*${NUM}`, "i"),
        new RegExp(String.raw`(?:^|[\s,/(])${NUM}\s*g?\s*p\b`, "i"),
        new RegExp(String.raw`(?:^|[\s,/(])p\s*[:=]?\s*${NUM}\b`, "i"),
    ]],
    ["carbs", [
        new RegExp(String.raw`${NUM}${UNIT}\s*(?:of\s+)?(?:total\s+)?carb(?:s|ohydrates?)?\b`, "i"),
        new RegExp(String.raw`\b(?:total\s+)?carb(?:s|ohydrates?)?\b\s*[:=\-]?\s*${NUM}`, "i"),
        new RegExp(String.raw`(?:^|[\s,/(])${NUM}\s*g?\s*c\b`, "i"),
        new RegExp(String.raw`(?:^|[\s,/(])c\s*[:=]?\s*${NUM}\b`, "i"),
    ]],
    ["fat", [
        new RegExp(String.raw`${NUM}${UNIT}\s*(?:of\s+)?(?:total\s+)?fats?\b`, "i"),
        new RegExp(String.raw`\b(?:total\s+)?(?:fats?|lipids?)\b\s*[:=\-]?\s*${NUM}`, "i"),
        new RegExp(String.raw`(?:^|[\s,/(])${NUM}\s*g?\s*f\b`, "i"),
        new RegExp(String.raw`(?:^|[\s,/(])f\s*[:=]?\s*${NUM}\b`, "i"),
    ]],
    ...["fib(?:re|er)", "sugars?", "sodium", "salt", "cholesterol", "potassium", "calcium", "iron", "magnesium", "zinc", "saturated(?:\\s+fat)?", "vitamin\\s+[a-z]\\d*"].map((word): [string, RegExp[]] => [word, [
        new RegExp(String.raw`${NUM}${UNIT}\s*(?:of\s+)?${word}\b`, "i"),
        new RegExp(String.raw`\b${word}\b\s*[:=\-]?\s*${NUM}`, "i"),
    ]]),
]

export function statedNutrients(message: string): string[] {
    return STATED.filter(([, patterns]) => patterns.some((pattern) => pattern.test(message))).map(([name]) => name)
}

// Two or more nutrient numbers means the user gave the food's nutrition themselves: it goes straight
// onto a card from their numbers, with no database search (the chat model tends to search anyway)
export function looksLikeNutritionFacts(message: string): boolean {
    return statedNutrients(message).length >= 2
}

export const PASTED_META_SCHEMA = {
    type: "object",
    properties: { name: { type: "string" }, amount: { type: "string" } },
    required: ["name", "amount"],
}

export function pastedMetaPrompt(userSaid: string[]): string {
    return `The user's messages: ${userSaid.map((text) => `"${text}"`).join(" / ")}
The last message has nutrition numbers the user gave for a food.
name: what food it is, in a few words (the product name if the label shows one; otherwise from the messages; "Food" if there's no way to tell).
amount: how much they say they ate, in their own words (e.g. "about 1.5 cups", "2 bars"). Not the label's serving size ("Per 3/4 cup" is the label, not what they ate). "" if they didn't say.`
}

// ---------- label photos ----------

// Marks the label text read from a photo inside the user's message in the history (photos themselves
// are never kept: the history goes back and forth with the browser on every turn)
export const PHOTO_MARKER = "[Nutrition facts read from the user's photo]"
export const NO_LABEL = "NO_LABEL"

export function labelPhotoPrompt(): string {
    return `This should be a photo of a Nutrition Facts label (it may be in English and French).
Copy what the label says as plain text, one line each, exactly as printed:
- the product name, if it's visible
- the serving size
- calories
- every nutrient with its amount and unit (fat, saturated fat, cholesterol, sodium, carbohydrate, fibre, sugars, protein, vitamins and minerals)
Leave out the % daily values. Don't guess numbers you can't read.
If there is no nutrition facts label in the photo, reply with exactly: ${NO_LABEL}`
}

// A web page the user linked, as the number-reading step should see it
export type PageSource = { url: string, host: string, title: string, kind: "structured" | "text" }

export function proposalFromText(
    food: { name: string, amount: string },
    extracted: Record<string, unknown>,
    basis: "link" | "pasted" | "photo" | "ai_overview" | "search" | "estimate",
    sources: OverviewSource[],
    page?: PageSource,
    // the user typed numbers for everything they ate (no "per serving"), so the amount is exactly that
    totals = false,
): FoodProposal {
    const micronutrients: Record<string, number> = {}
    // without search results the model's micronutrient guesses aren't worth logging
    for (const field of basis === "estimate" ? [] : MICRO_FIELDS) {
        const value = amount(extracted[field.key], 100_000) * field.toAppUnit
        if (value > 0) micronutrients[field.name] = round(value)
    }
    const fiberG = amount(extracted.fiber_g, 300)
    if (fiberG > 0) micronutrients.Fibre = fiberG

    // the user gave macros but no calories: work them out (4 kcal per g of protein and carbs, 9 per g of fat)
    let caloriesFromMacros = false
    if ((basis === "pasted" || basis === "photo") && !(amount(extracted.calories, 10_000) > 0)) {
        const fromMacros = 4 * amount(extracted.protein_g, 1000) + 4 * amount(extracted.carbs_g, 1000) + 9 * amount(extracted.fat_g, 1000)
        if (fromMacros > 0) {
            extracted = { ...extracted, calories: Math.round(fromMacros) }
            caloriesFromMacros = true
        }
    }

    // "per bar" is the reference serving "1 bar"
    const reference = String(extracted.reference_serving ?? "1 serving").trim().replace(/^(per|pour)\s+(?!\d)/i, "1 ").replace(/^(per|pour)\s+/i, "").slice(0, 60) || "1 serving"
    // exact when the units line up ("about a cup" with "3/4 cup (30 g)" = 1.33); the model's guess otherwise
    const exact = servingsFromAmount(food.amount, reference)
    const portionsEaten = totals ? 1 : round(Math.min(Math.max(exact ?? (amount(extracted.portions_eaten, 50) || 1), 0.05), 50))
    const said = food.amount.trim()
    const howMuch = totals ? "stated" : amountBasis(food.amount, reference)
    const amountLine = totals
        ? `Amount: your numbers are for everything you had (${reference}). Change it if you had more or less.`
        : !/[a-z0-9]/i.test(said)
        ? `Amount: no size or amount was given, so this uses ${portionsEaten} × ${reference}. Change it if yours was different.`
        : exact !== null
            ? `Amount: "${said}" is ${portionsEaten} × ${reference}.${howMuch === "estimated" ? " Change it if yours was different." : ""}`
            : howMuch === "estimated"
                ? `Amount: "${said}" was read as ${portionsEaten} × ${reference}, a typical size. Change it if yours was different.`
                : `Amount: ${portionsEaten} × ${reference}, as you said.`

    let explanation: string[]
    let accuracy: FoodProposal["accuracy"]
    if (basis === "link" && page) {
        explanation = page.kind === "structured"
            ? [`From the nutrition facts ${page.host} publishes for "${page.title}" (the page's own data, read exactly).`, amountLine]
            : [`Read from the text of ${page.host} ("${page.title}"). Check the numbers against the page; the reading can slip on unusual layouts.`, amountLine]
        accuracy = page.kind === "structured" ? (howMuch === "estimated" ? "medium" : "high") : howMuch === "estimated" ? "low" : "medium"
    } else if (basis === "photo") {
        explanation = ["Read from the label in your photo. Check the numbers against the label before adding; a blurry or angled photo can be misread.", amountLine]
        accuracy = howMuch === "estimated" ? "medium" : "high"
    } else if (basis === "pasted") {
        explanation = ["From the numbers you gave (no database search).", ...(caloriesFromMacros ? ["Calories were worked out from your protein, carbs and fat (4, 4 and 9 kcal per gram)."] : []), amountLine]
        accuracy = howMuch === "estimated" ? "medium" : "high"
    } else if (basis === "estimate") {
        explanation = ["This food isn't in the database, so these are typical values for it, not measured ones. Micronutrients are left out.", amountLine]
        accuracy = "low"
    } else {
        explanation = [`Read from ${basis === "ai_overview" ? "Google's AI Overview" : "Google search results"}, which summarise other websites, so they're less reliable than the database.`, amountLine]
        accuracy = basis === "ai_overview" ? "medium" : "low"
    }

    return {
        name: food.name.trim().slice(0, 80) || page?.title.slice(0, 80) || "Food",
        amount: food.amount.trim().slice(0, 80),
        accuracy,
        explanation,
        basis,
        sourceLabel: basis === "link" && page ? page.host : basis === "pasted" ? "Your numbers" : basis === "photo" ? "Your label photo" : basis === "ai_overview" ? "Google AI Overview" : basis === "search" ? "Google search results" : "Rough estimate",
        matchedName: null,
        base: {
            calories: amount(extracted.calories, 10_000),
            proteinG: amount(extracted.protein_g, 1000),
            carbsG: amount(extracted.carbs_g, 1000),
            fatsG: amount(extracted.fat_g, 1000),
            fiberG,
            micronutrients,
        },
        options: [{ label: reference, multiplier: 1 }],
        optionIndex: 0,
        quantity: portionsEaten,
        sources,
    }
}

// ---------- validating what comes back from the browser ----------

const MAX_HISTORY = 40
const MAX_CONTENT = 8000
export const MAX_USER_MESSAGE = 1000

// The conversation lives in the browser and is sent back each turn; keep only well-formed messages
export function sanitizeHistory(input: unknown): ChatMessage[] {
    if (!Array.isArray(input)) return []
    const messages: ChatMessage[] = []
    for (const raw of input.slice(-MAX_HISTORY)) {
        if (!raw || typeof raw !== "object") continue
        const { role, content, tool_calls, tool_name } = raw as Record<string, unknown>
        if (role !== "user" && role !== "assistant" && role !== "tool") continue
        const message: ChatMessage = { role, content: typeof content === "string" ? content.slice(0, MAX_CONTENT) : "" }
        if (role === "assistant" && Array.isArray(tool_calls)) {
            message.tool_calls = tool_calls
                .filter((call) => call?.function && typeof call.function.name === "string")
                .slice(0, 4)
                .map((call) => ({ function: { name: call.function.name, arguments: typeof call.function.arguments === "object" && call.function.arguments ? call.function.arguments : {} } }))
        }
        if (role === "tool" && typeof tool_name === "string") message.tool_name = tool_name
        messages.push(message)
    }
    // a conversation can't start with a reply
    while (messages.length && messages[0].role !== "user") messages.shift()
    return messages
}

function parseTool(message: ChatMessage, name: string): Record<string, unknown> | null {
    if (message.role !== "tool" || message.tool_name !== name) return null
    try {
        const parsed = JSON.parse(message.content)
        return parsed && typeof parsed === "object" ? parsed : null
    } catch {
        return null
    }
}

// The search that turned up this food: its words, and whether it had to settle for entries with only some of them
export function searchThatFound(history: ChatMessage[], id: string): { looseSearch: boolean, searchQuery: string } {
    for (let i = history.length - 1; i >= 0; i--) {
        const parsed = parseTool(history[i], FOOD_SEARCH_TOOL)
        if (parsed && Array.isArray(parsed.ids) && parsed.ids.includes(id)) {
            return { looseSearch: parsed.loose === true, searchQuery: String(parsed.query ?? "") }
        }
    }
    return { looseSearch: false, searchQuery: "" }
}

// The latest page the assistant read (and its text for the number-reading step). With currentTurnOnly,
// only a page read since the user's last message counts - so an old link isn't reused for a new food.
export function latestPage(history: ChatMessage[], currentTurnOnly: boolean): (PageSource & { text: string }) | null {
    for (let i = history.length - 1; i >= 0; i--) {
        if (currentTurnOnly && history[i].role === "user") return null
        const parsed = parseTool(history[i], PAGE_TOOL)
        if (parsed?.ok === true && typeof parsed.text === "string" && typeof parsed.url === "string") {
            return {
                url: parsed.url,
                host: String(parsed.host ?? ""),
                title: String(parsed.title ?? ""),
                kind: parsed.kind === "structured" ? "structured" : "text",
                text: parsed.text,
            }
        }
    }
    return null
}

// What the chat model sees of a tool message: a page's text is only for the number-reading step (it
// could contain instructions aimed at the model), so the model gets the summary instead
export function forChatModel(message: ChatMessage): ChatMessage {
    if (message.role !== "tool" || message.tool_name !== PAGE_TOOL) return message
    const parsed = parseTool(message, PAGE_TOOL)
    return { ...message, content: JSON.stringify(parsed ? { ok: parsed.ok, summary: parsed.summary ?? parsed.error } : { ok: false }) }
}

// The ids from the most recent database search, best match first (used if the model forgets food_id)
export function latestFoodIds(history: ChatMessage[]): string[] {
    for (let i = history.length - 1; i >= 0; i--) {
        const parsed = parseTool(history[i], FOOD_SEARCH_TOOL)
        if (parsed && Array.isArray(parsed.ids)) return parsed.ids.filter((id): id is string => typeof id === "string")
    }
    return []
}

// The Google results a proposal is based on: the searches from the most recent turn that searched
// (a follow-up like "it was a big bowl" re-uses the last search instead of searching again)
export function latestGoogleResults(history: ChatMessage[]): OverviewResult[] {
    const isResult = (message: ChatMessage) => {
        const parsed = parseTool(message, GOOGLE_TOOL)
        return parsed?.ok === true && typeof parsed.text === "string" ? parsed : null
    }
    let last = -1
    for (let i = history.length - 1; i >= 0 && last < 0; i--) if (isResult(history[i])) last = i
    if (last < 0) return []

    let start = last
    while (start > 0 && history[start - 1].role !== "user") start--

    const results: OverviewResult[] = []
    for (let i = start; i < history.length && history[i].role !== "user"; i++) {
        const parsed = isResult(history[i])
        if (!parsed) continue
        results.push({
            query: String(parsed.query ?? ""),
            kind: parsed.kind === "ai_overview" || parsed.kind === "answer_box" ? parsed.kind : "search_snippets",
            text: String(parsed.text),
            sources: (Array.isArray(parsed.sources) ? parsed.sources : [])
                .filter((source) => typeof source?.link === "string" && /^https?:\/\//.test(source.link))
                .map((source) => ({ title: String(source.title ?? source.link).slice(0, 160), link: source.link })),
        })
    }
    return results
}
