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

// Daily calories to aim for: the middle of the calorie meter's range for each goal (see CalorieTarget)
export function getCalorieTarget(totalExpenditure: number, goal: goalType): number {
    if (!(totalExpenditure > 0)) return 0
    if (goal === "Deficit") return totalExpenditure - 500
    if (goal === "Surplus") return totalExpenditure + 250
    return totalExpenditure
}

const FALLBACK_CALORIES = 2100 // used until the profile has enough details to estimate expenditure
const PROTEIN_G_PER_KG = 2.4
const FAT_SHARE_OF_CALORIES = 0.25 // inside the recommended 20-35% of calories
const MIN_FAT_G_PER_KG = 0.6 // floor so fat never gets too low on a big deficit

// Macro targets that add up to the day's calorie target: protein by body weight, fat as a share of
// calories (never below the per-kg floor), and carbs fill whatever calories are left (never negative)
export function getMacroTargets(weightKg: number, calorieTarget: number): MacroTargets {
    const calories = calorieTarget > 0 ? calorieTarget : FALLBACK_CALORIES
    const protein = PROTEIN_G_PER_KG * weightKg
    const fats = Math.max(MIN_FAT_G_PER_KG * weightKg, (FAT_SHARE_OF_CALORIES * calories) / 9)
    const carbs = Math.max(0, (calories - protein * 4 - fats * 9) / 4)
    return {
        protein: Math.round(protein),
        fats: Math.round(fats),
        carbs: Math.round(carbs),
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
