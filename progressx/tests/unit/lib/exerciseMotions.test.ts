import { describe, expect, it } from "vitest"
import { EXERCISES } from "@/app/internal_components/mystats/exercises"
import {
    BODY_HALF_WIDTHS,
    FALLBACK_MOTION,
    FLOOR_Y,
    MOTIONS,
    Motion,
    Pose,
    Primitive,
    SEGMENT_LENGTHS,
    SolvedLimb,
    Vec,
    anklePadAt,
    backBarAt,
    directionOf,
    frameAt,
    hipBarAt,
    platformAt,
    solvePose,
} from "@/app/internal_components/mystats/exerciseMotions"

const entries = Object.entries(MOTIONS)
const STEPS = Array.from({ length: 21 }, (_, i) => i / 20)
const distance = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1])
const coords = (prim: Primitive) => prim.kind === "line" ? [prim.x1, prim.y1, prim.x2, prim.y2] : [prim.cx, prim.cy, prim.r]
const isTarget = (limb: Pose["arm"] | undefined) => limb !== undefined && !Array.isArray(limb)

describe("motion library", () => {
    it("has a motion for every exercise", () => {
        const missing = EXERCISES.filter((exercise) => !MOTIONS[exercise.motion]).map((exercise) => exercise.id)
        expect(missing).toEqual([])
    })

    it("falls back to the curl", () => {
        expect(FALLBACK_MOTION).toBe(MOTIONS["curl"])
    })

    it("reuses the seated shoulder press for the machine version, with handles", () => {
        expect(MOTIONS["machine-shoulder-press"]).toMatchObject({ a: MOTIONS["seated-shoulder-press"].a, b: MOTIONS["seated-shoulder-press"].b, grip: "handle" })
    })

    // a limb that is a target in one pose and angles in the other snaps halfway instead of moving
    it.each(entries)("%s uses the same kind of limb (and the same bend) in both poses", (_, motion) => {
        for (const key of ["arm", "arm2", "leg", "leg2"] as const) {
            const a = motion.a[key]
            const b = motion.b[key]
            expect(a === undefined, key).toBe(b === undefined)
            expect(isTarget(a), key).toBe(isTarget(b))
            if (isTarget(a) && isTarget(b)) {
                expect((a as { bend: number }).bend, key).toBe((b as { bend: number }).bend)
                expect((a as { rel?: string }).rel, key).toBe((b as { rel?: string }).rel)
            }
        }
    })
})

describe("frameAt", () => {
    it.each(entries)("%s keeps the same primitives through the rep, so it can animate in place", (_, motion) => {
        const shape = (t: number) => frameAt(motion, t).map((prim) => `${prim.kind}:${prim.cls}`)
        const first = shape(0)
        expect(first.length).toBeGreaterThan(0)
        for (const t of STEPS) expect(shape(t)).toEqual(first)
    })

    it.each(entries)("%s stays finite and roughly inside the drawing area", (_, motion) => {
        for (const t of STEPS) {
            for (const prim of frameAt(motion, t)) {
                for (const value of coords(prim)) expect(Number.isFinite(value)).toBe(true)
                const [x, y] = prim.kind === "line" ? [prim.x2, prim.y2] : [prim.cx, prim.cy]
                expect(x).toBeGreaterThan(-20)
                expect(x).toBeLessThan(140)
                expect(y).toBeGreaterThan(-20)
                expect(y).toBeLessThan(FLOOR_Y + 20)
            }
        }
    })

    it.each(entries)("%s moves smoothly: no joint jumps between nearby frames", (_, motion) => {
        let previous = frameAt(motion, 0)
        for (let i = 1; i <= 100; i++) {
            const next = frameAt(motion, i / 100)
            next.forEach((prim, p) => {
                const before = coords(previous[p])
                coords(prim).forEach((value, c) => expect(Math.abs(value - before[c])).toBeLessThan(3))
            })
            previous = next
        }
    })

    it("draws a head of the shared radius and a torso in every frame", () => {
        for (const [, motion] of entries) {
            const prims = frameAt(motion, 0.5)
            expect(prims.filter((prim) => prim.cls === "head")).toHaveLength(1)
            expect(prims.filter((prim) => prim.cls === "torso")).toHaveLength(1)
        }
    })

    it("adds the equipment the motion asks for", () => {
        const classes = (id: string) => frameAt(MOTIONS[id], 0.5).map((prim) => prim.cls)
        const withFlag = (flag: keyof Motion) => entries.filter(([, motion]) => motion[flag]).map(([id]) => id)

        for (const id of withFlag("backBar")) expect(classes(id)).toContain("plate")
        for (const id of withFlag("hipBar")) expect(classes(id)).toContain("plate")
        for (const id of withFlag("platform")) expect(classes(id)).toContain("platform")
        for (const id of withFlag("anklePad")) expect(classes(id)).toContain("pad")
        for (const id of withFlag("cable")) expect(classes(id)).toContain("cable")
        for (const [id, motion] of entries) {
            if (motion.grip === "handle") expect(classes(id)).toContain("handle")
            if (motion.grip === "barbell" && motion.view === "front") expect(classes(id)).toEqual(expect.arrayContaining(["bar", "plateSide"]))
            if (motion.grip === "dumbbell") expect(classes(id).some((cls) => cls === "dumbbell" || cls === "plate")).toBe(true)
            if (!motion.grip && !motion.backBar && !motion.hipBar) expect(classes(id)).not.toContain("plate")
        }
    })

    it("draws one cable per hand in the front view, mirrored across the figure", () => {
        const [id, motion] = entries.find(([, m]) => m.view === "front" && m.cable)!
        const cables = frameAt(motion, 0.3).filter((prim) => prim.cls === "cable")
        expect(cables, id).toHaveLength(2)
        const [left, right] = cables as Extract<Primitive, { kind: "line" }>[]
        expect(left.x1 + right.x1).toBeCloseTo(120)
        expect(left.y1).toBeCloseTo(right.y1)
    })

    it("only gives the near hand a dumbbell when gripHands is near", () => {
        const [id, motion] = entries.find(([, m]) => m.gripHands === "near")!
        const both = { ...motion, gripHands: "both" as const }
        const plates = (m: Motion) => frameAt(m, 0.5).filter((prim) => prim.cls === "plate").length
        expect(plates(motion), id).toBeLessThan(plates(both))
    })
})

