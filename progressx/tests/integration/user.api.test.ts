import sharp from "sharp"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb } from "../helpers/fakeSupabase"
import { fakeR2 } from "../helpers/fakeR2"
import { apiRequest, useTestAuthEnv } from "../helpers/auth"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

// Cloudinary and Supabase Auth are outside services, faked at their clients
const cloud = vi.hoisted(() => ({
    config: () => {},
    uploader: { upload: vi.fn(), destroy: vi.fn() },
    api: { delete_resources: vi.fn(), delete_resources_by_tag: vi.fn() },
}))
const authAdmin = vi.hoisted(() => ({ deleteUser: vi.fn() }))
vi.mock("cloudinary", () => ({ v2: cloud }))
vi.mock("@/app/supabaseClient/client", async () => ({ supabase: (await import("../helpers/fakeSupabase")).fakeDb, createAuthClient: () => ({ auth: { admin: authAdmin } }) }))
vi.mock("@aws-sdk/client-s3", async () => (await import("../helpers/fakeR2")).s3Module)

const user = await import("@/app/api/user/route")
const account = await import("@/app/api/user/account/route")
const exporter = await import("@/app/api/user/export/route")
const settings = await import("@/app/api/user/settings/route")
const onboarding = await import("@/app/api/user/onboarding/route")
const getImages = await import("@/app/api/user/userImages/getUserImages/route")
const uploadImage = await import("@/app/api/user/userImages/uploadUserImages/route")
const uploadProfileImage = await import("@/app/api/user/userImages/uploadProfileImage/route")
const deleteImage = await import("@/app/api/user/userImages/deleteUserImages/route")

const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"
const cdn = (id: string) => `https://res.cloudinary.com/demo/image/upload/v1700000000/uploads/${id}.jpg`

beforeEach(() => {
    fakeDb.reset()
    fakeR2.reset()
    useTestAuthEnv()
    vi.spyOn(console, "log").mockImplementation(() => {})
    for (const fn of [cloud.uploader.upload, cloud.uploader.destroy, cloud.api.delete_resources, cloud.api.delete_resources_by_tag, authAdmin.deleteUser]) fn.mockReset()
    cloud.uploader.upload.mockImplementation(async () => ({ secure_url: cdn("new"), public_id: "uploads/new" }))
    cloud.uploader.destroy.mockResolvedValue({ result: "ok" })
    for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ID_ACCESS_KEY_ID", "R2_ID_SECRET_ACCESS_KEY", "ID_ENCRYPTION_KEY", "ID_FINGERPRINT_KEY"]) vi.stubEnv(name, "")
    fakeDb.seed("profiles", [
        { id: alice, email: "Alice@Example.com", display_username: "alice_lifts", profile_privacy: "private", profile_bio: "hi", profile_image: cdn("old"), activity_level: 3, created_at: "2026-01-01" },
        { id: bob, email: "bob@example.com", display_username: "bob.b", profile_privacy: "public", created_at: "2026-01-02" },
    ])
})

const json = async (method: string, path: string, body?: unknown, userId: string | null = alice) => apiRequest(path, { method, userId, body })

describe("/api/user", () => {
    it("returns the signed-in user's profile", async () => {
        const res = await user.GET(await json("GET", "/api/user"))
        expect((await res.json()).userData).toMatchObject({ id: alice, display_username: "alice_lifts" })
        expect((await user.GET(await json("GET", "/api/user", undefined, null))).status).toBe(401)
        fakeDb.failOn("profiles")
        expect((await user.GET(await json("GET", "/api/user"))).status).toBe(401)
    })

    it("updates only what the app would send", async () => {
        const res = await user.POST(await json("POST", "/api/user", { user: { privacy: "public", bio: "x".repeat(600), pfp: "https://evil.example.com/a.jpg", isOnboarded: false } }))
        expect(res.status).toBe(200)
        const profile = fakeDb.rows("profiles")[0]
        expect(profile).toMatchObject({ profile_privacy: "public", profile_image: cdn("old") })
        expect(profile.profile_bio).toHaveLength(500)
        expect(profile).not.toHaveProperty("isOnboarded")

        await user.POST(await json("POST", "/api/user", { user: { privacy: "secret", bio: null, pfp: null } }))
        expect(fakeDb.rows("profiles")[0]).toMatchObject({ profile_privacy: "public", profile_bio: null, profile_image: null })

        await user.POST(await json("POST", "/api/user", { user: { pfp: cdn("mine") } }))
        expect(fakeDb.rows("profiles")[0].profile_image).toBe(cdn("mine"))
    })

    it("refuses updates without a login, and reports errors", async () => {
        expect((await user.POST(await json("POST", "/api/user", { user: {} }, null))).status).toBe(401)
        fakeDb.failOn("profiles")
        expect((await user.POST(await json("POST", "/api/user", { user: { privacy: "public" } }))).status).toBe(500)
    })
})

