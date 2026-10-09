// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ConsentChecks, { consentPayload } from "@/app/internal_components/legal/ConsentChecks"
import { TERMS_VERSION } from "@/app/internal_components/legal/legalInfo"

describe("ConsentChecks", () => {
    it("reports each box separately", async () => {
        const onChange = vi.fn()
        render(<ConsentChecks value={{ confirmedAge: false, acceptedTerms: false }} onChange={onChange} />)
        await userEvent.click(screen.getByRole("checkbox", { name: /18 years of age or older/ }))
        expect(onChange).toHaveBeenLastCalledWith({ confirmedAge: true, acceptedTerms: false })
        await userEvent.click(screen.getByRole("checkbox", { name: /Terms of Service/ }))
        expect(onChange).toHaveBeenLastCalledWith({ confirmedAge: false, acceptedTerms: true })
    })

    it("links to the legal pages in a new tab without an opener", () => {
        render(<ConsentChecks value={{ confirmedAge: true, acceptedTerms: true }} onChange={() => {}} />)
        for (const [name, href] of [["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"]]) {
            const link = screen.getByRole("link", { name })
            expect(link).toHaveAttribute("href", href)
            expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
        }
        expect(screen.getAllByRole("checkbox").every((box) => (box as HTMLInputElement).required)).toBe(true)
    })

    it("sends the terms version that was on screen", () => {
        expect(consentPayload({ confirmedAge: true, acceptedTerms: true })).toEqual({ confirmedAge: true, acceptedTerms: true, termsVersion: TERMS_VERSION })
    })
})