describe("solvePose", () => {
    const limbChecks = (sk: ReturnType<typeof solvePose>, motion: Motion) => {
        const { upperArm, forearm, thigh, shin } = SEGMENT_LENGTHS
        const armScale = sk.pose.armScale ?? 1
        const upperArmScale = sk.pose.upperArmScale ?? armScale
        const thighScale = motion.view === "front" ? sk.pose.thighScale ?? 1 : 1
        const check = (limb: SolvedLimb, upper: number, lower: number) => {
            expect(distance(limb.root, limb.joint)).toBeCloseTo(Math.abs(upper), 6)
            expect(distance(limb.joint, limb.end)).toBeCloseTo(Math.abs(lower), 6)
        }
        sk.arms.forEach((arm) => check(arm, upperArm * upperArmScale, forearm * armScale))
        sk.legs.forEach((leg) => check(leg, thigh * thighScale, shin))
    }

    it.each(entries)("%s keeps every limb its own length through the rep", (_, motion) => {
        for (const t of STEPS) limbChecks(solvePose(motion, t), motion)
    })

    it.each(entries)("%s starts on pose a and ends on pose b", (_, motion) => {
        expect(solvePose(motion, 0).hip).toEqual(motion.a.hip)
        const end = solvePose(motion, 1).hip
        expect(end[0]).toBeCloseTo(motion.b.hip[0])
        expect(end[1]).toBeCloseTo(motion.b.hip[1])
    })

    it("puts the head a fixed distance from the shoulders in the side view", () => {
        for (const [, motion] of entries.filter(([, m]) => m.view === "side")) {
            const sk = solvePose(motion, 0.5)
            expect(distance(sk.head, sk.neck)).toBeCloseTo(SEGMENT_LENGTHS.headOffset)
        }
    })

    it("mirrors the second arm and leg in the front view when only one is given", () => {
        for (const [id, motion] of entries.filter(([, m]) => m.view === "front" && !m.a.arm2 && !m.a.leg2)) {
            const sk = solvePose(motion, 0.4)
            const hipX = sk.hip[0]
            for (const [left, right] of [sk.arms, sk.legs]) {
                expect(left.end[0] + right.end[0], id).toBeCloseTo(2 * hipX)
                expect(left.end[1], id).toBeCloseTo(right.end[1])
            }
            expect(distance(sk.shoulders[0], sk.shoulders[1])).toBeCloseTo(2 * BODY_HALF_WIDTHS.shoulder)
            expect(distance(sk.hips[0], sk.hips[1])).toBeCloseTo(2 * BODY_HALF_WIDTHS.hip)
        }
    })

    it("raises the shoulders for a shrug", () => {
        const shrug = MOTIONS["shrug"]
        expect(solvePose(shrug, 1).shoulders[0][1]).toBeLessThan(solvePose(shrug, 0).shoulders[0][1])
    })

    it("brings the shoulders down when the torso leans toward the viewer", () => {
        const motion = entries.find(([, m]) => m.view === "front" && (m.a.torsoScale ?? 1) < 1 && m.b.torsoScale === 1)![1]
        const leaning = solvePose(motion, 0)
        const upright = solvePose(motion, 1)
        expect(leaning.neck[1] - leaning.hip[1]).toBeGreaterThan(upright.neck[1] - upright.hip[1])
    })

    it("reaches an IK target that is within reach", () => {
        const motion: Motion = {
            view: "side",
            a: { hip: [60, 60], torso: 0, arm: { to: [70, 40], bend: 1 }, leg: { to: [60, 90], bend: -1 } },
            b: { hip: [60, 60], torso: 0, arm: { to: [72, 30], bend: 1 }, leg: { to: [62, 90], bend: -1 } },
        }
        for (const t of [0, 0.5, 1]) {
            const sk = solvePose(motion, t)
            expect(sk.arms[0].end[0]).toBeCloseTo(70 + 2 * t)
            expect(sk.arms[0].end[1]).toBeCloseTo(40 - 10 * t)
            expect(sk.legs[0].end[0]).toBeCloseTo(60 + 2 * t)
            expect(sk.legs[0].end[1]).toBeCloseTo(90)
        }
    })

    it("stretches toward an out-of-reach target without stretching the limb", () => {
        const motion: Motion = {
            view: "side",
            a: { hip: [60, 60], arm: { to: [200, 0], bend: 1 }, leg: [180, 180] },
            b: { hip: [60, 60], arm: { to: [200, 0], bend: 1 }, leg: [180, 180] },
        }
        const sk = solvePose(motion, 0)
        const reach = distance(sk.arms[0].root, sk.arms[0].end)
        expect(reach).toBeLessThanOrEqual(SEGMENT_LENGTHS.upperArm + SEGMENT_LENGTHS.forearm)
        expect(reach).toBeGreaterThan(SEGMENT_LENGTHS.upperArm + SEGMENT_LENGTHS.forearm - 0.1)
        expect(sk.arms[0].end[0]).toBeGreaterThan(sk.neck[0])
    })

    it("solves targets relative to the shoulder or hip", () => {
        const motion: Motion = {
            view: "side",
            a: { hip: [60, 60], torso: 0, arm: { to: [10, 5], bend: 1, rel: "shoulder" }, leg: { to: [0, 30], bend: -1, rel: "hip" } },
            b: { hip: [60, 60], torso: 0, arm: { to: [10, 5], bend: 1, rel: "shoulder" }, leg: { to: [0, 30], bend: -1, rel: "hip" } },
        }
        const sk = solvePose(motion, 0)
        expect(sk.arms[0].end[0]).toBeCloseTo(sk.neck[0] + 10)
        expect(sk.arms[0].end[1]).toBeCloseTo(sk.neck[1] + 5)
        expect(sk.legs[0].end[0]).toBeCloseTo(60)
        expect(sk.legs[0].end[1]).toBeCloseTo(90)
    })

    it("turns arm angles with the torso when they're relative to it", () => {
        const base: Motion = {
            view: "side",
            a: { hip: [60, 60], torso: 90, arm: [0, 0], leg: [180, 180] },
            b: { hip: [60, 60], torso: 90, arm: [0, 0], leg: [180, 180] },
        }
        const absolute = solvePose(base, 0).arms[0]
        const relative = solvePose({ ...base, armRelative: true }, 0).arms[0]
        expect(absolute.end[1]).toBeLessThan(absolute.root[1]) // straight up
        expect(relative.end[0]).toBeGreaterThan(relative.root[0] + 20) // along the torso, pointing right
    })

    it("snaps a limb that switches between angles and a target halfway through", () => {
        const motion: Motion = {
            view: "side",
            a: { hip: [60, 60], arm: [180, 180], leg: [180, 180] },
            b: { hip: [60, 60], arm: { to: [80, 40], bend: 1 }, leg: [180, 180] },
        }
        expect(solvePose(motion, 0.4).arms[0].end).toEqual(solvePose(motion, 0).arms[0].end)
        expect(solvePose(motion, 0.6).arms[0].end).toEqual(solvePose(motion, 1).arms[0].end)
    })

    it("keeps a missing head angle following the torso, and blends a given one", () => {
        const motion: Motion = {
            view: "side",
            a: { hip: [60, 60], torso: 0, arm: [180, 180], leg: [180, 180] },
            b: { hip: [60, 60], torso: 90, head: 0, arm: [180, 180], leg: [180, 180] },
        }
        expect(solvePose(motion, 0).head[0]).toBeCloseTo(solvePose(motion, 0).neck[0])
        const end = solvePose(motion, 1)
        expect(end.head[0]).toBeCloseTo(end.neck[0]) // head 0 = straight up, though the torso is horizontal
    })
})

describe("equipment positions", () => {
    it("rests the back bar behind the neck and the hip bar in front of the hips", () => {
        const squat = entries.find(([, m]) => m.backBar)![1]
        const sk = solvePose(squat, 0)
        expect(distance(backBarAt(sk), sk.neck)).toBeCloseTo(3)
        expect(distance(hipBarAt(sk), sk.hip)).toBeCloseTo(7)
    })

    it("puts the ankle pad and platform next to the ankle", () => {
        const leg = solvePose(MOTIONS["seated-leg-curl"], 0.5).legs[0]
        expect(distance(anklePadAt(leg), leg.end)).toBeCloseTo(1)
        const plate = platformAt(leg)
        expect(distance(plate.center, leg.end)).toBeCloseTo(4)
        expect(plate.angle).toBe(leg.lowerAngle)
    })

    it("measures directions as 0 = up, 90 = right, 180 = down", () => {
        const close = (v: Vec, x: number, y: number) => { expect(v[0]).toBeCloseTo(x); expect(v[1]).toBeCloseTo(y) }
        close(directionOf(0, 2), 0, -2)
        close(directionOf(90, 2), 2, 0)
        close(directionOf(180, 2), 0, 2)
        close(directionOf(270, 2), -2, 0)
    })
})