describe("/api/user/settings", () => {
    const load = async (userId: string | null = alice) => settings.GET(await json("GET", "/api/user/settings", undefined, userId))
    const save = async (body: unknown, userId: string | null = alice) => settings.PATCH(await json("PATCH", "/api/user/settings", body, userId))

    it("has defaults until something is saved", async () => {
        expect(await (await load()).json()).toEqual({
            settings: { blurProgressPhotos: false, waterGoalMl: null, profilePrivacy: "private", weightUnit: "lb", activityLevel: 3, personalizedAds: false, sharing: { photos: "only_me", weight: "only_me", workouts: "only_me", diet: "only_me" } },
            email: "Alice@Example.com",
        })
    })

    it("saves only the fields sent, and returns everything", async () => {
        await save({ waterGoalMl: 2500 })
        const res = await save({ blurProgressPhotos: true, weightUnit: "kg", profilePrivacy: "public", activityLevel: 5, sharing: { weight: "followers" } })
        expect((await res.json()).settings).toEqual({
            blurProgressPhotos: true, waterGoalMl: 2500, profilePrivacy: "public", weightUnit: "kg", activityLevel: 5, personalizedAds: false, sharing: { photos: "only_me", weight: "followers", workouts: "only_me", diet: "only_me" },
        })
        expect(fakeDb.rows("user_settings")).toHaveLength(1)
        await save({ waterGoalMl: null })
        expect((await (await load()).json()).settings.waterGoalMl).toBeNull()
    })

    it("keeps every personalized ads choice in the consent history", async () => {
        await save({ personalizedAds: true })
        await save({ personalizedAds: false })
        expect((await (await load()).json()).settings.personalizedAds).toBe(false)
        expect(fakeDb.rows("consent_events").map((e) => [e.source, e.terms_version, e.user_agent])).toEqual([
            ["personalized_ads_on", TERMS_VERSION, "vitest"],
            ["personalized_ads_off", TERMS_VERSION, "vitest"],
        ])
    })

    it.each([
        [null, "Invalid request body"],
        [{ blurProgressPhotos: "yes" }, "blurProgressPhotos must be true or false"],
        [{ waterGoalMl: 100 }, /^waterGoalMl must be null or a whole number/],
        [{ waterGoalMl: 2500.5 }, /^waterGoalMl must be null or a whole number/],
        [{ weightUnit: "stone" }, "weightUnit must be \"lb\" or \"kg\""],
        [{ personalizedAds: 1 }, "personalizedAds must be true or false"],
        [{ sharing: { weight: "yes" } }, /^sharing must be an object/],
        [{ sharing: { passwords: true } }, /^sharing must be an object/],
        [{ profilePrivacy: "friends" }, "profilePrivacy must be \"public\" or \"private\""],
        [{ activityLevel: 9 }, "activityLevel must be a whole number from 1 to 5"],
    ])("rejects %j", async (body, message) => {
        const res = await save(body)
        expect(res.status).toBe(400)
        expect((await res.json()).message).toMatch(message)
        expect(fakeDb.rows("user_settings")).toEqual([])
    })

    it("requires a signed-in user", async () => {
        expect((await load(null)).status).toBe(401)
        expect((await save({}, null)).status).toBe(401)
    })

    it.each(["user_settings", "consent_events", "profiles"])("reports a failing %s write", async (table) => {
        fakeDb.failOn(table)
        expect((await save({ personalizedAds: true, profilePrivacy: "public" })).status).toBe(500)
        expect((await load()).status).toBe(table === "consent_events" ? 200 : 500)
    })
})

