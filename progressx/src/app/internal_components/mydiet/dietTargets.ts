import { goalType } from './CalorieTarget'
import { averageCompletion, calorieGoalCompletion, ScoreCategory } from './DailyScore'
import { MicroNutrient } from './microNutrients'

// Shared by the diet page and the My Stats diet analytics, so a day scores the same on both.

const POUND2KG = 0.45359237

const ACTIVITY_WEIGHTING: Record<string, number> = {
    "1": 1.2,
    "2": 1.375,
    "3": 1.55,
    "4": 1.725,
    "5": 1.9,
}

type ProfileInput = Record<string, string | number | null | undefined>

export function weightKgFromProfile(userData: ProfileInput): number {
    return (Number(userData.weight) || 0) * POUND2KG
}

// Mifflin-St Jeor BMR (no body fat % needed) times the activity multiplier; 0 when the profile is incomplete
export function getTotalExpenditure(userData: ProfileInput): number {
    const weightKg = weightKgFromProfile(userData)
    const height = Number(userData.height)
    const age = Number(userData.age)
    let BMR: number
    switch (userData.gender) {
        case "male":
            BMR = 10 * weightKg + 6.25 * height - 5 * age + 5
            break

        case "female":
            BMR = 10 * weightKg + 6.25 * height - 5 * age - 161
            break

        default:
            // "other" or not loaded yet: average of the two formulas
            BMR = 10 * weightKg + 6.25 * height - 5 * age - 78
    }

    const weighting = ACTIVITY_WEIGHTING[String(userData.activity)]
    if (!weighting || !Number.isFinite(BMR) || BMR <= 0) return 0
    return Math.round(weighting * BMR)
}

export type MacroTargets = { protein: number, carbs: number, fats: number }

export function getMacroTargets(weightKg: number): MacroTargets {
    return {
        protein: Math.round(2.4 * weightKg),
        fats: Math.round(Math.max(0.6 * weightKg, 0.2 * 2100 / 9)),
        carbs: Math.round((2100 - (2.4 * weightKg * 4 + Math.max(0.6 * weightKg, 0.2 * 2100 / 9) * 9)) / 4),
    }
}

export type DayTotals = {
    calories: number,
    protein: number,
    carbs: number,
    fats: number,
    micronutrients: Record<string, number>,
    waterMl: number,
}

export type ScoreTargets = {
    totalExpenditure: number,
    goal: goalType,
    macros: MacroTargets,
    waterMl: number,
    micros: MicroNutrient[],
}

// Share of the day's targets met; only 100% when every tracked target is hit
export function getScoreCategories(day: DayTotals, targets: ScoreTargets): ScoreCategory[] {
    return [
        { label: "Calories", weight: 0.3, fraction: calorieGoalCompletion(day.calories, targets.totalExpenditure, targets.goal) },
        { label: "Macros", weight: 0.3, fraction: averageCompletion([
            { consumed: day.protein, target: targets.macros.protein },
            { consumed: day.carbs, target: targets.macros.carbs },
            { consumed: day.fats, target: targets.macros.fats },
        ]) },
        { label: "Water", weight: 0.2, fraction: averageCompletion([{ consumed: day.waterMl, target: targets.waterMl }]) },
        { label: "Micros", weight: 0.2, fraction: averageCompletion(targets.micros.map((nutrient) => ({
            consumed: day.micronutrients[nutrient.name] ?? 0,
            target: nutrient.total,
            kind: nutrient.kind,
        }))) },
    ]
}
