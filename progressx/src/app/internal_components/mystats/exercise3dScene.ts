import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import type { Muscle } from "./exercises"
import {
    BODY_HALF_WIDTHS,
    FLOOR_Y,
    HEAD_RADIUS,
    Motion,
    SEGMENT_LENGTHS,
    Skeleton,
    Vec,
    anklePadAt,
    backBarAt,
    directionOf,
    hipBarAt,
    platformAt,
    solvePose,
} from "./exerciseMotions"

// One exercise in 3D: a jointed mannequin driven by the same motion data as the 2D stick figures.
//
// The motions are 2D (a side view or a front view), so the 3D pose is rebuilt from them:
// - side view: the drawing is the figure's sagittal plane; near limbs sit on one side of the body, far
//   limbs on the other
// - limbs drawn shorter than their real length (pointing toward the viewer, or out to the side) get that
//   missing length back as depth, so a fly opens outward and a bent-over torso leans toward you
// The worked muscles glow red on the body: primary bright, secondary dim.

export type Exercise3DScene = { dispose: () => void }

export type Exercise3DOptions = {
    motion: Motion,
    motionId: string,
    primary: Muscle[],
    secondary: Muscle[],
    reducedMotion: boolean,
    period?: number,
    onInteract?: () => void,
}

const S = 0.035 // drawing units -> world units (a standing figure is ~3 world units tall)
const DEFAULT_PERIOD_MS = 2600

const to3 = (v: Vec, z: number, out = new THREE.Vector3()) => out.set((v[0] - 60) * S, (FLOOR_Y - v[1]) * S, z * S)
const dist2 = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1])
// how far a segment of true length `length` reaches toward/away from the viewer, given its drawn length
const depthOf = (length: number, drawn: number) => Math.sqrt(Math.max(0, length * length - drawn * drawn))

// ---------- which body part shows which muscles ----------

type Part = "torso" | "shoulders" | "upperArms" | "forearms" | "pelvis" | "thighs" | "shins"
const PART_MUSCLES: Record<Part, Muscle[]> = {
    torso: ["chest", "abs", "obliques", "lats", "upper-back", "lower-back", "traps"],
    shoulders: ["front-delts", "side-delts", "rear-delts", "traps"],
    upperArms: ["biceps", "triceps"],
    forearms: ["forearms"],
    pelvis: ["glutes"],
    thighs: ["quads", "hamstrings", "glutes"],
    shins: ["calves"],
}

// ---------- 3D form ----------
//
// A side-view drawing has no width, so on its own it would move every arm and leg flat alongside the body
// (tucked elbows on a bench press, hands at shoulder width, knees caving). These per-motion settings put
// the hands and feet at a proper width and turn the elbows and knees out the way good form does.
// Widths are half-widths in drawing units (shoulders are 9 from the centre, hips 5).

export type Attachment = "lat-bar" | "straight-bar" | "rope" | "v-handle"

type Form3D = {
    grip?: number,        // hands this far from the centre line
    flare?: number,       // elbows rotated out from the body by this many degrees (45 = classic press)
    stance?: number,      // ankles this far from the centre line
    kneesOut?: number,    // knees (and toes) turned out by this many degrees
    attachment?: Attachment,
    oneWeight?: boolean,  // a single dumbbell held in both hands (goblet squat, overhead extension)
    hangBar?: boolean,    // pull-up style bar across the hands, on a frame
}

export const FORM_3D: Record<string, Form3D> = {
    // chest
    "bench-press": { grip: 15, flare: 62, stance: 9, kneesOut: 15 },
    "incline-press": { grip: 13, flare: 62, stance: 9, kneesOut: 15 },
    "machine-chest-press": { grip: 12, flare: 60, stance: 7, kneesOut: 10 },
    "push-up": { grip: 13, flare: 60, stance: 4 },
    "dip": { grip: 11, flare: 15 },
    // back
    "pull-up": { grip: 16, flare: 55, hangBar: true },
    "hanging-leg-raise": { grip: 13, flare: 30, hangBar: true },
    "lat-pulldown": { grip: 17, flare: 60, stance: 8, kneesOut: 10, attachment: "lat-bar" },
    "bent-over-row": { grip: 11, flare: 35, stance: 6, kneesOut: 8 },
    "dumbbell-row": { flare: 15 },
    "seated-row": { grip: 3, flare: 8, stance: 7, attachment: "v-handle" },
    "deadlift": { grip: 10.5, stance: 5.5, kneesOut: 6 },
    "romanian-deadlift": { grip: 10.5, stance: 5.5 },
    "face-pull": { grip: 6, flare: 80, stance: 6, attachment: "rope" },
    // shoulders
    "overhead-press": { grip: 12, flare: 30, stance: 6 },
    "seated-shoulder-press": { grip: 19, flare: 35, stance: 8, kneesOut: 12 },
    "machine-shoulder-press": { grip: 18, flare: 30, stance: 8, kneesOut: 12 },
    // arms
    "curl": { grip: 9, stance: 5 },
    "dumbbell-curl": { grip: 9.5, stance: 5 },
    "cable-curl": { grip: 8, stance: 5, attachment: "straight-bar" },
    "machine-curl": { grip: 9, stance: 7 },
    "pushdown": { grip: 4.5, stance: 5, attachment: "rope" },
    "skull-crusher": { grip: 6, stance: 9, kneesOut: 15 },
    "overhead-extension": { grip: 2.5, flare: 15, stance: 5, oneWeight: true },
    // legs and glutes
    "squat": { grip: 13, stance: 8, kneesOut: 18 },
    "goblet-squat": { grip: 3, stance: 8, kneesOut: 18, oneWeight: true },
    "hack-squat": { grip: 12, stance: 7, kneesOut: 15 },
    "leg-press": { stance: 7, kneesOut: 12 },
    "good-morning": { grip: 13, stance: 6 },
    "lunge": { grip: 10, stance: 4 },
    "split-squat": { grip: 10, stance: 4 },
    "step-up": { grip: 10, stance: 4 },
    "hip-thrust": { grip: 12, stance: 7, kneesOut: 10 },
    "glute-bridge": { stance: 6, kneesOut: 8 },
    "calf-raise": { stance: 5 },
    "cable-crunch": { grip: 3, attachment: "rope" },
}