describe("/api/user/onboarding", () => {
    const details = { username: "jordan.lifts", name: "Jordan", age: 30, gender: "other", heightCm: 175.4, weightLbs: 170.6, activity: 3 }
    const check = async (username: string, userId: string | null = alice) => onboarding.GET(await json("GET", `/api/user/onboarding?username=${encodeURIComponent(username)}`, undefined, userId))
    const finish = async (body: unknown, userId: string | null = alice) => onboarding.POST(await json("POST", "/api/user/onboarding", body, userId))

    it("checks usernames as they're typed, ignoring case", async () => {
        expect(await (await check("BOB.B")).json()).toEqual({ available: false, message: "That username is taken" })
        expect(await (await check("alice_lifts")).json()).toEqual({ available: true })
        expect(await (await check("b_b")).json()).toEqual({ available: true })
        expect(await (await check("ab")).json()).toEqual({ available: false, message: "Usernames are 3 to 20 characters" })
        expect((await check("bob.b", null)).status).toBe(401)
        fakeDb.failOn("profiles")
        expect((await check("someone")).status).toBe(500)
    })

    it("saves the details with the privacy choices and marks onboarding done", async () => {
        const res = await finish({ ...details, privacy: "public", sharing: { photos: "everyone", diet: "followers" }, weightUnit: "kg" })
        expect(res.status).toBe(201)
        expect(fakeDb.rows("profiles")[0]).toMatchObject({ display_username: "jordan.lifts", height_cm: 175, weight_lbs: 171, activity_level: 3, profile_privacy: "public", isOnboarded: true })
        expect(fakeDb.rows("user_settings")).toEqual([expect.objectContaining({ user_id: alice, photos_audience: "everyone", diet_audience: "followers", weight_unit: "kg" })])
    })

    it("starts private, showing nothing", async () => {
        await finish(details)
        expect(fakeDb.rows("profiles")[0].profile_privacy).toBe("private")
        expect(fakeDb.rows("user_settings")).toEqual([])
    })

    it("still finishes when the settings can't be saved", async () => {
        fakeDb.failOn("user_settings")
        expect((await finish({ ...details, weightUnit: "lb" })).status).toBe(201)
    })

    it.each([
        [null, 400, "Invalid request"],
        [{ ...details, privacy: "friends" }, 400, "Invalid privacy choices"],
        [{ ...details, sharing: [] }, 400, "Invalid privacy choices"],
        [{ ...details, age: 12, name: "" }, 400, "Some details need fixing"],
        [{ ...details, username: "Bob.B" }, 409, "That username is taken"],
    ])("rejects %j", async (body, status, message) => {
        const res = await finish(body)
        expect(res.status).toBe(status)
        expect((await res.json()).message).toBe(message)
        expect(fakeDb.rows("profiles")[0].isOnboarded).toBeUndefined()
    })

    it("catches a username claimed between the check and the save", async () => {
        fakeDb.failOn("profiles", "update", { code: "23505", message: "duplicate key value" })
        expect((await finish(details)).status).toBe(409)
        fakeDb.reset()
        fakeDb.failOn("profiles", "update")
        expect((await finish(details)).status).toBe(500)
    })

    it("requires a signed-in user", async () => {
        expect((await finish(details, null)).status).toBe(401)
    })
})

