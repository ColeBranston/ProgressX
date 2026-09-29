import { NextRequest, NextResponse } from "next/server";
import { createAuthClient, supabase } from "@/app/supabaseClient/client";
import { getUserIdFromRequest } from "../../libs/helpers";
import { clearSessionCookies } from "../../libs/session";
import { deleteUserImages } from "../../libs/accountData";

// DELETE /api/user/account  { confirmEmail }
// Permanently deletes the signed-in user's account and everything stored about them:
//   1. every image in Cloudinary (profile picture, progress photos, anything tagged with their id)
//   2. the login (auth.users), which cascades to the profile and every table of their data
// Images go first: if Cloudinary fails, nothing has been deleted yet and the user can simply try again.
// The request must repeat the account's email address, so it can't be triggered by a stray click.
export async function DELETE(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const confirmEmail = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : ""

    const { data: profile, error: profileError } = await supabase.from("profiles").select("email").eq("id", userId).single()
    if (profileError) {
        console.log("Error loading profile for account deletion: ", profileError)
        return NextResponse.json({ message: "Couldn't delete your account, please try again" }, { status: 500 })
    }

    if (!confirmEmail || confirmEmail !== String(profile?.email ?? "").trim().toLowerCase()) {
        return NextResponse.json({ message: "Type your account's email address to confirm" }, { status: 400 })
    }

    let images
    try {
        images = await deleteUserImages(userId)
    } catch (e) {
        console.log("Account deletion stopped: couldn't delete images from Cloudinary: ", e)
        return NextResponse.json({ message: "Couldn't delete your photos right now, so nothing was deleted. Please try again." }, { status: 502 })
    }

    const { error: deleteError } = await createAuthClient().auth.admin.deleteUser(userId)
    if (deleteError) {
        console.log("Error deleting auth user: ", deleteError)
        return NextResponse.json({ message: "Your photos were deleted but your account couldn't be. Please try again." }, { status: 500 })
    }

    // no email or other personal details in the log, just that it happened
    console.log(`Account deleted (${images.deleted} images removed from Cloudinary)`)

    const res = NextResponse.json({ message: "Your account and all of its data have been deleted" })
    clearSessionCookies(res)
    return res
}