// ---------- the solved 3D joints ----------

type Joints3D = {
    hip: THREE.Vector3, neck: THREE.Vector3, head: THREE.Vector3,
    shoulders: [THREE.Vector3, THREE.Vector3], hips: [THREE.Vector3, THREE.Vector3],
    elbows: [THREE.Vector3, THREE.Vector3], hands: [THREE.Vector3, THREE.Vector3],
    knees: [THREE.Vector3, THREE.Vector3], ankles: [THREE.Vector3, THREE.Vector3], toes: [THREE.Vector3, THREE.Vector3],
}

const v3 = () => new THREE.Vector3()
const newJoints = (): Joints3D => ({
    hip: v3(), neck: v3(), head: v3(),
    shoulders: [v3(), v3()], hips: [v3(), v3()], elbows: [v3(), v3()], hands: [v3(), v3()],
    knees: [v3(), v3()], ankles: [v3(), v3()], toes: [v3(), v3()],
})

const L = SEGMENT_LENGTHS

const ik = { u: v3(), bend: v3(), out: v3(), tmp: v3(), target: v3() }
const Y_AXIS = new THREE.Vector3(0, 1, 0)

// Two-bone IK in 3D: places `joint` and `end` so the bones keep their exact lengths, the end reaches
// toward `target`, and the joint bends the way `hint` points, rotated `swivel` degrees around the
// root -> end line toward `outward` (that rotation is what flares elbows and turns knees out)
function solveTwoBone(root: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number, hint: THREE.Vector3, outward: THREE.Vector3, swivel: number, joint: THREE.Vector3, end: THREE.Vector3) {
    const { u, bend, out } = ik
    u.subVectors(target, root)
    const d = Math.min(upper + lower - 1e-4, Math.max(Math.abs(upper - lower) + 1e-4, u.length()))
    u.normalize()
    // bend direction: the hint's part perpendicular to the limb
    bend.subVectors(hint, root)
    bend.addScaledVector(u, -bend.dot(u))
    // outward direction, perpendicular to both
    out.copy(outward).addScaledVector(u, -outward.dot(u))
    if (bend.lengthSq() < 1e-10) bend.copy(out) // straight limb: any bend direction works
    bend.normalize()
    out.addScaledVector(bend, -out.dot(bend))
    if (out.lengthSq() > 1e-10 && swivel !== 0) {
        out.normalize()
        const a = (swivel * Math.PI) / 180
        bend.multiplyScalar(Math.cos(a)).addScaledVector(out, Math.sin(a))
    }
    const cosA = Math.min(1, Math.max(-1, (upper * upper + d * d - lower * lower) / (2 * upper * d)))
    const sinA = Math.sqrt(1 - cosA * cosA)
    joint.copy(root).addScaledVector(u, upper * cosA).addScaledVector(bend, upper * sinA)
    end.copy(root).addScaledVector(u, d)
}

