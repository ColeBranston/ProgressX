// Stick-figure animations for the exercise library.
//
// A motion is two key poses (a = start, b = the other end of the rep) that the figure eases between.
// Poses are written as joint angles, or as a hand/foot target that is solved with two-bone IK, so the
// limbs keep their length and rotate naturally instead of stretching between the poses.
//
// Angles are in degrees: 0 = up, 90 = right (the way a side-view figure faces), 180 = down, 270 = left.
// The drawing area is 120 x 100 with the floor at y = 92.

export type Vec = [number, number]

type Angles = [number, number] | [number, number, number] // upper, lower (, foot)
// IK target: `to` is absolute unless rel is set. `bend` picks which side the elbow/knee goes; a limb has
// to use the same kind (angles or target) and the same bend in both poses so it moves smoothly.
type Target = { to: Vec, bend: 1 | -1, rel?: "shoulder" | "hip", foot?: number }
type Limb = Angles | Target

export type Pose = {
    hip: Vec,
    torso?: number,       // hip -> shoulder angle (side view)
    torsoScale?: number,  // < 1 = torso leaning toward/away from the viewer (front view)
    head?: number,        // shoulder -> head angle, defaults to the torso's
    shrug?: number,       // front view: shoulders raised by this much
    arm: Limb, arm2?: Limb,
    leg: Limb, leg2?: Limb,
    armScale?: number,    // < 1 = arm pointing toward the viewer (foreshortened)
    upperArmScale?: number, // upper arm only (defaults to armScale); negative = elbow swung past the shoulder toward the midline
    thighScale?: number,  // < 1 = thighs pointing toward the viewer (seated, front view)
}

type Grip = "barbell" | "dumbbell" | "handle" | "none"

export type Motion = {
    view: "side" | "front",
    a: Pose,
    b: Pose,
    period?: number,         // ms per rep (a -> b -> a)
    grip?: Grip,
    gripHands?: "both" | "near",
    plateR?: number,
    armRelative?: boolean,   // arm angles are relative to the torso (bar on the back, hands behind the head)
    cable?: Vec,             // cable anchor, drawn to the hands (or the ankle, see cableTo)
    cableTo?: "hand" | "ankle",
    backBar?: boolean,       // barbell resting on the upper back (squats)
    hipBar?: boolean,        // barbell across the hips (hip thrusts)
    platform?: boolean,      // leg press footplate
    anklePad?: boolean,      // leg extension / curl roller pad
    scenery?: string[],      // static equipment (benches, bars, posts) as SVG path data
    floor?: boolean,
}

// Segment lengths
const TORSO = 24
const UPPER_ARM = 13
const FOREARM = 12
const THIGH = 17
const SHIN = 16
const FOOT = 6
const HEAD_OFFSET = 8
const SHOULDER_HALF = 9 // front view
const HIP_HALF = 5

export const HEAD_RADIUS = 5
export const FLOOR_Y = 92

// ---------- Geometry ----------

const rad = (deg: number) => deg * Math.PI / 180
const dir = (deg: number, length: number): Vec => [Math.sin(rad(deg)) * length, -Math.cos(rad(deg)) * length]
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]
const angleOf = (dx: number, dy: number) => Math.atan2(dx, -dy) * 180 / Math.PI
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (a: Vec, b: Vec, t: number): Vec => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

const isTarget = (limb: Limb): limb is Target => !Array.isArray(limb)

function lerpLimb(a: Limb, b: Limb, t: number): Limb {
    if (isTarget(a) && isTarget(b)) {
        const foot = a.foot === undefined ? undefined : lerp(a.foot, b.foot ?? a.foot, t)
        return { ...a, to: lerpVec(a.to, b.to, t), foot }
    }
    if (!isTarget(a) && !isTarget(b)) return a.map((value, i) => lerp(value, b[i] ?? value, t)) as Angles
    return t < 0.5 ? a : b // mismatched poses: snap (shouldn't happen)
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
    const num = (x: number | undefined, y: number | undefined, fallback: number) => lerp(x ?? fallback, y ?? fallback, t)
    return {
        hip: lerpVec(a.hip, b.hip, t),
        torso: num(a.torso, b.torso, 0),
        torsoScale: num(a.torsoScale, b.torsoScale, 1),
        head: a.head === undefined && b.head === undefined ? undefined : num(a.head ?? a.torso, b.head ?? b.torso, 0),
        shrug: num(a.shrug, b.shrug, 0),
        armScale: num(a.armScale, b.armScale, 1),
        upperArmScale: lerp(a.upperArmScale ?? a.armScale ?? 1, b.upperArmScale ?? b.armScale ?? 1, t),
        thighScale: num(a.thighScale, b.thighScale, 1),
        arm: lerpLimb(a.arm, b.arm, t),
        arm2: a.arm2 && b.arm2 ? lerpLimb(a.arm2, b.arm2, t) : undefined,
        leg: lerpLimb(a.leg, b.leg, t),
        leg2: a.leg2 && b.leg2 ? lerpLimb(a.leg2, b.leg2, t) : undefined,
    }
}

