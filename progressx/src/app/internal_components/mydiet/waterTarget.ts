const POUND2KG = 0.45359237

// General guidance is roughly 35 ml of water per kg of body weight, plus more
// the more active you are. Levels match profiles.activity_level (1 = sedentary .. 5 = very active).
const ML_PER_KG = 35
const ACTIVITY_BONUS_ML: Record<string, number> = {
    "1": 0,
    "2": 250,
    "3": 500,
    "4": 750,
    "5": 1000,
}

// Used when we don't have a weight yet (approximate daily drinking-water intakes)
const FALLBACK_TARGET_ML: Record<string, number> = {
    male: 3000,
    female: 2200,
}
const DEFAULT_FALLBACK_ML = 2500

const MIN_TARGET_ML = 1500
const MAX_TARGET_ML = 5000

export type WaterTargetInput = {
    weightLbs?: number | string | null,
    gender?: number | string | null,
    activity?: number | string | null,
}

// Daily water recommendation in ml, rounded to the nearest 50 ml
export function getWaterTargetMl({ weightLbs, gender, activity }: WaterTargetInput): number {
    const weightKg = Number(weightLbs) * POUND2KG
    const bonus = ACTIVITY_BONUS_ML[String(activity ?? "1")] ?? 0

    const base = weightKg > 0
        ? weightKg * ML_PER_KG
        : FALLBACK_TARGET_ML[String(gender)] ?? DEFAULT_FALLBACK_ML

    const target = Math.min(MAX_TARGET_ML, Math.max(MIN_TARGET_ML, base + bonus))
    return Math.round(target / 50) * 50
}