function liftSkeleton(sk: Skeleton, out: Joints3D, form: Form3D) {
    if (sk.view === "side") {
        to3(sk.hip, 0, out.hip)
        to3(sk.neck, 0, out.neck)
        to3(sk.head, 0, out.head)
        const hint = v3(), outward = v3()
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? 1 : -1 // near limbs toward the viewer (+z), far limbs away
            const arm = sk.arms[i], leg = sk.legs[i]
            const shoulderZ = side * BODY_HALF_WIDTHS.shoulder
            const elbowZ = shoulderZ + side * depthOf(L.upperArm, dist2(arm.root, arm.joint))
            const handZ = elbowZ + side * depthOf(L.forearm, dist2(arm.joint, arm.end))
            to3(arm.root, shoulderZ, out.shoulders[i])
            to3(arm.joint, elbowZ, out.elbows[i])
            to3(arm.end, handZ, out.hands[i])
            if (form.grip !== undefined || form.flare) {
                // hand at the grip width, elbow flared out; the drawing still sets the hand's height and reach
                to3(arm.end, form.grip !== undefined ? side * form.grip : handZ, ik.target)
                hint.copy(out.elbows[i])
                outward.set(0, 0, side)
                solveTwoBone(out.shoulders[i], ik.target, L.upperArm * S, L.forearm * S, hint, outward, form.flare ?? 0, out.elbows[i], out.hands[i])
            }

            const hipZ = side * BODY_HALF_WIDTHS.hip
            const kneeZ = hipZ + side * depthOf(L.thigh, dist2(leg.root, leg.joint))
            const ankleZ = kneeZ + side * depthOf(L.shin, dist2(leg.joint, leg.end))
            to3(leg.root, hipZ, out.hips[i])
            to3(leg.joint, kneeZ, out.knees[i])
            to3(leg.end, ankleZ, out.ankles[i])
            to3(leg.toe, ankleZ, out.toes[i])
            if (form.stance !== undefined || form.kneesOut) {
                const stanceZ = form.stance !== undefined ? side * form.stance : ankleZ
                to3(leg.end, stanceZ, ik.target)
                hint.copy(out.knees[i])
                outward.set(0, 0, side)
                solveTwoBone(out.hips[i], ik.target, L.thigh * S, L.shin * S, hint, outward, form.kneesOut ?? 0, out.knees[i], out.ankles[i])
                // feet point the same way as the knees
                const toeAngle = ((form.kneesOut ?? 0) * 0.8 * Math.PI) / 180
                to3(leg.toe, 0, ik.tmp)
                ik.tmp.sub(out.ankles[i]).setZ(0)
                ik.tmp.applyAxisAngle(Y_AXIS, -side * toeAngle)
                out.toes[i].copy(out.ankles[i]).add(ik.tmp)
            }
        }
        return
    }

    // front view: the drawing is the frontal plane, and anything foreshortened points toward the viewer
    const neckZ = depthOf(L.torso, dist2(sk.hip, sk.neck))
    to3(sk.hip, 0, out.hip)
    to3(sk.neck, neckZ, out.neck)
    to3(sk.head, neckZ + depthOf(L.headOffset, dist2(sk.neck, sk.head)), out.head)
    for (let i = 0; i < 2; i++) {
        const arm = sk.arms[i], leg = sk.legs[i]
        const elbowZ = neckZ + depthOf(L.upperArm, dist2(arm.root, arm.joint))
        const handZ = elbowZ + depthOf(L.forearm, dist2(arm.joint, arm.end))
        to3(arm.root, neckZ, out.shoulders[i])
        to3(arm.joint, elbowZ, out.elbows[i])
        to3(arm.end, handZ, out.hands[i])
        const kneeZ = depthOf(L.thigh, dist2(leg.root, leg.joint))
        const ankleZ = kneeZ + depthOf(L.shin, dist2(leg.joint, leg.end))
        to3(leg.root, 0, out.hips[i])
        to3(leg.joint, kneeZ, out.knees[i])
        to3(leg.end, ankleZ, out.ankles[i])
        // toes point forward (toward the viewer) rather than out to the side as drawn
        to3([leg.end[0], leg.end[1] + 1], ankleZ + L.foot, out.toes[i])
    }
}

// ---------- mesh helpers ----------

const UP = new THREE.Vector3(0, 1, 0)
const tmpDir = new THREE.Vector3()

// A unit-height cylinder stretched and turned to run from a to b
function placeBone(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
    tmpDir.subVectors(b, a)
    const length = tmpDir.length()
    mesh.position.addVectors(a, b).multiplyScalar(0.5)
    mesh.scale.set(1, Math.max(length, 1e-4), 1)
    if (length > 1e-6) mesh.quaternion.setFromUnitVectors(UP, tmpDir.multiplyScalar(1 / length))
}

type Materials = Record<"body" | "joint" | "primary" | "secondary" | "steel" | "chrome" | "plate" | "pad" | "cable" | "rope" | "glow", THREE.Material>

function makeMaterials(): Materials {
    return {
        body: new THREE.MeshPhysicalMaterial({ color: 0x4a4a54, metalness: 0.25, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
        joint: new THREE.MeshPhysicalMaterial({ color: 0x8a8a94, metalness: 0.9, roughness: 0.25 }),
        primary: new THREE.MeshPhysicalMaterial({ color: 0xff2a14, emissive: 0xd40000, emissiveIntensity: 0.75, metalness: 0.2, roughness: 0.35, clearcoat: 1 }),
        secondary: new THREE.MeshPhysicalMaterial({ color: 0x9a2a2a, emissive: 0x3a0000, emissiveIntensity: 0.45, metalness: 0.25, roughness: 0.45, clearcoat: 0.6 }),
        steel: new THREE.MeshPhysicalMaterial({ color: 0x55555d, metalness: 1, roughness: 0.35 }),
        chrome: new THREE.MeshPhysicalMaterial({ color: 0xc9c9d1, metalness: 1, roughness: 0.18 }),
        plate: new THREE.MeshPhysicalMaterial({ color: 0x111114, metalness: 0.5, roughness: 0.4, clearcoat: 1 }),
        pad: new THREE.MeshPhysicalMaterial({ color: 0x2b1212, metalness: 0.05, roughness: 0.65, sheen: 0.6, sheenColor: new THREE.Color(0x661010) }),
        cable: new THREE.MeshStandardMaterial({ color: 0x9a9aa3, metalness: 0.9, roughness: 0.3 }),
        rope: new THREE.MeshStandardMaterial({ color: 0x8c8c96, metalness: 0.1, roughness: 0.85 }),
        glow: new THREE.MeshBasicMaterial({ color: 0xff2410 }),
    }
}

// ---------- equipment ----------

type HeldKind = "barbell" | "dumbbell" | "handle"

function barbellGroup(m: Materials, length: number, plateR: number) {
    const group = new THREE.Group() // bar along local y
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * S, 0.75 * S, length * S, 20), m.chrome)
    group.add(bar)
    for (const sign of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
            const r = (k === 0 ? plateR : plateR * 0.8) * S
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.6 * S, 40), m.plate)
            plate.position.y = sign * (length / 2 - 5 - k * 1.8) * S
            group.add(plate)
            const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.18 * S, 6, 48), m.glow)
            rim.rotation.x = Math.PI / 2
            rim.position.y = plate.position.y + sign * 0.82 * S
            group.add(rim)
        }
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * S, 1.4 * S, 1.6 * S, 20), m.steel)
        collar.position.y = sign * (length / 2 - 8.2) * S
        group.add(collar)
    }
    return group
}

