import type { Metadata } from "next";
import { findProfileByUsername } from "@/app/api/libs/videos";

type Props = { params: Promise<{ username: string }>, children: React.ReactNode }

// Search engines index public profiles (their title and bio); private and unknown ones are kept out
export async function generateMetadata({ params }: { params: Props["params"] }): Promise<Metadata> {
    const { username } = await params
    let name = username
    try { name = decodeURIComponent(username) } catch { /* already decoded */ }

    try {
        const profile = await findProfileByUsername<{ display_username: string, display_name: string | null, profile_bio: string | null, profile_privacy: string | null }>(
            name, "display_username, display_name, profile_bio, profile_privacy",
        )
        if (profile?.profile_privacy === "public") {
            const title = profile.display_name ? `${profile.display_name} (@${profile.display_username})` : `@${profile.display_username}`
            return {
                title: `${title} | ProgressX`,
                description: profile.profile_bio?.trim() || `Workout and fitness videos from @${profile.display_username} on ProgressX.`,
                alternates: { canonical: `/profile/${encodeURIComponent(profile.display_username)}` },
            }
        }
    } catch (e) {
        console.log("Couldn't load a profile's page details: ", e instanceof Error ? e.message : e)
    }
    return { title: "Profile | ProgressX", robots: { index: false, follow: false } }
}

export default function ProfileLayout({ children }: Props) {
    return children
}
