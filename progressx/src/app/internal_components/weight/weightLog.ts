import { LB_PER_KG } from "../profile/profileRules"

// Shared by the weight API, the diet page's weigh-in card and the My Stats weight tab

export const WEIGHT_PERIODS = ["morning", "night"] as const
export type WeightPeriod = typeof WEIGHT_PERIODS[number]

// matches the check constraint on weight_log_entries.weight_kg
export const WEIGHT_KG_RANGE = [20, 350] as const

export type WeightUnit = "lb" | "kg"

export type WeightEntry = { date: string, period: WeightPeriod, weightKg: number, updatedAt?: string }

export const toDisplay = (kg: number, unit: WeightUnit) => (unit === "kg" ? kg : kg * LB_PER_KG)
export const fromDisplay = (value: number, unit: WeightUnit) => (unit === "kg" ? value : value / LB_PER_KG)

// one decimal, e.g. "182.4 lb"
export function formatWeight(kg: number, unit: WeightUnit, withUnit = true): string {
    const value = (Math.round(toDisplay(kg, unit) * 10) / 10).toFixed(1)
    return withUnit ? `${value} ${unit}` : value
}

export const PERIOD_LABEL: Record<WeightPeriod, string> = { morning: "Morning", night: "Night" }