type Solved = { joint: Vec, end: Vec, tip?: Vec, lowerAngle: number }

// Two-bone limb from `root`: joint (elbow/knee), end (hand/ankle) and, for legs, the toe
function solveLimb(root: Vec, limb: Limb, upper: number, lower: number, base: { shoulder: Vec, hip: Vec }, angleOffset = 0): Solved {
    if (!isTarget(limb)) {
        const joint = add(root, dir(limb[0] + angleOffset, upper))
        const end = add(joint, dir(limb[1] + angleOffset, lower))
        const tip = limb[2] !== undefined ? add(end, dir(limb[2], FOOT)) : undefined
        return { joint, end, tip, lowerAngle: limb[1] + angleOffset }
    }

    const origin = limb.rel === "shoulder" ? base.shoulder : limb.rel === "hip" ? base.hip : [0, 0] as Vec
    const target = add(origin, limb.to)
    const dx = target[0] - root[0]
    const dy = target[1] - root[1]
    const reach = Math.min(upper + lower - 0.01, Math.max(Math.abs(upper - lower) + 0.01, Math.hypot(dx, dy)))
    const baseAngle = angleOf(dx, dy)
    const cos = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach)
    const bendAngle = Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI
    const joint = add(root, dir(baseAngle + limb.bend * bendAngle, upper))
    const clampedTarget = add(root, dir(baseAngle, reach))
    const lowerAngle = angleOf(clampedTarget[0] - joint[0], clampedTarget[1] - joint[1])
    const end = add(joint, dir(lowerAngle, lower))
    return { joint, end, tip: limb.foot !== undefined ? add(end, dir(limb.foot, FOOT)) : undefined, lowerAngle }
}

function mirrorLimb(limb: Limb, hipX: number): Limb {
    if (isTarget(limb)) {
        return limb.rel ? { ...limb, to: [-limb.to[0], limb.to[1]], bend: limb.bend === 1 ? -1 : 1 }
            : { ...limb, to: [2 * hipX - limb.to[0], limb.to[1]], bend: limb.bend === 1 ? -1 : 1 }
    }
    return limb.map((angle) => 360 - angle) as Angles
}

// ---------- Frames ----------

export type Primitive =
    | { kind: "line", cls: string, x1: number, y1: number, x2: number, y2: number }
    | { kind: "circle", cls: string, cx: number, cy: number, r: number }

const line = (cls: string, a: Vec, b: Vec): Primitive => ({ kind: "line", cls, x1: a[0], y1: a[1], x2: b[0], y2: b[1] })
const circle = (cls: string, c: Vec, r: number): Primitive => ({ kind: "circle", cls, cx: c[0], cy: c[1], r })

function gripAt(motion: Motion, hand: Vec, view: "side" | "front"): Primitive[] {
    switch (motion.grip) {
        case "barbell":
            return [circle("plate", hand, motion.plateR ?? 7), circle("hub", hand, 1.6)]
        case "dumbbell":
            return view === "front"
                ? [line("dumbbell", add(hand, [-5, 0]), add(hand, [5, 0]))]
                : [circle("plate", hand, 3.8), circle("hub", hand, 1.2)]
        case "handle":
            return [circle("handle", hand, 2.2)]
        default:
            return []
    }
}

// ---------- Solved skeleton (shared by the 2D figure and the 3D viewer) ----------

export const SEGMENT_LENGTHS = { torso: TORSO, upperArm: UPPER_ARM, forearm: FOREARM, thigh: THIGH, shin: SHIN, foot: FOOT, headOffset: HEAD_OFFSET }
export const BODY_HALF_WIDTHS = { shoulder: SHOULDER_HALF, hip: HIP_HALF }

export type SolvedLimb = Solved & { root: Vec, toe: Vec }

// Every joint of the figure `t` of the way from pose a to pose b, in drawing coordinates.
// Side view: index 0 is the near limb, 1 the far one. Front view: 0 is the figure's right (viewer's left).
export type Skeleton = {
    view: "side" | "front",
    pose: Pose,
    hip: Vec,            // hip centre
    neck: Vec,           // shoulder centre
    head: Vec,
    shoulders: [Vec, Vec],
    hips: [Vec, Vec],
    arms: [SolvedLimb, SolvedLimb],
    legs: [SolvedLimb, SolvedLimb],
    torsoAngle: number,
    hasArm2: boolean,
}

