// Shared details for the privacy policy and terms of service; update here and both pages follow
export const LEGAL_LAST_UPDATED = "October 8, 2026"
export const LEGAL_CONTACT_EMAIL = "support@progressx.ca"
export const LEGAL_GOVERNING_LAW = "the Province of Ontario and the federal laws of Canada applicable therein"
export const LEGAL_MINIMUM_AGE = 18

// Person accountable for ProgressX's handling of personal information (PIPEDA principle 1; Quebec
// Law 25 requires publishing their name and title)
export const PRIVACY_OFFICER_NAME = "Cole Branston"
export const PRIVACY_OFFICER_TITLE = "Privacy Officer"
export const PRIVACY_OFFICER_EMAIL = "cole.branston@progressx.ca"

// Version of the terms + privacy policy users agree to. Change it whenever either document changes
// materially: everyone is then asked to agree again (see middleware and /consent) before continuing.
export const TERMS_VERSION = "2026-10-08" // 2026-09-28.2: not available to Quebec residents; 2026-10-08: government ID verification
