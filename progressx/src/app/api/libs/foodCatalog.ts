import { supabase } from "@/app/supabaseClient/client";

export type CatalogFood = {
    name: string
    servingQty: number
    servingUnit: string
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
    fiberG: number
    micronutrients: Record<string, number>
}

// ilike treats % and _ as wildcards; escape them so the name is matched literally
function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// Saves a food to the user's quick-add catalog (food_items) and returns its id.
// If the catalog already has a food with the same name (ignoring case), that item is updated
// with these values instead of adding a duplicate.
export async function saveFoodToCatalog(userId: string, food: CatalogFood): Promise<string> {
    const row = {
        user_id: userId,
        name: food.name,
        serving_size: food.servingQty,
        serving_unit: food.servingUnit,
        calories: food.calories,
        protein_g: food.proteinG,
        carbs_g: food.carbsG,
        fats_g: food.fatsG,
        fiber_g: food.fiberG,
        micronutrients: food.micronutrients ?? {},
    }

    const { data: existing, error: lookupError } = await supabase
        .from("food_items")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", escapeLike(food.name.trim()))
        .limit(1)
        .maybeSingle()

    if (lookupError) throw lookupError

    if (existing) {
        const { error } = await supabase
            .from("food_items")
            .update({ ...row, updated_at: new Date().toISOString() })
            .eq("id", existing.id)
            .eq("user_id", userId)
        if (error) throw error
        return existing.id
    }

    const { data, error } = await supabase.from("food_items").insert(row).select("id").single()
    if (error) throw error
    return data.id
}

const normalizeName = (name: string) => name.trim().toLowerCase()

// Adds `catalog_item_id` to each log entry: the quick-add catalog item this food corresponds to,
// or null. That's the entry's own link if the item still exists, otherwise a catalog item with the
// same name (ignoring case/spacing) - so foods logged before they were linked still show as saved.
export async function withCatalogIds<T extends { name: string, food_item_id: string | null }>(
    userId: string,
    entries: T[],
): Promise<(T & { catalog_item_id: string | null })[]> {
    if (entries.length === 0) return []

    const { data: catalog, error } = await supabase.from("food_items").select("id, name").eq("user_id", userId)
    if (error) throw error

    const ids = new Set((catalog ?? []).map((item) => item.id))
    const byName = new Map<string, string>()
    for (const item of catalog ?? []) {
        if (!byName.has(normalizeName(item.name))) byName.set(normalizeName(item.name), item.id)
    }

    return entries.map((entry) => ({
        ...entry,
        catalog_item_id: entry.food_item_id && ids.has(entry.food_item_id)
            ? entry.food_item_id
            : byName.get(normalizeName(entry.name)) ?? null,
    }))
}
