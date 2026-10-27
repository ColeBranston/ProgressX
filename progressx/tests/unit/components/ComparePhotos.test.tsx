// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ComparePhotos from "@/app/internal_components/profile/ComparePhotos"
import { beforeAndAfter, timeApart } from "@/app/internal_components/profile/photoCompare"

const photo = (id: string, created_at: string) => ({ id, created_at, image_link: `https://res.cloudinary.com/demo/image/upload/v1/progress/${id}.jpg` })
const march = photo("march", "2026-03-02T09:00:00Z")
const october = photo("october", "2026-10-20T09:00:00Z")

describe("photoCompare", () => {
    it("puts the older photo first, whichever order they were picked in", () => {
        expect(beforeAndAfter(october, march)).toEqual([march, october])
        expect(beforeAndAfter(march, october)).toEqual([march, october])
    })

    it("says how far apart they were taken", () => {
        expect(timeApart("2026-10-20T08:00:00Z", "2026-10-20T20:00:00Z")).toBe("Same day")
        expect(timeApart("2026-10-01", "2026-10-02")).toBe("1 day apart")
        expect(timeApart("2026-10-01", "2026-10-13")).toBe("12 days apart")
        expect(timeApart("2026-10-01", "2026-10-22")).toBe("3 weeks apart")
        expect(timeApart("2026-03-02", "2026-10-20")).toBe("8 months apart")
        expect(timeApart("2025-10-20", "2026-10-20")).toBe("1 year apart")
        expect(timeApart("2024-10-20", "2026-01-20")).toBe("1 year, 3 months apart")
    })
})

describe("ComparePhotos", () => {
    it("shows the two photos side by side, before on the left, with their dates", () => {
        render(<ComparePhotos first={october} second={march} blurred={false} onChange={() => {}} onClose={() => {}} />)
        expect(screen.getByRole("dialog", { name: "Compare progress photos" })).toHaveTextContent("8 months apart")
        const captions = screen.getAllByRole("figure").map((figure) => figure.textContent)
        expect(captions).toEqual(["BeforeMarch 2, 2026", "AfterOctober 20, 2026"])
        expect(screen.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual(["Progress photo from March 2, 2026", "Progress photo from October 20, 2026"])
    })

    it("keeps both photos blurred until you choose to show them", async () => {
        render(<ComparePhotos first={march} second={october} blurred onChange={() => {}} onClose={() => {}} />)
        expect(screen.getAllByRole("img").every((img) => img.getAttribute("alt")?.startsWith("Blurred"))).toBe(true)
        expect(screen.getAllByRole("img").every((img) => img.getAttribute("src")?.includes("e_blur"))).toBe(true)

        await userEvent.click(screen.getByRole("button", { name: "Show photos" }))
        expect(screen.getAllByRole("img").some((img) => img.getAttribute("alt")?.startsWith("Blurred"))).toBe(false)
        await userEvent.click(screen.getByRole("button", { name: "Blur again" }))
        expect(screen.getAllByRole("img").every((img) => img.getAttribute("alt")?.startsWith("Blurred"))).toBe(true)
    })

    it("lets you pick different photos, and closes with the button or Escape", async () => {
        const onChange = vi.fn(), onClose = vi.fn()
        render(<ComparePhotos first={march} second={october} blurred={false} onChange={onChange} onClose={onClose} />)
        await userEvent.click(screen.getByRole("button", { name: "Change photos" }))
        expect(onChange).toHaveBeenCalled()
        await userEvent.click(screen.getByRole("button", { name: "Close" }))
        await userEvent.keyboard("{Escape}")
        expect(onClose).toHaveBeenCalledTimes(2)
    })
})
