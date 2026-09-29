import { supabase } from "@/app/supabaseClient/client";
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo";

export type ConsentSource = "signup" | "google" | "reconsent"

// The body every consent request sends: both boxes ticked, for the version of the terms on screen
export function isValidConsent(body: unknown): boolean {
    const consent = (body ?? {}) as { acceptedTerms?: unknown, confirmedAge?: unknown, termsVersion?: unknown }
    return consent.acceptedTerms === true && consent.confirmedAge === true && consent.termsVersion === TERMS_VERSION
}

// Marks the profile as agreeing to the current terms and adds a row to the consent audit trail
export async function recordConsent(userId: string, source: ConsentSource, userAgent: string | null) {
    const now = new Date().toISOString()

    const { error: profileError } = await supabase
        .from("profiles")
        .update({ terms_version: TERMS_VERSION, terms_accepted_at: now, age_confirmed_at: now })
        .eq("id", userId)
    if (profileError) throw profileError

    const { error: eventError } = await supabase.from("consent_events").insert({
        user_id: userId,
        terms_version: TERMS_VERSION,
        age_confirmed: true,
        source,
        user_agent: userAgent ? userAgent.slice(0, 400) : null,
    })
    if (eventError) throw eventError
}
