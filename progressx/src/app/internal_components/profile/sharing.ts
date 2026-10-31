// What a profile can show besides videos, and who to: each kind has its own audience, chosen in onboarding or
// Settings > Profile privacy. Signed-out visitors and search engines never see any of it.
//   only_me    nobody else (the default for everything)
//   followers  approved followers (following a private profile needs the owner's approval)
//   everyone   anyone signed in, on a public profile; on a private profile that's the same as followers,
//              since only followers can see it at all

export const SHARE_KINDS = ["photos", "weight", "workouts", "diet"] as const
export type ShareKind = typeof SHARE_KINDS[number]

export const AUDIENCES = ["only_me", "followers", "everyone"] as const
export type Audience = typeof AUDIENCES[number]
export type ShareAudiences = Record<ShareKind, Audience>
export const DEFAULT_AUDIENCES: ShareAudiences = { photos: "only_me", weight: "only_me", workouts: "only_me", diet: "only_me" }

export const AUDIENCE_LABELS: Record<Audience, string> = { only_me: "Only me", followers: "Followers", everyone: "Everyone" }

// What a particular viewer can open on someone's profile (worked out on the server)
export type Sharing = Record<ShareKind, boolean>
export const NO_SHARING: Sharing = { photos: false, weight: false, workouts: false, diet: false }

export const SHARE_OPTIONS: Record<ShareKind, { label: string, description: string }> = {
    photos: {
        label: "Progress photos",
        description: "Your progress photos, with the dates you took them.",
    },
    weight: {
        label: "Weight",
        description: "Your weigh-ins and how your weight has changed over time.",
    },
    workouts: {
        label: "Workouts",
        description: "The exercises you log, with their sets, reps and weights.",
    },
    diet: {
        label: "Diet",
        description: "The foods you log each day, and how your calories and macros compare to your targets (which are worked out from your body stats).",
    },
}

export function isShareKind(value: unknown): value is ShareKind {
    return SHARE_KINDS.includes(value as ShareKind)
}

export function isAudience(value: unknown): value is Audience {
    return AUDIENCES.includes(value as Audience)
}

// Reads { photos?, weight?, workouts?, diet? } of audiences from a request: only the ones sent are returned.
// null when anything in it is malformed.
export function readAudiences(value: unknown): Partial<ShareAudiences> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const result: Partial<ShareAudiences> = {}
    for (const [key, audience] of Object.entries(value)) {
        if (!isShareKind(key) || !isAudience(audience)) return null
        result[key] = audience
    }
    return result
}

// Explains what an audience means for this profile, for Settings and onboarding
export function audienceNote(privacy: "public" | "private"): string {
    return privacy === "public"
        ? "Followers means only people who follow you; Everyone means anyone signed in to ProgressX. None of it is shown to people without an account or to search engines."
        : "Your profile is private, so only followers you've approved can see anything: Followers and Everyone both mean them."
}