describe("/api/user/export", () => {
    it("downloads everything stored about the user, and nothing about anyone else", async () => {
        fakeDb.seed("food_log_entries", [{ user_id: alice, name: "Oats", created_at: "1" }, { user_id: bob, name: "Bob's lunch", created_at: "2" }])
        fakeDb.seed("follows", [{ follower_id: alice, following_id: bob, created_at: "1" }])
        fakeDb.seed("id_verifications", [{ user_id: alice, status: "verified", document_type: "passport", fingerprint: "secret", wrapped_key: "secret" }])
        const res = await exporter.GET(await json("GET", "/api/user/export"))
        expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="progressx-data-\d{4}-\d{2}-\d{2}\.json"$/)
        const data = await res.json()
        expect(data.profile).toMatchObject({ id: alice })
        expect(data.foodLog).toEqual([expect.objectContaining({ name: "Oats" })])
        expect(data.following).toHaveLength(1)
        expect(data.followers).toEqual([])
        expect(data.idVerification).toEqual({ status: "verified", document_type: "passport", issuing_country: null, expires_on: null, verified_at: null, created_at: null, updated_at: null })
        expect(JSON.stringify(data)).not.toContain("Bob's lunch")
        expect(JSON.stringify(data)).not.toContain("secret")
    })

    it("requires a signed-in user, and reports errors", async () => {
        expect((await exporter.GET(await json("GET", "/api/user/export", undefined, null))).status).toBe(401)
        fakeDb.failOn("workout_sets")
        expect((await exporter.GET(await json("GET", "/api/user/export"))).status).toBe(500)
    })
})

