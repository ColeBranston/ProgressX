import dri from "@/data/dietaryReferenceIntakes.json";

// "target": reach at least `total` (most vitamins and minerals).
// "limit": stay at or under `total` (sodium, cholesterol) - more is worse, not better.
export type MicroNutrientKind = "target" | "limit"

export type MicroNutrient = {
    name: string,
    total: number,
    measure: string,
    kind: MicroNutrientKind
}

// Canonical list of the micronutrients tracked in the Micros analytics list -
// shared between the target calculation below, the add/edit food form
// (mydiet/FoodItemForm.tsx), and the display-preferences settings panel
// (mydiet/MicronutrientSettings.tsx), and used server-side (api/diet/preferences)
// to validate a user's saved preference.
export const MICRONUTRIENT_DEFS: { name: string, measure: string, kind?: MicroNutrientKind }[] = [
    { name: "Vitamin A", measure: "μg" },
    { name: "Vitamin D", measure: "IU" },
    { name: "Vitamin E", measure: "mg" },
    { name: "Vitamin K", measure: "μg" },
    { name: "Thiamin", measure: "mg" },
    { name: "Niacin", measure: "mg" },
    { name: "Riboflavin", measure: "mg" },
    { name: "Vitamin B12", measure: "μg" },
    { name: "Folate (B9)", measure: "μg" },
    { name: "Vitamin B6", measure: "mg" },
    { name: "Pantothenic Acid", measure: "mg" },
    { name: "Vitamin C", measure: "mg" },
    { name: "Iron", measure: "mg" },
    { name: "Biotin", measure: "μg" },
    { name: "Choline", measure: "mg" },
    { name: "Fibre", measure: "g" },
    { name: "Calcium", measure: "mg" },
    { name: "Magnesium", measure: "mg" },
    { name: "Potassium", measure: "mg" },
    { name: "Sodium", measure: "mg", kind: "limit" },
    { name: "Cholesterol", measure: "mg", kind: "limit" },
    { name: "Zinc", measure: "mg" },
    { name: "Iodine", measure: "μg" },
]

export const ALL_MICRONUTRIENT_NAMES: string[] = MICRONUTRIENT_DEFS.map((def) => def.name)

type Gender = "male" | "female"
type AgeRange = "9-13y" | "14-18y" | "19-30y" | "31-50y" | "51-70y" | ">70y"

// The DRI tables only have male and female groups. "other" (a choice at onboarding) averages the two,
// the same way the calorie target does. Anything else means the profile hasn't loaded yet.
function resolveGroups(gender: unknown): Gender[] {
    if (gender === "male" || gender === "female") return [gender]
    if (gender === "other") return ["male", "female"]
    // null/undefined = the profile hasn't loaded from localStorage yet (first render), not worth logging
    if (gender !== null && gender !== undefined) console.error("Unexpected gender value, using the male DRI groups: ", gender)
    return ["male"]
}

function resolveAgeRange(age: unknown): AgeRange {
    const num = Number(age)
    if (!Number.isFinite(num) || num <= 0) return "19-30y"
    if (num > 70) return ">70y"
    if (num >= 51) return "51-70y"
    if (num >= 31) return "31-50y"
    if (num >= 19) return "19-30y"
    if (num >= 14) return "14-18y"
    return "9-13y"
}

function findGroup<T extends { group: string, ageRange: string }>(groups: T[], group: Gender, ageRange: AgeRange): T | undefined {
    return groups.find((g) => g.group === group && g.ageRange === ageRange)
}