export function solvePose(motion: Motion, t: number): Skeleton {
    const pose = lerpPose(motion.a, motion.b, t)
    const armScale = pose.armScale ?? 1
    const upperArmScale = pose.upperArmScale ?? armScale

    if (motion.view === "front") {
        const neck = add(pose.hip, [0, -TORSO * (pose.torsoScale ?? 1)])
        const shrug = pose.shrug ?? 0
        const shoulders: [Vec, Vec] = [add(neck, [-SHOULDER_HALF, -shrug]), add(neck, [SHOULDER_HALF, -shrug])]
        const hips: [Vec, Vec] = [add(pose.hip, [-HIP_HALF, 0]), add(pose.hip, [HIP_HALF, 0])]
        const base = { shoulder: neck, hip: pose.hip }
        const arms = [pose.arm, pose.arm2 ?? mirrorLimb(pose.arm, pose.hip[0])].map((arm, i): SolvedLimb => {
            const solved = solveLimb(shoulders[i], arm, UPPER_ARM * upperArmScale, FOREARM * armScale, base)
            return { ...solved, root: shoulders[i], toe: solved.end }
        }) as [SolvedLimb, SolvedLimb]
        const legs = [pose.leg, pose.leg2 ?? mirrorLimb(pose.leg, pose.hip[0])].map((leg, i): SolvedLimb => {
            const solved = solveLimb(hips[i], leg, THIGH * (pose.thighScale ?? 1), SHIN, base)
            return { ...solved, root: hips[i], toe: solved.tip ?? add(solved.end, [i === 0 ? -FOOT * 0.6 : FOOT * 0.6, 0]) }
        }) as [SolvedLimb, SolvedLimb]
        // a torso leaning toward the viewer (bent over) also brings the head down between the shoulders
        const head = add(neck, [0, (-HEAD_OFFSET - shrug * 0.3) * (pose.torsoScale ?? 1)])
        return { view: "front", pose, hip: pose.hip, neck, head, shoulders, hips, arms, legs, torsoAngle: 0, hasArm2: Boolean(pose.arm2) }
    }

    // Side view, facing right
    const torsoAngle = pose.torso ?? 0
    const shoulder = add(pose.hip, dir(torsoAngle, TORSO * (pose.torsoScale ?? 1)))
    const head = add(shoulder, dir(pose.head ?? torsoAngle, HEAD_OFFSET))
    const base = { shoulder, hip: pose.hip }
    const armOffset = motion.armRelative ? torsoAngle : 0
    const arm = (limb: Limb): SolvedLimb => {
        const solved = solveLimb(shoulder, limb, UPPER_ARM * upperArmScale, FOREARM * armScale, base, armOffset)
        return { ...solved, root: shoulder, toe: solved.end }
    }
    const leg = (limb: Limb): SolvedLimb => {
        const solved = solveLimb(pose.hip, limb, THIGH, SHIN, base)
        return { ...solved, root: pose.hip, toe: solved.tip ?? add(solved.end, [FOOT, 0]) }
    }
    return {
        view: "side", pose, hip: pose.hip, neck: shoulder, head,
        shoulders: [shoulder, shoulder], hips: [pose.hip, pose.hip],
        arms: [arm(pose.arm), arm(pose.arm2 ?? pose.arm)],
        legs: [leg(pose.leg), leg(pose.leg2 ?? pose.leg)],
        torsoAngle, hasArm2: Boolean(pose.arm2),
    }
}

function legPrims(cls: string, leg: SolvedLimb): Primitive[] {
    return [line(cls, leg.root, leg.joint), line(cls, leg.joint, leg.end), line(`${cls} foot`, leg.end, leg.toe)]
}