describe("DELETE /api/user/account", () => {
    const remove = async (body: unknown, userId: string | null = alice) => account.DELETE(await json("DELETE", "/api/user/account", body, userId))

    beforeEach(() => {
        cloud.api.delete_resources.mockImplementation(async (ids: string[]) => ({ deleted: Object.fromEntries(ids.map((id) => [id, id.endsWith("gone") ? "not_found" : "deleted"])) }))
        cloud.api.delete_resources_by_tag.mockResolvedValue({ deleted: { "uploads/stray": "deleted" } })
        authAdmin.deleteUser.mockResolvedValue({ error: null })
        fakeDb.seed("photo_collection", [
            { user_id: alice, image_link: cdn("p1"), created_at: "1" },
            { user_id: alice, image_link: cdn("gone"), created_at: "2" },
            { user_id: alice, image_link: "https://lh3.googleusercontent.com/me.jpg", created_at: "3" },
            { user_id: bob, image_link: cdn("bobs"), created_at: "4" },
        ])
    })

    it("needs the account's email typed to confirm", async () => {
        expect((await remove({ confirmEmail: "bob@example.com" })).status).toBe(400)
        expect((await remove({})).status).toBe(400)
        expect((await remove({ confirmEmail: "x" }, null)).status).toBe(401)
        expect(authAdmin.deleteUser).not.toHaveBeenCalled()
    })

    it("deletes the user's images, videos and ID files, then the login", async () => {
        vi.stubEnv("R2_ACCOUNT_ID", "acct")
        vi.stubEnv("R2_ACCESS_KEY_ID", "k")
        vi.stubEnv("R2_SECRET_ACCESS_KEY", "s")
        vi.stubEnv("R2_ID_ACCESS_KEY_ID", "k")
        vi.stubEnv("R2_ID_SECRET_ACCESS_KEY", "s")
        vi.stubEnv("ID_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"))
        vi.stubEnv("ID_FINGERPRINT_KEY", Buffer.alloc(32, 2).toString("base64"))
        fakeR2.put("progressx-videos", `videos/${alice}/v1.mp4`, "x")
        fakeR2.put("progressx-videos", `videos/${alice}/v1.jpg`, "x")
        fakeR2.put("progressx-videos", `videos/${bob}/v2.mp4`, "x")
        fakeR2.put("progressx-ids", `ids/${alice}/a/front.bin`, "x")

        const res = await remove({ confirmEmail: "  alice@example.COM " })
        expect(await res.json()).toEqual({ message: "Your account and all of its data have been deleted" })
        expect(res.cookies.get("token")?.value).toBe("")
        expect(cloud.api.delete_resources).toHaveBeenCalledWith(["uploads/old", "uploads/p1", "uploads/gone"], { resource_type: "image", invalidate: true })
        expect(cloud.api.delete_resources_by_tag).toHaveBeenCalledWith(`user_${alice}`, { resource_type: "image", invalidate: true })
        expect(fakeR2.keys("progressx-videos")).toEqual([`videos/${bob}/v2.mp4`])
        expect(fakeR2.keys("progressx-ids")).toEqual([])
        expect(authAdmin.deleteUser).toHaveBeenCalledWith(alice)
        expect(console.log).toHaveBeenCalledWith("Account deleted (3 images removed from Cloudinary, 2 video files from R2)")
    })

    it("works without video or ID storage set up when there's nothing stored there", async () => {
        expect((await remove({ confirmEmail: "alice@example.com" })).status).toBe(200)
    })

    it.each([
        ["videos it can't reach", () => fakeDb.seed("videos", [{ user_id: alice, id: "v" }]), /^Couldn't delete your videos right now/],
        ["an ID it can't reach", () => fakeDb.seed("id_verifications", [{ user_id: alice, status: "verified" }]), /^Couldn't delete your ID documents right now/],
        ["Cloudinary refusing", () => cloud.api.delete_resources.mockResolvedValue({ deleted: { "uploads/old": "error" } }), /^Couldn't delete your photos right now/],
    ])("stops before deleting anything when there are %s", async (_case, arrange, message) => {
        arrange()
        const res = await remove({ confirmEmail: "alice@example.com" })
        expect(res.status).toBe(502)
        expect((await res.json()).message).toMatch(message)
        expect(authAdmin.deleteUser).not.toHaveBeenCalled()
    })

    it.each([["videos"], ["id_verifications"]])("stops when the %s check fails", async (table) => {
        fakeDb.failOn(table)
        expect((await remove({ confirmEmail: "alice@example.com" })).status).toBe(502)
    })

    it("reports a login that couldn't be deleted", async () => {
        authAdmin.deleteUser.mockResolvedValue({ error: { message: "boom" } })
        expect((await remove({ confirmEmail: "alice@example.com" })).status).toBe(500)
    })

    it("reports a profile that can't be loaded", async () => {
        fakeDb.failOn("profiles")
        expect((await remove({ confirmEmail: "alice@example.com" })).status).toBe(500)
    })
})

describe("progress photos and the profile picture", () => {
    const png = () => sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    async function upload(route: { POST: (req: NextRequest) => Promise<Response> }, file: File | null, userId: string | null = alice, headers: Record<string, string> = {}) {
        const form = new FormData()
        if (file) form.append("file", file)
        const signed = await apiRequest("/upload", { userId })
        return route.POST(new NextRequest(signed.url, { method: "POST", headers: { cookie: signed.headers.get("cookie") ?? "", ...headers }, body: form }))
    }
    const file = async (bytes?: Buffer, name = "me.png") => new File([new Uint8Array(bytes ?? await png())], name, { type: "image/png" })

    it("adds a progress photo as a clean JPEG tagged with the user", async () => {
        const res = await upload(uploadImage, await file())
        expect(await res.json()).toMatchObject({ message: "Image uploaded", url: cdn("new"), photo: { image_link: cdn("new"), description: "" } })
        const [dataUri, options] = cloud.uploader.upload.mock.calls[0]
        expect(dataUri).toMatch(/^data:image\/jpeg;base64,\/9j\//)
        expect(options).toEqual({ folder: "uploads", resource_type: "image", allowed_formats: ["jpg"], tags: [`user_${alice}`] })
    })

    it.each([
        ["no file", null, 400],
        ["a file that isn't an image", new File(["<svg onload=alert(1)>"], "x.png", { type: "image/png" }), 415],
        ["a damaged image", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2])], "x.png"), 415],
    ])("refuses %s", async (_case, bad, status) => {
        expect((await upload(uploadImage, bad)).status).toBe(status)
        expect((await upload(uploadProfileImage, bad)).status).toBe(status)
        expect(cloud.uploader.upload).not.toHaveBeenCalled()
    })

    it("refuses uploads that are too big, or without a login", async () => {
        expect((await upload(uploadImage, await file(), alice, { "content-length": String(11 * 1024 * 1024) })).status).toBe(413)
        expect((await upload(uploadImage, await file(), null)).status).toBe(401)
        expect((await upload(uploadProfileImage, await file(), null)).status).toBe(401)
    })

    it("reports a photo that couldn't be stored", async () => {
        fakeDb.failOn("photo_collection")
        expect((await upload(uploadImage, await file())).status).toBe(500)
        cloud.uploader.upload.mockRejectedValue(new Error("Cloudinary down"))
        expect((await upload(uploadImage, await file())).status).toBe(500)
    })

    it("lists the user's photos newest first, with the blur setting", async () => {
        fakeDb.seed("photo_collection", [
            { id: "1", user_id: alice, image_link: cdn("a"), description: "", created_at: "2026-01-01" },
            { id: "2", user_id: alice, image_link: cdn("b"), description: "", created_at: "2026-02-01" },
            { id: "3", user_id: bob, image_link: cdn("c"), description: "", created_at: "2026-03-01" },
        ])
        fakeDb.seed("user_settings", [{ user_id: alice, blur_progress_photos: true }])
        const body = await (await getImages.GET(await json("GET", "/api/user/userImages/getUserImages"))).json()
        expect(body.images.map((i: { id: string }) => i.id)).toEqual(["2", "1"])
        expect(body.blurPhotos).toBe(true)
        expect((await getImages.GET(await json("GET", "/x", undefined, null))).status).toBe(401)
        fakeDb.failOn("user_settings")
        expect((await getImages.GET(await json("GET", "/x"))).status).toBe(500)
        fakeDb.failOn("photo_collection")
        expect((await getImages.GET(await json("GET", "/x"))).status).toBe(500)
    })

    it("deletes only the user's own photos, from Cloudinary and the database", async () => {
        fakeDb.seed("photo_collection", [{ id: "mine", user_id: alice, image_link: cdn("a") }, { id: "theirs", user_id: bob, image_link: cdn("b") }])
        const remove = async (body: unknown, userId: string | null = alice) => deleteImage.POST(await json("POST", "/api/user/userImages/deleteUserImages", body, userId))
        expect((await remove({ id: "theirs" })).status).toBe(404)
        expect((await remove({})).status).toBe(400)
        expect((await remove({ id: "mine" }, null)).status).toBe(401)
        cloud.uploader.destroy.mockResolvedValueOnce({ result: "not found" })
        expect((await remove({ id: "mine" })).status).toBe(200)
        expect(cloud.uploader.destroy).toHaveBeenCalledWith("uploads/a")
        expect(fakeDb.rows("photo_collection").map((p) => p.id)).toEqual(["theirs"])
    })

    it("keeps the photo when it can't be deleted", async () => {
        fakeDb.seed("photo_collection", [{ id: "mine", user_id: alice, image_link: cdn("a") }])
        const remove = async () => deleteImage.POST(await json("POST", "/api/user/userImages/deleteUserImages", { id: "mine" }))
        cloud.uploader.destroy.mockResolvedValueOnce({ result: "error" })
        expect((await remove()).status).toBe(500)
        fakeDb.failOn("photo_collection", "delete")
        expect((await remove()).status).toBe(500)
        fakeDb.failOn("photo_collection", "select")
        expect((await remove()).status).toBe(500)
        expect(fakeDb.rows("photo_collection")).toHaveLength(1)
    })

    it("replaces the profile picture, removing the old one only after the new one is saved", async () => {
        const res = await upload(uploadProfileImage, await file())
        expect(await res.json()).toEqual({ imageReference: cdn("new") })
        expect(fakeDb.rows("profiles")[0].profile_image).toBe(cdn("new"))
        expect(cloud.uploader.destroy).toHaveBeenCalledWith("uploads/old")

        // a failed clean-up of the old one isn't the user's problem
        cloud.uploader.destroy.mockResolvedValueOnce({ result: "not found" })
        expect((await upload(uploadProfileImage, await file())).status).toBe(200)
        cloud.uploader.destroy.mockRejectedValueOnce(new Error("Cloudinary down"))
        expect((await upload(uploadProfileImage, await file())).status).toBe(200)
    })

    it("cleans up the new upload when the profile can't be updated", async () => {
        fakeDb.failOn("profiles", "update")
        expect((await upload(uploadProfileImage, await file())).status).toBe(500)
        expect(cloud.uploader.destroy).toHaveBeenCalledWith("uploads/new")
        expect(fakeDb.rows("profiles")[0].profile_image).toBe(cdn("old"))
    })
})
