import { describe, expect, it } from "vitest"
import { isValidConsent } from "@/app/api/libs/consent"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

describe("isValidConsent", () => {
    it("needs both boxes ticked for the current terms version", () => {
        expect(isValidConsent({ acceptedTerms: true, confirmedAge: true, termsVersion: TERMS_VERSION })).toBe(true)
    })
    it.each([
        [{ acceptedTerms: true, confirmedAge: false, termsVersion: TERMS_VERSION }],
        [{ acceptedTerms: "true", confirmedAge: true, termsVersion: TERMS_VERSION }],
        [{ acceptedTerms: true, confirmedAge: true, termsVersion: "2020-01-01" }],
        [null],
        [undefined],
    ])("rejects %j", (body) => {
        expect(isValidConsent(body)).toBe(false)
    })
})