// The figure `t` of the way from pose a to pose b (0..1). The primitive list always has the same
// length and order for a given motion, so it can be animated by updating attributes in place.
export function frameAt(motion: Motion, t: number): Primitive[] {
    const sk = solvePose(motion, t)
    const prims: Primitive[] = []

    if (sk.view === "front") {
        const { arms, legs, shoulders, hips, neck } = sk
        if (motion.cable) arms.forEach((arm, i) => prims.push(line("cable", i === 0 ? motion.cable! : [120 - motion.cable![0], motion.cable![1]], arm.end)))
        legs.forEach((leg) => prims.push(...legPrims("limb", leg)))
        prims.push(line("torso", neck, sk.hip), line("limb", shoulders[0], shoulders[1]), line("limb", hips[0], hips[1]))
        prims.push(circle("head", sk.head, HEAD_RADIUS))
        arms.forEach((arm, i) => prims.push(line("limb", shoulders[i], arm.joint), line("limb", arm.joint, arm.end)))

        if (motion.grip === "barbell") {
            const y = (arms[0].end[1] + arms[1].end[1]) / 2
            const left: Vec = [arms[0].end[0] - 12, y]
            const right: Vec = [arms[1].end[0] + 12, y]
            prims.push(line("bar", left, right), line("plateSide", add(left, [0, -6]), add(left, [0, 6])), line("plateSide", add(right, [0, -6]), add(right, [0, 6])))
        } else {
            arms.forEach((arm) => prims.push(...gripAt(motion, arm.end, "front")))
        }
        return prims
    }

    // Side view, facing right. The "far" arm and leg are drawn faded behind the body.
    const [arm, arm2] = sk.arms
    const [leg, leg2] = sk.legs
    const shoulder = sk.neck

    if (motion.cable) prims.push(line("cable", motion.cable, motion.cableTo === "ankle" ? leg.end : arm.end))
    prims.push(...legPrims("limb far", leg2))
    prims.push(line("limb far", shoulder, arm2.joint), line("limb far", arm2.joint, arm2.end))
    if (motion.gripHands !== "near" && sk.hasArm2) prims.push(...gripAt(motion, arm2.end, "side"))

    prims.push(line("torso", sk.hip, shoulder), circle("head", sk.head, HEAD_RADIUS))
    prims.push(...legPrims("limb", leg))
    prims.push(line("limb", shoulder, arm.joint), line("limb", arm.joint, arm.end))

    prims.push(...gripAt(motion, arm.end, "side"))
    if (motion.backBar) {
        const bar = backBarAt(sk)
        prims.push(circle("plate", bar, motion.plateR ?? 7), circle("hub", bar, 1.6))
    }
    if (motion.hipBar) {
        const bar = hipBarAt(sk)
        prims.push(circle("plate", bar, motion.plateR ?? 7), circle("hub", bar, 1.6))
    }
    if (motion.platform) {
        const center = add(leg.end, dir(leg.lowerAngle, 4))
        prims.push(line("platform", add(center, dir(leg.lowerAngle + 90, 11)), add(center, dir(leg.lowerAngle - 90, 11))))
    }
    if (motion.anklePad) {
        prims.push(circle("pad", anklePadAt(leg), 3.4))
    }
    return prims
}

// Equipment positions shared with the 3D viewer
export const backBarAt = (sk: Skeleton): Vec => add(sk.neck, dir(sk.torsoAngle - 90, 3))
export const hipBarAt = (sk: Skeleton): Vec => add(sk.hip, dir(sk.torsoAngle + 90, 7))
export const anklePadAt = (leg: SolvedLimb): Vec => add(leg.end, dir(leg.lowerAngle + 90, 1))
export const platformAt = (leg: SolvedLimb): { center: Vec, angle: number } => ({ center: add(leg.end, dir(leg.lowerAngle, 4)), angle: leg.lowerAngle })
export { dir as directionOf }

// ---------- The motions ----------

const STAND: Vec = [57, 57] // hip of a standing figure, ankles at y = 90
const STRAIGHT_LEGS: Angles = [180, 180, 90]
const SUPINE_LEGS: Limb = { to: [88, 89], bend: -1 }

const BENCH_FLAT = ["M28 71 H80", "M34 71 V92", "M74 71 V92"]

