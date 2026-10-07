import { supabase } from "@/app/supabaseClient/client";
import CloudinaryService from "@/app/cloundinaryClient/CloudinaryService";
import { fetchAllPages } from "./dateRange";
import { getPublicIdFromCloudinaryUrl } from "./helpers";
import { userImageTag } from "./imageUpload";

// Everything ProgressX stores about one user, for the "download my data" export (right of access)
// and for account deletion. Every table below is removed automatically when the account is deleted
// (foreign keys cascade from auth.users -> profiles -> each table); images live in Cloudinary and are
// deleted separately.
const USER_TABLES: { table: string, key: string, label: string }[] = [
    { table: "user_settings", key: "user_id", label: "settings" },
    { table: "diet_config", key: "id", label: "dietPreferences" },
    { table: "food_items", key: "user_id", label: "savedFoods" },
    { table: "food_log_entries", key: "user_id", label: "foodLog" },
    { table: "water_log_entries", key: "user_id", label: "waterLog" },
    { table: "weight_log_entries", key: "user_id", label: "weightLog" },
    { table: "workout_splits", key: "user_id", label: "workoutSplits" },
    { table: "workout_sets", key: "user_id", label: "workoutSets" },
    { table: "workout_routines", key: "user_id", label: "workoutRoutines" },
    { table: "photo_collection", key: "user_id", label: "progressPhotos" },
    { table: "consent_events", key: "user_id", label: "consentHistory" },
]

export async function collectUserData(userId: string) {
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
    if (error) throw error

    const sections = await Promise.all(USER_TABLES.map(async ({ table, key, label }) => {
        const rows = await fetchAllPages((start, end) => supabase.from(table).select("*").eq(key, userId).order("created_at").range(start, end))
        return [label, rows] as const
    }))

    return {
        exportedAt: new Date().toISOString(),
        notes: [
            "This file contains all personal information ProgressX stores about your account.",
            "Photo entries link to the image files; open a link to download that image.",
        ],
        profile,
        ...Object.fromEntries(sections),
    }
}

const BATCH = 100 // Cloudinary's limit per delete_resources call

type DeleteResult = { deleted: number, notFound: number }

// Deletes every image belonging to the user from Cloudinary: the profile picture and progress photos
// referenced in the database, plus anything else tagged with their id. Throws if Cloudinary refuses,
// so the caller can stop before deleting the account (nothing is lost; the user can try again).
export async function deleteUserImages(userId: string): Promise<DeleteResult> {
    const cloudinary = CloudinaryService.getInstance()

    const [{ data: profile, error: profileError }, photos] = await Promise.all([
        supabase.from("profiles").select("profile_image").eq("id", userId).single(),
        fetchAllPages<{ image_link: string | null }>((start, end) => supabase.from("photo_collection").select("image_link").eq("user_id", userId).order("created_at").range(start, end)),
    ])
    if (profileError) throw profileError

    const urls = [profile?.profile_image, ...photos.map((p) => p.image_link)]
        // only our Cloudinary images (a Google sign-in picture isn't ours to delete)
        .filter((url): url is string => typeof url === "string" && url.includes("res.cloudinary.com/") && url.includes("/upload/"))
    const publicIds = Array.from(new Set(urls.map(getPublicIdFromCloudinaryUrl)))

    const result: DeleteResult = { deleted: 0, notFound: 0 }
    for (let i = 0; i < publicIds.length; i += BATCH) {
        // invalidate also clears the cached copies from Cloudinary's CDN
        const response = await cloudinary.api.delete_resources(publicIds.slice(i, i + BATCH), { resource_type: "image", invalidate: true })
        for (const status of Object.values(response.deleted ?? {}) as string[]) {
            if (status === "deleted") result.deleted += 1
            else if (status === "not_found") result.notFound += 1
            else throw new Error(`Cloudinary couldn't delete an image: ${status}`)
        }
    }

    // anything tagged with this user that the database didn't point to (e.g. an upload interrupted halfway)
    const tagged = await cloudinary.api.delete_resources_by_tag(userImageTag(userId), { resource_type: "image", invalidate: true })
    result.deleted += Object.values(tagged.deleted ?? {}).filter((status) => status === "deleted").length

    return result
}