// Recommended Dietary Allowance / Adequate Intake targets for the vitamins, elements and fibre
// shown in the diet page's "Micros" analytics, resolved for the signed-in user's gender + age
// per Health Canada's Dietary Reference Intakes (see internal_components/mydiet/microNutrients.ts callers).
//
// `displayedNames`, when passed, filters the result down to just those names (in
// MICRONUTRIENT_DEFS order) - this is how the user's saved display preference
// (diet_config.displayed_micronutrients) narrows what shows on the diet page.
// Omit it (or pass an empty array) to get all of them.
export function getMicronutrientTargets(genderInput: unknown, ageInput: unknown, displayedNames?: string[]): MicroNutrient[] {
    const ageRange = resolveAgeRange(ageInput)
    const perGroup = resolveGroups(genderInput).map((group) => targetsFor(group, ageRange))
    const totals: Record<string, number> = {}
    for (const name of ALL_MICRONUTRIENT_NAMES) {
        const average = perGroup.reduce((sum, t) => sum + (t[name] ?? 0), 0) / perGroup.length
        totals[name] = Math.round(average * 100) / 100
    }

    const allow = displayedNames && displayedNames.length > 0 ? new Set(displayedNames) : null

    return MICRONUTRIENT_DEFS
        .filter((def) => !allow || allow.has(def.name))
        .map((def) => ({ name: def.name, total: totals[def.name] ?? 0, measure: def.measure, kind: def.kind ?? "target" }))
}

const CHOLESTEROL_DAILY_VALUE_MG = 300

function targetsFor(group: Gender, ageRange: AgeRange): Record<string, number> {

    const aDEK = findGroup(dri.vitamins.aDEK.groups, group, ageRange)
    const cGroup = findGroup(dri.vitamins.cThiaminRiboflavinNiacinB6.groups, group, ageRange)
    const bGroup = findGroup(dri.vitamins.folateB12PantothenicBiotinCholine.groups, group, ageRange)
    const macroGroup = findGroup(dri.macronutrients.primary.groups, group, ageRange)
    const caGroup = findGroup(dri.elements.calciumChromiumCopperFluorideIodine.groups, group, ageRange)
    const feGroup = findGroup(dri.elements.ironMagnesiumManganeseMolybdenumPhosphorus.groups, group, ageRange)
    const znGroup = findGroup(dri.elements.zincPotassiumSodiumChloride.groups, group, ageRange)

    return {
        "Vitamin A": aDEK?.vitaminA.rdaUgRae ?? 0,
        "Vitamin D": aDEK?.vitaminD.rdaIu ?? 0,
        "Vitamin E": aDEK?.vitaminE.rdaMg ?? 0,
        "Vitamin K": aDEK?.vitaminK.aiUg ?? 0,
        "Thiamin": cGroup?.thiamin.rdaMg ?? 0,
        "Niacin": cGroup?.niacin.rdaMgNe ?? 0,
        "Riboflavin": cGroup?.riboflavin.rdaMg ?? 0,
        "Vitamin B12": bGroup?.vitaminB12.rdaUg ?? 0,
        "Folate (B9)": bGroup?.folate.rdaUgDfe ?? 0,
        "Vitamin B6": cGroup?.vitaminB6.rdaMg ?? 0,
        "Pantothenic Acid": bGroup?.pantothenicAcid.aiMg ?? 0,
        "Vitamin C": cGroup?.vitaminC.rdaMg ?? 0,
        "Iron": feGroup?.iron.rdaMg ?? 0,
        "Biotin": bGroup?.biotin.aiUg ?? 0,
        "Choline": bGroup?.choline.aiMg ?? 0,
        "Fibre": macroGroup?.totalFibreAiGPerDay ?? 0,
        "Calcium": caGroup?.calcium.rdaAiMg ?? 0,
        "Magnesium": feGroup?.magnesium.rdaMg ?? 0,
        "Potassium": znGroup?.potassium.aiMg ?? 0,
        // a daily limit: Health Canada's chronic disease risk reduction level (CDRR), 2,300 mg for ages 14+
        "Sodium": znGroup?.sodium.cdrrMg ?? 2300,
        // a daily limit: the DRIs set no number for cholesterol, so this is the 300 mg Daily Value that
        // Canadian (and US) nutrition labels use for "% DV"
        "Cholesterol": CHOLESTEROL_DAILY_VALUE_MG,
        "Zinc": znGroup?.zinc.rdaMg ?? 0,
        "Iodine": caGroup?.iodine.rdaUg ?? 0,
    }
}
