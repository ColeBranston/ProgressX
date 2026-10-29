// What a public profile can show besides videos. Each one is off until the person turns it on (in
// onboarding or Settings > Profile privacy), only applies while their profile is public, and is only
// shown to people signed in to ProgressX: never to visitors without an account or search engines.

export const SHARE_KINDS = ["photos", "weight", "workouts", "diet"] as const
export type ShareKind = typeof SHARE_KINDS[number]
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

// Reads { photos?, weight?, workouts?, diet? } from a request: only true/false values are accepted, and only
// the ones sent are returned. null when anything in it is malformed.
export function readSharing(value: unknown): Partial<Sharing> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const result: Partial<Sharing> = {}
    for (const [key, on] of Object.entries(value)) {
        if (!isShareKind(key) || typeof on !== "boolean") return null
        result[key] = on
    }
    return result
}
