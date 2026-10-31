// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Bone, Circle, SkeletonStatus } from "@/app/internal_components/skeleton/Skeleton"
import StatsSkeleton from "@/app/(main)/mystats/StatsSkeleton"
import DietSkeleton from "@/app/(main)/mydiet/DietSkeleton"
import ProfileSkeleton from "@/app/internal_components/profile/ProfileSkeleton"
import SharedTracking from "@/app/internal_components/profile/SharedTracking"

afterEach(() => vi.unstubAllGlobals())

const bones = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>("[data-skeleton]")]

describe("skeleton pieces", () => {
    it("announces what's loading once, and hides the placeholder shapes from screen readers", () => {
        render(<SkeletonStatus label="Loading things"><Bone width={120} height={20} /><Circle size={40} /></SkeletonStatus>)
        const status = screen.getByRole("status", { name: "Loading things" })
        expect(status).toHaveAttribute("aria-busy", "true")
        expect(status).toHaveTextContent("Loading things…")
        expect(bones(status)).toHaveLength(2)
        expect(bones(status).every((bone) => bone.getAttribute("aria-hidden") === "true")).toBe(true)
    })

    it("sizes a bone, and makes a circle round", () => {
        render(<SkeletonStatus label="Loading"><Bone width="60%" height={12} radius={4} /><Circle size={44} /></SkeletonStatus>)
        const [ bone, circle ] = bones(screen.getByRole("status"))
        expect(bone.style).toMatchObject({ width: "60%", height: "12px", borderRadius: "4px" })
        expect(circle.style).toMatchObject({ width: "44px", height: "44px", borderRadius: "50%" })
    })
})

describe("page skeletons", () => {
    it("shapes a stats tab like the real one: tiles, then chart cards", () => {
        render(<StatsSkeleton label="Loading your stats" tiles={5} charts={["wide", "half", "half"]} />)
        const status = screen.getByRole("status", { name: "Loading your stats" })
        expect(screen.getAllByTestId("chart-skeleton")).toHaveLength(3)
        expect(status).toHaveTextContent("Loading your stats…")
        expect(bones(status).length).toBeGreaterThan(15)
    })

    it("leaves the tiles out where a tab has none", () => {
        const { container } = render(<StatsSkeleton label="Loading your workouts" controls="tabs" charts={["wide"]} />)
        // controls (2) and one chart card (3 header pieces and the chart)
        expect(bones(container)).toHaveLength(6)
    })

    it("draws the diet page and a profile while they load", () => {
        render(<><DietSkeleton /><ProfileSkeleton /></>)
        expect(bones(screen.getByRole("status", { name: "Loading your diet" })).length).toBeGreaterThan(20)
        expect(bones(screen.getByRole("status", { name: "Loading profile" })).length).toBeGreaterThan(10)
    })

    it("shows placeholder tiles while someone's shared tracking loads", () => {
        vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
        render(<SharedTracking username="ann" kind="weight" />)
        expect(bones(screen.getByRole("status", { name: "Loading weight" })).length).toBeGreaterThan(5)
    })
})