export const MOTIONS: Record<string, Motion> = {
    // ---------- Chest ----------
    "bench-press": {
        view: "side", grip: "barbell", scenery: BENCH_FLAT,
        a: { hip: [72, 66], torso: -90, arm: { to: [50, 41], bend: 1 }, leg: SUPINE_LEGS },
        b: { hip: [72, 66], torso: -90, arm: { to: [60, 58], bend: 1 }, leg: SUPINE_LEGS },
    },
    "incline-press": {
        view: "side", grip: "dumbbell", scenery: ["M86 77 H62 L42 59", "M66 77 V92"],
        a: { hip: [70, 71], torso: -50, arm: { to: [58, 32], bend: 1 }, leg: { to: [88, 90], bend: -1 } },
        b: { hip: [70, 71], torso: -50, arm: { to: [64, 50], bend: 1 }, leg: { to: [88, 90], bend: -1 } },
    },
    "fly": {
        view: "side", grip: "dumbbell", scenery: BENCH_FLAT,
        a: { hip: [72, 66], torso: -90, arm: [4, -4], leg: SUPINE_LEGS },
        // arms open out to the sides (toward the viewer), so they shorten; dumbbells end just below chest level
        b: { hip: [72, 66], torso: -90, arm: [140, 100], armScale: 0.35, leg: SUPINE_LEGS },
    },
    "cable-crossover": {
        view: "front", grip: "handle", cable: [8, 12], scenery: ["M6 4 V92", "M114 4 V92"],
        a: { hip: [60, 57], arm: [292, 300], leg: [186, 180, 260] },
        b: { hip: [60, 57], arm: [152, 125], leg: [186, 180, 260] },
    },
    "push-up": {
        view: "side",
        a: { hip: [50.8, 73.6], torso: 69, head: 80, arm: { to: [73.2, 90], bend: 1 }, leg: [249, 249, 200] },
        b: { hip: [52.8, 82.3], torso: 84.6, head: 92, arm: { to: [73.2, 90], bend: 1 }, leg: [264.6, 264.6, 200] },
    },
    "dip": {
        view: "side", scenery: ["M40 50 H84", "M80 50 V92"],
        a: { hip: [57.8, 48.6], torso: 10, arm: { to: [62, 50], bend: 1 }, leg: [172, 225, 170] },
        b: { hip: [55.8, 61.5], torso: 20, arm: { to: [62, 50], bend: 1 }, leg: [172, 225, 170] },
    },

    // ---------- Back ----------
    "pull-up": {
        view: "side", scenery: ["M30 8 H90"], floor: false,
        a: { hip: [62, 58], torso: 0, arm: { to: [62, 9], bend: 1 }, leg: [184, 196, 150] },
        b: { hip: [58.3, 37.8], torso: -8, arm: { to: [62, 9], bend: 1 }, leg: [168, 200, 150] },
    },
    "lat-pulldown": {
        view: "side", grip: "handle", cable: [58, 0], scenery: ["M44 79 H70", "M58 79 V92", "M66 70 H82"],
        a: { hip: [58, 74], torso: -10, arm: { to: [57, 25], bend: 1 }, leg: { to: [77, 90], bend: -1 } },
        b: { hip: [58, 74], torso: -18, arm: { to: [57, 54], bend: 1 }, leg: { to: [77, 90], bend: -1 } },
    },
    "bent-over-row": {
        view: "side", grip: "barbell", plateR: 9,
        a: { hip: [46, 62], torso: 58, head: 72, arm: { to: [66, 76], bend: 1 }, leg: { to: [58, 90], bend: -1 } },
        b: { hip: [46, 62], torso: 58, head: 72, arm: { to: [55, 62], bend: 1 }, leg: { to: [58, 90], bend: -1 } },
    },
    "dumbbell-row": {
        view: "side", grip: "dumbbell", gripHands: "near", scenery: ["M8 70 H72", "M12 70 V92", "M66 70 V92"],
        a: { hip: [40, 56], torso: 80, head: 92, arm: { to: [64, 80], bend: 1 }, arm2: { to: [67, 69], bend: -1 }, leg: { to: [42, 90], bend: -1 }, leg2: [228, 270, 180] },
        b: { hip: [40, 56], torso: 80, head: 92, arm: { to: [48, 60], bend: 1 }, arm2: { to: [67, 69], bend: -1 }, leg: { to: [42, 90], bend: -1 }, leg2: [228, 270, 180] },
    },
    "seated-row": {
        view: "side", grip: "handle", cable: [104, 80], scenery: ["M24 80 H56", "M40 80 V92", "M80 70 V92"],
        a: { hip: [40, 76], torso: 25, arm: { to: [70, 66], bend: 1 }, leg: { to: [74, 83], bend: -1 } },
        b: { hip: [40, 76], torso: -6, arm: { to: [48, 66], bend: 1 }, leg: { to: [74, 83], bend: -1 } },
    },
    "deadlift": {
        view: "side", grip: "barbell", plateR: 10,
        a: { hip: [44, 68], torso: 58, head: 68, arm: { to: [64, 80], bend: 1 }, leg: { to: [60, 90], bend: -1 } },
        b: { hip: [57, 57], torso: 0, head: 0, arm: { to: [58, 58], bend: 1 }, leg: { to: [60, 90], bend: -1 } },
    },
    "face-pull": {
        view: "side", grip: "handle", cable: [110, 26], scenery: ["M112 4 V92"],
        a: { hip: STAND, torso: -4, arm: { to: [81, 30], bend: -1 }, leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: -4, arm: { to: [60, 22], bend: -1 }, leg: STRAIGHT_LEGS },
    },
    "shrug": {
        view: "front", grip: "barbell", period: 2000,
        a: { hip: [60, 57], arm: [186, 180], leg: [184, 180, 260] },
        b: { hip: [60, 57], shrug: 5, arm: [186, 180], leg: [184, 180, 260] },
    },

    // ---------- Shoulders ----------
    "overhead-press": {
        view: "side", grip: "barbell",
        a: { hip: STAND, torso: 0, arm: { to: [65, 34], bend: 1 }, leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: 0, arm: { to: [57, 8], bend: 1 }, leg: STRAIGHT_LEGS },
    },
    "seated-shoulder-press": {
        view: "side", grip: "dumbbell", scenery: ["M40 75 H68", "M58 75 V92", "M47 75 V38"],
        a: { hip: [54, 71], torso: 0, arm: { to: [60, 46], bend: 1 }, armScale: 0.75, leg: { to: [72, 90], bend: -1 } },
        b: { hip: [54, 71], torso: 0, arm: { to: [56, 22], bend: 1 }, leg: { to: [72, 90], bend: -1 } },
    },
    "lateral-raise": {
        view: "front", grip: "dumbbell",
        a: { hip: [60, 57], arm: [190, 184], leg: [184, 180, 260] },
        b: { hip: [60, 57], arm: [264, 256], leg: [184, 180, 260] },
    },
    "rear-delt-fly": {
        view: "front", grip: "dumbbell",
        a: { hip: [60, 60], torsoScale: 0.55, arm: [182, 180], leg: [186, 176, 260] },
        b: { hip: [60, 60], torsoScale: 0.55, arm: [268, 262], leg: [186, 176, 260] },
    },

    // ---------- Arms ----------
    "curl": {
        view: "side", grip: "barbell",
        a: { hip: STAND, torso: 0, arm: [182, 178], leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: 0, arm: [176, 25], leg: STRAIGHT_LEGS },
    },
    "dumbbell-curl": {
        view: "side", grip: "dumbbell",
        a: { hip: STAND, torso: 0, arm: [182, 178], leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: 0, arm: [176, 25], leg: STRAIGHT_LEGS },
    },
    "pushdown": {
        view: "side", grip: "handle", cable: [74, 0], scenery: ["M80 0 V92"],
        a: { hip: STAND, torso: 8, arm: [172, 50], leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: 8, arm: [172, 176], leg: STRAIGHT_LEGS },
    },
    "skull-crusher": {
        view: "side", grip: "barbell", plateR: 6, scenery: BENCH_FLAT,
        a: { hip: [72, 66], torso: -90, arm: [-10, -4], leg: SUPINE_LEGS },
        b: { hip: [72, 66], torso: -90, arm: [-16, -140], leg: SUPINE_LEGS },
    },
    "overhead-extension": {
        view: "side", grip: "dumbbell",
        a: { hip: STAND, torso: 0, arm: [6, 2], leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: 0, arm: [8, -150], leg: STRAIGHT_LEGS },
    },

    // ---------- Legs ----------
    "squat": {
        view: "side", backBar: true, armRelative: true, plateR: 6,
        a: { hip: [56, 57], torso: 0, head: 0, arm: [195, 5], leg: { to: [60, 90], bend: -1 } },
        b: { hip: [42, 74], torso: 40, head: 15, arm: [195, 5], leg: { to: [60, 90], bend: -1 } },
    },
    "goblet-squat": {
        view: "side", grip: "dumbbell", armRelative: true,
        a: { hip: [56, 57], torso: 0, head: 0, arm: [150, 10], leg: { to: [60, 90], bend: -1 } },
        b: { hip: [44, 75], torso: 28, head: 10, arm: [150, 10], leg: { to: [60, 90], bend: -1 } },
    },
    "leg-press": {
        view: "side", platform: true, scenery: ["M52 79 H36 L12 64", "M40 79 V92", "M52 66 L94 24"],
        a: { hip: [40, 71], torso: -60, arm: [150, 100], leg: { to: [58, 53], bend: -1, foot: 20 } },
        b: { hip: [40, 71], torso: -60, arm: [150, 100], leg: { to: [62, 48], bend: -1, foot: 20 } },
    },
    "romanian-deadlift": {
        view: "side", grip: "barbell", plateR: 8,
        a: { hip: [56, 57], torso: 0, head: 0, arm: { to: [58, 60], bend: 1 }, leg: { to: [60, 90], bend: -1 } },
        b: { hip: [43, 63], torso: 72, head: 76, arm: { to: [64, 79], bend: 1 }, leg: { to: [60, 90], bend: -1 } },
    },
    "lunge": {
        view: "side", grip: "dumbbell",
        a: { hip: [57, 57], torso: 0, arm: [182, 180], leg: { to: [60, 90], bend: -1 }, leg2: { to: [54, 90], bend: -1, foot: 90 } },
        b: { hip: [58, 70], torso: 0, arm: [182, 180], leg: { to: [76, 90], bend: -1 }, leg2: { to: [37, 86], bend: -1, foot: 125 } },
    },
    "split-squat": {
        view: "side", grip: "dumbbell", scenery: ["M6 70 H30", "M10 70 V92", "M26 70 V92"],
        a: { hip: [52, 58], torso: 4, arm: [182, 180], leg: { to: [64, 90], bend: -1 }, leg2: { to: [26, 67], bend: -1, foot: 270 } },
        b: { hip: [50, 72], torso: 4, arm: [182, 180], leg: { to: [64, 90], bend: -1 }, leg2: { to: [26, 67], bend: -1, foot: 270 } },
    },
    "leg-extension": {
        view: "side", anklePad: true, scenery: ["M34 71 H64", "M40 71 L35 40", "M50 71 V92"],
        a: { hip: [50, 66], torso: -10, arm: [168, 150], leg: [95, 182, 100] },
        b: { hip: [50, 66], torso: -10, arm: [168, 150], leg: [95, 95, 10] },
    },
    "leg-curl": {
        view: "side", anklePad: true, scenery: ["M22 69 H88", "M30 69 V92", "M80 69 V92"],
        a: { hip: [50, 64], torso: 90, arm: [150, 95], leg: [270, 270, 180] },
        b: { hip: [50, 64], torso: 90, arm: [150, 95], leg: [270, 385, 300] },
    },
    "hip-thrust": {
        view: "side", hipBar: true, scenery: ["M12 78 H36", "M16 78 V92", "M32 78 V92"],
        a: { hip: [54, 87], torso: -56, arm: { to: [-2, -8], bend: 1, rel: "hip" }, leg: { to: [74, 90], bend: -1 } },
        b: { hip: [58, 74], torso: -90, arm: { to: [-2, -8], bend: 1, rel: "hip" }, leg: { to: [74, 90], bend: -1 } },
    },
    "calf-raise": {
        view: "side", period: 1800,
        a: { hip: [57, 57], torso: 0, arm: [176, 164], leg: { to: [60, 90], bend: -1, foot: 90 } },
        b: { hip: [59, 51.5], torso: 0, arm: [176, 164], leg: { to: [62.5, 85], bend: -1, foot: 145 } },
    },

    // ---------- Glutes ----------
    "good-morning": {
        view: "side", backBar: true, armRelative: true, plateR: 6,
        a: { hip: [56, 57], torso: 0, head: 0, arm: [195, 5], leg: { to: [60, 90], bend: -1 } },
        b: { hip: [45, 60], torso: 80, head: 84, arm: [195, 5], leg: { to: [60, 90], bend: -1 } },
    },
    "glute-bridge": {
        view: "side",
        a: { hip: [50, 87], torso: -90, arm: [100, 90], leg: { to: [70, 89], bend: -1, foot: 90 } },
        b: { hip: [46.5, 74.5], torso: -121.4, arm: [100, 90], leg: { to: [70, 89], bend: -1, foot: 90 } },
    },
    "cable-kickback": {
        view: "side", cable: [94, 88], cableTo: "ankle", anklePad: true, scenery: ["M96 4 V92"],
        a: { hip: [66, 57], torso: 18, arm: { to: [95, 44], bend: 1 }, leg: [178, 186, 90], leg2: { to: [66, 90], bend: -1 } },
        b: { hip: [66, 57], torso: 18, arm: { to: [95, 44], bend: 1 }, leg: [248, 232, 160], leg2: { to: [66, 90], bend: -1 } },
    },
    "hip-abduction": {
        // seated, seen from the front: thighs point at the viewer (short), knees push out against the pads
        view: "front", scenery: ["M38 72 H82", "M60 72 V92"],
        a: { hip: [60, 70], thighScale: 0.4, arm: [200, 176], leg: [200, 180, 260] },
        b: { hip: [60, 70], thighScale: 0.4, arm: [200, 176], leg: [262, 196, 260] },
    },
    "sumo-deadlift": {
        view: "front", grip: "barbell",
        a: { hip: [60, 72], torsoScale: 0.78, arm: { to: [53, 79], bend: 1 }, leg: { to: [42, 90], bend: 1 } },
        b: { hip: [60, 58.5], torsoScale: 1, arm: { to: [53, 59], bend: 1 }, leg: { to: [42, 90], bend: 1 } },
    },
    "step-up": {
        view: "side", grip: "dumbbell", scenery: ["M62 72 H92 V92", "M62 72 V92"],
        a: { hip: [50, 58], torso: 6, arm: [182, 180], leg: { to: [70, 72], bend: -1, foot: 90 }, leg2: { to: [48, 90], bend: -1, foot: 90 } },
        b: { hip: [69, 40], torso: 0, arm: [182, 180], leg: { to: [72, 72], bend: -1, foot: 90 }, leg2: { to: [70, 64], bend: -1, foot: 100 } },
    },
    "back-extension": {
        view: "side", armRelative: true, scenery: ["M50 62 L68 44", "M58 53 L58 92", "M28 76 L40 88", "M34 82 L34 92"],
        a: { hip: [62, 48], torso: 150, head: 150, arm: [170, 25], leg: [228, 228, 320] },
        b: { hip: [62, 48], torso: 48, head: 60, arm: [170, 25], leg: [228, 228, 320] },
    },
    "donkey-kick": {
        view: "side",
        a: { hip: [40, 73], torso: 70.5, head: 82, arm: [180, 180], leg: [180, 270, 270], leg2: [180, 270, 270] },
        b: { hip: [40, 73], torso: 70.5, head: 82, arm: [180, 180], leg: [272, 358, 270], leg2: [180, 270, 270] },
    },

    // ---------- Machines and cables ----------
    "hack-squat": {
        // back on the angled sled, feet on the tilted platform; the sled slides down along the rail
        view: "side", armRelative: true, scenery: ["M20 20 L60 89", "M62 91 L86 79"],
        a: { hip: [50, 55], torso: -30, head: -20, arm: [200, 10], leg: { to: [68, 82], bend: -1, foot: 60 } },
        b: { hip: [57, 67], torso: -30, head: -20, arm: [200, 10], leg: { to: [68, 82], bend: -1, foot: 60 } },
    },
    "seated-leg-curl": {
        view: "side", anklePad: true, scenery: ["M34 71 H64", "M40 71 L35 40", "M50 71 V92"],
        a: { hip: [50, 66], torso: -10, arm: [168, 150], leg: [95, 97, 10] },
        b: { hip: [50, 66], torso: -10, arm: [168, 150], leg: [95, 200, 130] },
    },
    "machine-lateral-raise": {
        view: "front", grip: "handle", scenery: ["M38 72 H82", "M60 72 V92"],
        a: { hip: [60, 70], thighScale: 0.4, arm: [188, 192], armScale: 0.85, leg: [200, 180, 260] },
        b: { hip: [60, 70], thighScale: 0.4, arm: [262, 250], armScale: 0.85, leg: [200, 180, 260] },
    },
    "reverse-pec-deck": {
        // chest against the pad: arms start straight out in front with the handles together (toward the viewer,
        // so the hands sit near the middle) and sweep back out to the sides
        view: "front", grip: "handle", scenery: ["M38 72 H82", "M60 72 V92"],
        a: { hip: [60, 70], thighScale: 0.4, arm: [268, 266], armScale: -0.25, leg: [200, 180, 260] },
        b: { hip: [60, 70], thighScale: 0.4, arm: [268, 266], armScale: 1, leg: [200, 180, 260] },
    },
    "pec-deck": {
        // elbows bent at 90 degrees on the pads; the elbows swing forward and in until they meet in front of the chest
        view: "front", grip: "handle", scenery: ["M38 72 H82", "M60 72 V92"],
        a: { hip: [60, 70], thighScale: 0.4, arm: [270, 360], upperArmScale: 1, leg: [200, 180, 260] },
        b: { hip: [60, 70], thighScale: 0.4, arm: [270, 360], upperArmScale: -0.55, leg: [200, 180, 260] },
    },
    "machine-chest-press": {
        view: "side", grip: "handle", scenery: ["M40 75 H68", "M54 75 V92", "M47 75 V36"],
        a: { hip: [54, 71], torso: -5, arm: { to: [57, 49], bend: 1 }, leg: { to: [72, 90], bend: -1 } },
        b: { hip: [54, 71], torso: -5, arm: { to: [76, 48], bend: 1 }, leg: { to: [72, 90], bend: -1 } },
    },
    "machine-curl": {
        // upper arms rest on the angled pad, only the forearms move
        view: "side", grip: "handle", scenery: ["M56 56 L68 68", "M40 75 H64", "M50 75 V92"],
        a: { hip: [50, 71], torso: 8, arm: [140, 150], leg: { to: [70, 90], bend: -1 } },
        b: { hip: [50, 71], torso: 8, arm: [140, 12], leg: { to: [70, 90], bend: -1 } },
    },
    "cable-curl": {
        view: "side", grip: "handle", cable: [96, 88], scenery: ["M98 56 V92"],
        a: { hip: STAND, torso: 0, arm: [182, 170], leg: STRAIGHT_LEGS },
        b: { hip: STAND, torso: 0, arm: [176, 25], leg: STRAIGHT_LEGS },
    },

    // ---------- Core ----------
    "plank": {
        view: "side", period: 3400,
        a: { hip: [52.5, 79.7], torso: 80, head: 88, arm: [180, 90], leg: [260, 260, 200] },
        b: { hip: [52.5, 78.2], torso: 81, head: 86, arm: [180, 90], leg: [262, 262, 200] },
    },
    "crunch": {
        view: "side", armRelative: true,
        a: { hip: [50, 86], torso: -90, arm: [60, 279], leg: { to: [72, 89], bend: -1 } },
        b: { hip: [50, 86], torso: -58, arm: [60, 279], leg: { to: [72, 89], bend: -1 } },
    },
    "hanging-leg-raise": {
        view: "side", scenery: ["M30 8 H90"], floor: false,
        a: { hip: [60, 59], torso: 0, arm: { to: [60, 9], bend: 1 }, leg: [180, 180, 100] },
        b: { hip: [60, 59], torso: -6, arm: { to: [60, 9], bend: 1 }, leg: [92, 92, 10] },
    },
    "cable-crunch": {
        view: "side", grip: "handle", cable: [100, 2], armRelative: true, scenery: ["M104 0 V92"],
        a: { hip: [50, 71], torso: 22, arm: [175, 5], leg: [180, 270, 270] },
        b: { hip: [50, 71], torso: 98, arm: [175, 5], leg: [180, 270, 270] },
    },
}

// Same movement as an existing motion, with different equipment in the hands
MOTIONS["machine-shoulder-press"] = { ...MOTIONS["seated-shoulder-press"], grip: "handle" }

export const FALLBACK_MOTION = MOTIONS["curl"]