function dumbbellGroup(m: Materials) {
    const group = new THREE.Group() // handle along local y
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7 * S, 0.7 * S, 9 * S, 16), m.chrome))
    for (const sign of [-1, 1]) {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * S, 3.2 * S, 2.6 * S, 6), m.plate)
        head.position.y = sign * 4.4 * S
        group.add(head)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(3 * S, 0.16 * S, 6, 24), m.glow)
        rim.rotation.x = Math.PI / 2
        rim.position.y = sign * 5.75 * S
        group.add(rim)
    }
    return group
}

function handleGroup(m: Materials) {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75 * S, 0.75 * S, 7 * S, 16), m.steel))
    return group
}

// Parses the scenery path data (M/H/V/L only) into line segments
function sceneryLines(paths: string[]): [Vec, Vec][] {
    const lines: [Vec, Vec][] = []
    for (const d of paths) {
        const tokens = d.match(/[MHVL]|-?\d*\.?\d+/g) ?? []
        let cursor: Vec = [0, 0]
        let i = 0
        while (i < tokens.length) {
            const cmd = tokens[i++]
            const num = () => Number(tokens[i++])
            if (cmd === "M") cursor = [num(), num()]
            else if (cmd === "H") { const next: Vec = [num(), cursor[1]]; lines.push([cursor, next]); cursor = next }
            else if (cmd === "V") { const next: Vec = [cursor[0], num()]; lines.push([cursor, next]); cursor = next }
            else if (cmd === "L") { const next: Vec = [num(), num()]; lines.push([cursor, next]); cursor = next }
        }
    }
    return lines
}

function sceneryGroup(motion: Motion, m: Materials, skipHighBars: boolean) {
    const group = new THREE.Group()
    const box = new THREE.BoxGeometry(1, 1, 1)
    for (const [a, b] of sceneryLines(motion.scenery ?? [])) {
        const dx = b[0] - a[0], dy = b[1] - a[1]
        const length = Math.hypot(dx, dy)
        if (length < 0.5) continue
        const vertical = Math.abs(dx) < Math.abs(dy) * 0.3
        const angle = Math.atan2(-(dy), dx) // y flips going into 3D
        const centre = to3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 0)
        // pads hang below their line so the line is the surface you sit or lie on
        const drop = vertical ? 0 : 1.5 * S
        const place = (mesh: THREE.Mesh, z: number) => {
            mesh.position.set(centre.x + Math.sin(angle) * drop, centre.y - Math.cos(angle) * drop, z * S)
            mesh.rotation.z = angle
            mesh.castShadow = true
            mesh.receiveShadow = true
            group.add(mesh)
        }
        const horizontal = Math.abs(dy) < Math.abs(dx) * 0.2
        const highBar = horizontal && Math.max(a[1], b[1]) < 62 // dip bars, pull-up frame: above the hips
        if (highBar && skipHighBars) continue
        if (motion.view === "side") {
            if (highBar) {
                // bars you hold or hang from: a rail on each side of the body
                for (const z of [-11, 11]) {
                    const rail = new THREE.Mesh(box, m.chrome)
                    rail.scale.set(length * S, 1.8 * S, 1.8 * S)
                    rail.position.set(centre.x, centre.y, z * S)
                    rail.rotation.z = angle
                    rail.castShadow = true
                    group.add(rail)
                }
            } else if (vertical) {
                // frame posts and bench legs: one each side of the body
                for (const z of [-7, 7]) {
                    const post = new THREE.Mesh(box, m.steel)
                    post.scale.set(length * S, 2.2 * S, 2.2 * S)
                    place(post, z)
                }
            } else {
                const pad = new THREE.Mesh(box, m.pad)
                pad.scale.set(length * S, 3 * S, 16 * S)
                place(pad, 0)
            }
        } else {
            // front view: seats reach toward the viewer, under the thighs
            const part = new THREE.Mesh(box, vertical ? m.steel : m.pad)
            part.scale.set(length * S, (vertical ? 2.4 : 3) * S, (vertical ? 3 : 18) * S)
            place(part, vertical ? 0 : 6)
        }
    }
    return group
}

function floorTexture() {
    const size = 512
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = size
    const ctx = canvas.getContext("2d")!
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, "#1b1414")
    g.addColorStop(0.7, "#0d0a0a")
    g.addColorStop(1, "rgba(8,6,6,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = "rgba(255,255,255,0.05)"
    ctx.lineWidth = 1
    for (let x = 0; x <= size; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(size, x); ctx.stroke()
    }
    // fade the grid out toward the edge
    const fade = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size / 2)
    fade.addColorStop(0, "rgba(0,0,0,0)")
    fade.addColorStop(1, "rgba(7,5,5,1)")
    ctx.globalCompositeOperation = "destination-out"
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

// ---------- the scene ----------

export function createExercise3D(container: HTMLElement, options: Exercise3DOptions): Exercise3DScene {
    const { motion, primary, secondary, reducedMotion } = options
    const form: Form3D = FORM_3D[options.motionId] ?? {}
    const small = window.innerWidth < 768
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = () => container.clientWidth || 600
    const height = () => container.clientHeight || 400

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" })
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width(), height())
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)
    renderer.domElement.style.display = "block"
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.touchAction = "none"

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0909)
    scene.fog = new THREE.Fog(0x0b0909, 9, 18)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.35

    const camera = new THREE.PerspectiveCamera(32, width() / height(), 0.05, 60)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x220606, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 6, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 4; key.shadow.camera.bottom = -2
    key.shadow.bias = -0.0005
    key.shadow.radius = 4
    scene.add(key)
    const rim = new THREE.PointLight(0xff1a00, 18, 12)
    rim.position.set(-3, 3, -3)
    scene.add(rim)
    const fill = new THREE.PointLight(0xffffff, 4, 10)
    fill.position.set(-2, 1.5, 4)
    scene.add(fill)

    const m = makeMaterials()

    // floor
    const floorTex = floorTexture()
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, roughness: 0.9, metalness: 0 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.58, 128), new THREE.MeshBasicMaterial({ color: 0xb00000, transparent: true, opacity: 0.6, side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.002
    scene.add(ring)

    // ---- mannequin ----
    const highlight = (part: Part) =>
        PART_MUSCLES[part].some((muscle) => primary.includes(muscle)) ? m.primary
            : PART_MUSCLES[part].some((muscle) => secondary.includes(muscle)) ? m.secondary
            : m.body
    const jointGeo = new THREE.SphereGeometry(1, 20, 14)
    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 18)
    const figure = new THREE.Group()
    scene.add(figure)

    const bone = (radius: number, material: THREE.Material) => {
        const mesh = new THREE.Mesh(boneGeo, material)
        mesh.userData.radius = radius * S
        mesh.castShadow = true
        figure.add(mesh)
        return mesh
    }
    const joint = (radius: number, material: THREE.Material) => {
        const mesh = new THREE.Mesh(jointGeo, material)
        mesh.scale.setScalar(radius * S)
        mesh.castShadow = true
        figure.add(mesh)
        return mesh
    }

    const torso = bone(4.6, highlight("torso"))
    const chest = joint(5.4, highlight("torso"))
    const shoulderBar = bone(2.6, highlight("shoulders"))
    const pelvisBar = bone(3.2, highlight("pelvis"))
    const neckBone = bone(1.6, m.joint)
    const head = joint(HEAD_RADIUS * 0.92, m.joint)
    const shoulderBalls = [joint(3, highlight("shoulders")), joint(3, highlight("shoulders"))]
    const upperArms = [bone(2.1, highlight("upperArms")), bone(2.1, highlight("upperArms"))]
    const elbows = [joint(1.9, m.joint), joint(1.9, m.joint)]
    const forearms = [bone(1.7, highlight("forearms")), bone(1.7, highlight("forearms"))]
    const handBalls = [joint(1.7, m.joint), joint(1.7, m.joint)]
    const hipBalls = [joint(3.1, highlight("pelvis")), joint(3.1, highlight("pelvis"))]
    const thighs = [bone(3, highlight("thighs")), bone(3, highlight("thighs"))]
    const knees = [joint(2.5, m.joint), joint(2.5, m.joint)]
    const shins = [bone(2.2, highlight("shins")), bone(2.2, highlight("shins"))]
    const ankleBalls = [joint(1.7, m.joint), joint(1.7, m.joint)]
    const feet = [bone(1.3, m.body), bone(1.3, m.body)]
    // a visor stripe so it's obvious which way the head faces
    const visor = new THREE.Mesh(new THREE.TorusGeometry(HEAD_RADIUS * 0.92 * S, 0.35 * S, 8, 48, Math.PI * 0.9), m.glow)
    figure.add(visor)

    const setRadius = (mesh: THREE.Mesh) => { mesh.scale.x = mesh.scale.z = mesh.userData.radius }

    // ---- equipment ----
    const equipment = new THREE.Group()
    scene.add(equipment)
    equipment.add(sceneryGroup(motion, m, Boolean(form.hangBar)))

    const held: { kind: HeldKind, group: THREE.Group, hand: 0 | 1 }[] = []
    let barbell: THREE.Group | null = null
    if (motion.grip === "barbell") {
        barbell = barbellGroup(m, motion.view === "front" ? 70 : 54, motion.plateR ?? 7)
        equipment.add(barbell)
    } else if (motion.grip === "dumbbell" && form.oneWeight) {
        // one dumbbell held in both hands, upright (goblet squat, overhead extension)
        const group = dumbbellGroup(m)
        equipment.add(group)
        held.push({ kind: "dumbbell", group, hand: 0 })
    } else if (motion.grip === "dumbbell" || (motion.grip === "handle" && !form.attachment)) {
        const hands: (0 | 1)[] = motion.gripHands === "near" ? [0] : [0, 1]
        for (const hand of hands) {
            const group = motion.grip === "dumbbell" ? dumbbellGroup(m) : handleGroup(m)
            equipment.add(group)
            held.push({ kind: motion.grip, group, hand })
        }
    }
    const backBar = motion.backBar ? barbellGroup(m, 54, motion.plateR ?? 7) : null
    const hipBar = motion.hipBar ? barbellGroup(m, 54, motion.plateR ?? 7) : null
    if (backBar) equipment.add(backBar)
    if (hipBar) equipment.add(hipBar)

    const platform = motion.platform ? new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m.steel) : null
    if (platform) { platform.scale.set(22 * S, 2.2 * S, 22 * S); platform.castShadow = true; equipment.add(platform) }
    const anklePad = motion.anklePad ? new THREE.Mesh(new THREE.CylinderGeometry(3.2 * S, 3.2 * S, 18 * S, 24), m.pad) : null
    if (anklePad) { anklePad.rotation.x = Math.PI / 2; anklePad.castShadow = true; equipment.add(anklePad) }

    // cable attachments: what the hands actually hold, and where the cable clips on
    const attachment = form.attachment ? new THREE.Group() : null
    const attachmentBones: THREE.Mesh[] = []
    if (attachment) {
        equipment.add(attachment)
        const grip = (form.grip ?? 6) * S
        if (form.attachment === "lat-bar" || form.attachment === "straight-bar") {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * S, 0.8 * S, 1, 16), m.chrome)
            placeBone(bar, new THREE.Vector3(0, 0, -grip - (form.attachment === "straight-bar" ? 3 * S : 0)), new THREE.Vector3(0, 0, grip + (form.attachment === "straight-bar" ? 3 * S : 0)))
            bar.scale.x = bar.scale.z = 1
            attachment.add(bar)
            if (form.attachment === "lat-bar") {
                // the classic lat bar: ends angled down and back, with rubber grips
                for (const sign of [-1, 1]) {
                    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * S, 0.8 * S, 1, 16), m.chrome)
                    placeBone(end, new THREE.Vector3(0, 0, sign * grip), new THREE.Vector3(0, -3.2 * S, sign * (grip + 8 * S)))
                    attachment.add(end)
                    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(1.15 * S, 1.15 * S, 1, 16), m.plate)
                    placeBone(sleeve, new THREE.Vector3(0, -1.2 * S, sign * (grip + 3 * S)), new THREE.Vector3(0, -3 * S, sign * (grip + 7.6 * S)))
                    attachment.add(sleeve)
                }
            }
            const clip = new THREE.Mesh(new THREE.TorusGeometry(1.2 * S, 0.35 * S, 8, 20), m.steel)
            clip.position.y = 1.2 * S
            attachment.add(clip)
        } else {
            // rope (two strands with knots) or V-handle (two steel arms): from the clip to each hand
            for (let i = 0; i < 2; i++) {
                const strand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), form.attachment === "rope" ? m.rope : m.steel)
                strand.userData.radius = (form.attachment === "rope" ? 0.7 : 0.55) * S
                equipment.add(strand)
                attachmentBones.push(strand)
                const knob = new THREE.Mesh(new THREE.SphereGeometry(form.attachment === "rope" ? 1.4 * S : 1 * S, 14, 10), form.attachment === "rope" ? m.plate : m.steel)
                equipment.add(knob)
                attachmentBones.push(knob)
            }
            const clip = new THREE.Mesh(new THREE.TorusGeometry(1.2 * S, 0.35 * S, 8, 20), m.steel)
            attachment.add(clip)
        }
    }
    const clipPoint = v3()

    // pull-up / hanging bar across the hands, on a two-post frame
    const hang = form.hangBar ? { bar: new THREE.Mesh(boneGeo, m.chrome), posts: [new THREE.Mesh(boneGeo, m.steel), new THREE.Mesh(boneGeo, m.steel)] } : null
    if (hang) {
        hang.bar.userData.radius = 0.9 * S
        hang.posts.forEach((post) => { post.userData.radius = 1.4 * S; post.castShadow = true; equipment.add(post) })
        hang.bar.castShadow = true
        equipment.add(hang.bar)
    }

    const cableCount = motion.cable ? (motion.view === "front" ? 2 : 1) : 0
    const cables = Array.from({ length: cableCount }, () => {
        const mesh = new THREE.Mesh(boneGeo, m.cable)
        mesh.userData.radius = 0.32 * S
        equipment.add(mesh)
        const pulley = new THREE.Mesh(new THREE.TorusGeometry(1.6 * S, 0.5 * S, 8, 24), m.steel)
        equipment.add(pulley)
        return { mesh, pulley }
    })

    // ---- per-frame update ----
    const J = newJoints()
    const a3 = v3(), b3 = v3()

    function update(t: number) {
        const sk = solvePose(motion, t)
        liftSkeleton(sk, J, form)

        // torso: from the hips to a little below the shoulders, with a chest block on top
        a3.copy(J.hip).lerp(J.neck, 0.05)
        b3.copy(J.hip).lerp(J.neck, 0.78)
        placeBone(torso, a3, b3); setRadius(torso)
        chest.position.copy(J.hip).lerp(J.neck, 0.72)
        chest.scale.set(5.4 * S, 6 * S, 5.4 * S)
        chest.quaternion.copy(torso.quaternion)
        placeBone(shoulderBar, J.shoulders[0], J.shoulders[1]); setRadius(shoulderBar)
        placeBone(pelvisBar, J.hips[0], J.hips[1]); setRadius(pelvisBar)
        b3.copy(J.neck).lerp(J.head, 0.55)
        placeBone(neckBone, J.neck, b3); setRadius(neckBone)
        head.position.copy(J.head)
        // visor faces where the figure faces: +x in side view, toward the viewer in front view
        visor.position.copy(J.head)
        visor.rotation.set(0, sk.view === "side" ? 0 : -Math.PI / 2, 0)
        if (sk.view === "side") {
            visor.rotation.set(Math.PI / 2, 0, -Math.PI * 0.45 + ((sk.pose.head ?? sk.torsoAngle) * Math.PI) / 180)
        } else {
            visor.rotation.set(0, Math.PI / 2, Math.PI * 0.05)
        }

        for (let i = 0; i < 2; i++) {
            shoulderBalls[i].position.copy(J.shoulders[i])
            placeBone(upperArms[i], J.shoulders[i], J.elbows[i]); setRadius(upperArms[i])
            elbows[i].position.copy(J.elbows[i])
            placeBone(forearms[i], J.elbows[i], J.hands[i]); setRadius(forearms[i])
            handBalls[i].position.copy(J.hands[i])
            hipBalls[i].position.copy(J.hips[i])
            placeBone(thighs[i], J.hips[i], J.knees[i]); setRadius(thighs[i])
            knees[i].position.copy(J.knees[i])
            placeBone(shins[i], J.knees[i], J.ankles[i]); setRadius(shins[i])
            ankleBalls[i].position.copy(J.ankles[i])
            placeBone(feet[i], J.ankles[i], J.toes[i]); setRadius(feet[i])
        }

        // held equipment
        if (barbell) {
            if (sk.view === "front") {
                barbell.position.copy(J.hands[0]).add(J.hands[1]).multiplyScalar(0.5)
                barbell.rotation.set(0, 0, Math.PI / 2) // along x
            } else {
                barbell.position.copy(J.hands[0]).add(J.hands[1]).multiplyScalar(0.5)
                barbell.rotation.set(Math.PI / 2, 0, 0) // along z, through both hands
            }
        }
        for (const item of held) {
            if (form.oneWeight) {
                item.group.position.copy(J.hands[0]).add(J.hands[1]).multiplyScalar(0.5)
                item.group.rotation.set(0, 0, 0) // upright, cupped in both hands
                continue
            }
            item.group.position.copy(J.hands[item.hand])
            if (sk.view === "side") item.group.rotation.set(Math.PI / 2, 0, 0)
            else item.group.rotation.set(0, 0, Math.PI / 2)
        }

        // where the cable clips on: the hand, or the middle of the bar / the knot of the rope
        clipPoint.copy(J.hands[0])
        if (attachment) {
            const mid = a3.copy(J.hands[0]).add(J.hands[1]).multiplyScalar(0.5)
            if (form.attachment === "lat-bar" || form.attachment === "straight-bar") {
                attachment.position.copy(mid)
                clipPoint.copy(mid).setY(mid.y + 1.2 * S)
            } else {
                // the knot sits a little way toward the cable
                const anchor = motion.cable ? to3(motion.cable, 0, b3) : b3.copy(mid).setY(mid.y + 1)
                clipPoint.copy(mid).addScaledVector(anchor.sub(mid).normalize(), (form.attachment === "rope" ? 6 : 7) * S)
                attachment.position.copy(clipPoint)
                attachment.lookAt(mid)
                for (let i = 0; i < 2; i++) {
                    const strand = attachmentBones[i * 2] as THREE.Mesh, knob = attachmentBones[i * 2 + 1]
                    placeBone(strand, clipPoint, J.hands[i]); setRadius(strand)
                    knob.position.copy(J.hands[i])
                }
            }
        }

        if (hang) {
            const mid = a3.copy(J.hands[0]).add(J.hands[1]).multiplyScalar(0.5)
            const half = ((form.grip ?? 12) + 9) * S
            placeBone(hang.bar, b3.set(mid.x, mid.y + 0.4 * S, mid.z - half), v3().set(mid.x, mid.y + 0.4 * S, mid.z + half)); setRadius(hang.bar)
            hang.posts.forEach((post, i) => {
                const z = mid.z + (i === 0 ? -half : half)
                placeBone(post, b3.set(mid.x, 0, z), v3().set(mid.x, mid.y + 0.4 * S, z)); setRadius(post)
            })
        }
        if (backBar) { to3(backBarAt(sk), 0, backBar.position); backBar.rotation.set(Math.PI / 2, 0, 0) }
        if (hipBar) { to3(hipBarAt(sk), 0, hipBar.position); hipBar.rotation.set(Math.PI / 2, 0, 0) }
        if (platform) {
            const { center, angle } = platformAt(sk.legs[0])
            to3(center, 0, platform.position)
            const along = directionOf(angle + 90, 1)
            platform.rotation.set(0, 0, Math.atan2(-along[1], along[0]))
        }
        if (anklePad) {
            const at = anklePadAt(sk.legs[0])
            to3(at, 0, anklePad.position)
        }
        cables.forEach((cable, i) => {
            const anchor2: Vec = i === 0 ? motion.cable! : [120 - motion.cable![0], motion.cable![1]]
            const end = motion.cableTo === "ankle" ? J.ankles[0] : attachment ? clipPoint : J.hands[i]
            const anchor = to3(anchor2, sk.view === "side" ? end.z / S : end.z / S * 0.3, a3)
            placeBone(cable.mesh, anchor, end); setRadius(cable.mesh)
            cable.pulley.position.copy(anchor)
            cable.pulley.lookAt(end)
        })
    }

    // ---- framing: fit the whole rep (body + equipment) in view ----
    const box = new THREE.Box3()
    for (const t of [0, 0.5, 1]) {
        update(t)
        figure.updateMatrixWorld(true)
        equipment.updateMatrixWorld(true)
        box.expandByObject(figure)
        box.expandByObject(equipment)
    }
    box.min.y = Math.max(box.min.y, 0)
    const centre = box.getCenter(v3())
    const size = box.getSize(v3())
    const radius = Math.max(size.x, size.y, size.z) * 0.5 + 0.15
    const fitDistance = radius / Math.sin((camera.fov * Math.PI) / 360) * (camera.aspect < 1 ? 1.25 : 1)
    const azimuth = motion.view === "side" ? 0.62 : -0.5 // side-view figures face +x, so look from the front-side
    const elevation = 0.28
    camera.position.set(
        centre.x + Math.sin(azimuth) * Math.cos(elevation) * fitDistance,
        centre.y + Math.sin(elevation) * fitDistance,
        centre.z + Math.cos(azimuth) * Math.cos(elevation) * fitDistance,
    )

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(centre)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = fitDistance * 0.45
    controls.maxDistance = fitDistance * 1.8
    controls.maxPolarAngle = Math.PI * 0.49 // stay above the floor
    controls.autoRotate = !reducedMotion
    controls.autoRotateSpeed = 0.7
    controls.update()
    const onStart = () => {
        controls.autoRotate = false
        options.onInteract?.()
    }
    controls.addEventListener("start", onStart)

    // ---- bloom on larger screens: makes the worked muscles glow ----
    let composer: EffectComposer | null = null
    let bloom: UnrealBloomPass | null = null
    if (!small) {
        composer = new EffectComposer(renderer)
        composer.setPixelRatio(pixelRatio)
        composer.addPass(new RenderPass(scene, camera))
        bloom = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.32, 0.4, 0.82)
        composer.addPass(bloom)
        composer.addPass(new OutputPass())
    }

    // ---- loop: only while visible ----
    const period = options.period ?? motion.period ?? DEFAULT_PERIOD_MS
    const start = performance.now()
    let frame = 0
    let running = false
    let onScreen = true

    const draw = () => {
        if (composer) composer.render()
        else renderer.render(scene, camera)
    }
    const tick = (now: number) => {
        frame = requestAnimationFrame(tick)
        const phase = ((now - start) % period) / period
        update(reducedMotion ? 0.5 : (1 - Math.cos(phase * 2 * Math.PI)) / 2)
        controls.update()
        draw()
    }
    const setRunning = (next: boolean) => {
        if (next === running) return
        running = next
        if (running) frame = requestAnimationFrame(tick)
        else cancelAnimationFrame(frame)
    }
    const evaluate = () => setRunning(onScreen && !document.hidden)

    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; evaluate() })
    observer.observe(container)
    document.addEventListener("visibilitychange", evaluate)

    const resizeObserver = new ResizeObserver(() => {
        const w = width(), h = height()
        renderer.setSize(w, h)
        composer?.setSize(w, h)
        bloom?.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        if (!running) draw()
    })
    resizeObserver.observe(container)

    update(0.5)
    draw()
    evaluate()

    return {
        dispose: () => {
            setRunning(false)
            observer.disconnect()
            resizeObserver.disconnect()
            document.removeEventListener("visibilitychange", evaluate)
            controls.removeEventListener("start", onStart)
            controls.dispose()
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh) {
                    o.geometry.dispose()
                    const mat = o.material as THREE.Material | THREE.Material[]
                    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
                    else mat.dispose()
                }
            })
            floorTex.dispose()
            env.dispose()
            pmrem.dispose()
            composer?.dispose()
            renderer.dispose()
            renderer.forceContextLoss()
            renderer.domElement.remove()
        },
    }
}
