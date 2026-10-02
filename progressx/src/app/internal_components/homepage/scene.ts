import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

// The homepage's WebGL scene. One fixed canvas sits behind the whole page; the page tells it how far the
// visitor has scrolled as a single timeline value T:
//   0 → 1  hero: the chrome dumbbell dissolves into particles
//   1 → 6  story: the particles morph dumbbell → bar chart → macro donut → DNA helix → globe → X logo
//   6 → 7  the logo bursts into a starfield behind the feature sections
//   7 → 8  the starfield gathers back into a dumbbell behind the final call to action

export type HomeScene = {
    setTimeline: (t: number) => void,
    setPointer: (x: number, y: number) => void, // -1..1
    dispose: () => void,
}

// ---------- palette: shades of the app's red, white and greys ----------

const C = {
    crimson: new THREE.Color("#e20000"),
    scarlet: new THREE.Color("#ff2a14"),
    ember: new THREE.Color("#ff5a36"),
    coral: new THREE.Color("#ff8a70"),
    blood: new THREE.Color("#8c0000"),
    oxblood: new THREE.Color("#4a0000"),
    white: new THREE.Color("#ffffff"),
    pearl: new THREE.Color("#f3eeee"),
    silver: new THREE.Color("#b9b9c0"),
    graphite: new THREE.Color("#5b5b63"),
}

// ---------- deterministic randomness (same shapes on every visit) ----------

function mulberry32(seed: number) {
    return () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

type Rand = () => number
type Part = {
    weight: number,
    sample: (out: THREE.Vector3, r: Rand) => void,
    color: (p: THREE.Vector3, r: Rand, out: THREE.Color) => void,
}
type Shape = { pos: Float32Array, col: Float32Array }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
    const t = clamp01((v - a) / (b - a))
    return t * t * (3 - 2 * t)
}
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function mix(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number) {
    return out.copy(a).lerp(b, t)
}

// Spreads n points over the parts by weight, then shuffles them so every morph is a swirl, not a slide
function buildShape(n: number, parts: Part[], seed: number, transform?: THREE.Matrix4): Shape {
    const r = mulberry32(seed)
    const total = parts.reduce((sum, p) => sum + p.weight, 0)
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const v = new THREE.Vector3()
    const c = new THREE.Color()
    let i = 0
    parts.forEach((part, index) => {
        const count = index === parts.length - 1 ? n - i : Math.round((part.weight / total) * n)
        for (let k = 0; k < count && i < n; k++, i++) {
            part.sample(v, r)
            part.color(v, r, c)
            if (transform) v.applyMatrix4(transform)
            pos.set([v.x, v.y, v.z], i * 3)
            col.set([c.r, c.g, c.b], i * 3)
        }
    })
    for (let a = n - 1; a > 0; a--) {
        const b = Math.floor(r() * (a + 1))
        for (let k = 0; k < 3; k++) {
            const tp = pos[a * 3 + k]; pos[a * 3 + k] = pos[b * 3 + k]; pos[b * 3 + k] = tp
            const tc = col[a * 3 + k]; col[a * 3 + k] = col[b * 3 + k]; col[b * 3 + k] = tc
        }
    }
    return { pos, col }
}

// ---------- shapes ----------

// Plates on each side: [inner x, outer x, radius]
const PLATES: [number, number, number][] = [[1.2, 1.42, 1.0], [1.46, 1.64, 0.82], [1.68, 1.82, 0.64]]
const HANDLE = { half: 1.05, r: 0.13 }
const COLLAR = { from: 1.05, to: 1.2, r: 0.24 }

function dumbbellShape(n: number): Shape {
    const side = (r: Rand) => (r() < 0.5 ? -1 : 1)
    const parts: Part[] = [
        {
            weight: 2 * Math.PI * HANDLE.r * HANDLE.half * 2,
            sample: (o, r) => { const a = r() * Math.PI * 2; o.set(lerp(-HANDLE.half, HANDLE.half, r()), Math.cos(a) * HANDLE.r, Math.sin(a) * HANDLE.r) },
            color: (_p, r, o) => mix(o, C.silver, C.white, r()),
        },
        {
            weight: 2 * 2 * Math.PI * COLLAR.r * (COLLAR.to - COLLAR.from),
            sample: (o, r) => { const a = r() * Math.PI * 2; o.set(side(r) * lerp(COLLAR.from, COLLAR.to, r()), Math.cos(a) * COLLAR.r, Math.sin(a) * COLLAR.r) },
            color: (_p, r, o) => mix(o, C.pearl, C.white, r()),
        },
        ...PLATES.flatMap(([x0, x1, R]): Part[] => [
            {
                // rim
                weight: 2 * 2 * Math.PI * R * (x1 - x0) * 1.4,
                sample: (o, r) => { const a = r() * Math.PI * 2; o.set(side(r) * lerp(x0, x1, r()), Math.cos(a) * R, Math.sin(a) * R) },
                color: (_p, r, o) => mix(o, C.scarlet, C.ember, r()),
            },
            {
                // both faces of the plate
                weight: 2 * 2 * Math.PI * (R * R - 0.02) * 0.55,
                sample: (o, r) => {
                    const a = r() * Math.PI * 2
                    const rho = Math.sqrt(lerp(0.15 * 0.15, R * R, r()))
                    o.set(side(r) * (r() < 0.5 ? x0 : x1), Math.cos(a) * rho, Math.sin(a) * rho)
                },
                color: (p, r, o) => {
                    const rho = Math.hypot(p.y, p.z) / R
                    if (rho > 0.55 && rho < 0.6) return o.copy(C.white)
                    return mix(o, C.oxblood, C.crimson, Math.pow(rho, 1.4) * 0.85 + r() * 0.15)
                },
            },
        ]),
        {
            weight: 0.25,
            sample: (o, r) => { const a = r() * Math.PI * 2; const rho = Math.sqrt(r()) * 0.2; o.set(side(r) * 1.86, Math.cos(a) * rho, Math.sin(a) * rho) },
            color: (_p, _r, o) => o.copy(C.white),
        },
    ]
    return buildShape(n, parts, 11)
}

function boxSurface(o: THREE.Vector3, r: Rand, cx: number, cy: number, cz: number, w: number, h: number, d: number) {
    const areas = [w * h, w * h, w * d, w * d, h * d, h * d]
    let pick = r() * areas.reduce((s, a) => s + a, 0)
    let face = 0
    while (pick > areas[face] && face < 5) pick -= areas[face++]
    const u = r() - 0.5, v = r() - 0.5
    switch (face) {
        case 0: o.set(cx + u * w, cy + v * h, cz + d / 2); break
        case 1: o.set(cx + u * w, cy + v * h, cz - d / 2); break
        case 2: o.set(cx + u * w, cy + h / 2, cz + v * d); break
        case 3: o.set(cx + u * w, cy - h / 2, cz + v * d); break
        case 4: o.set(cx + w / 2, cy + u * h, cz + v * d); break
        default: o.set(cx - w / 2, cy + u * h, cz + v * d)
    }
}

const BAR_HEIGHTS = [0.7, 0.95, 1.1, 1.45, 1.8, 2.25, 2.8]
const BAR_BASE = -1.45

function barsShape(n: number): Shape {
    const barX = (i: number) => -2.1 + i * 0.7
    const parts: Part[] = [
        {
            weight: 7,
            sample: (o, r) => {
                const i = Math.floor(r() * BAR_HEIGHTS.length)
                const h = BAR_HEIGHTS[i]
                boxSurface(o, r, barX(i), BAR_BASE + h / 2, 0, 0.42, h, 0.42)
            },
            color: (p, r, o) => {
                const level = (p.x + 2.1) / 4.2
                if (p.y > BAR_BASE + 0.02 && r() < 0.08) return o.copy(C.white)
                return mix(o, C.blood, C.ember, level * 0.9 + r() * 0.1)
            },
        },
        {
            // the trend line riding above the bars
            weight: 1.6,
            sample: (o, r) => {
                const t = r() * (BAR_HEIGHTS.length - 1)
                const i = Math.floor(t), f = t - i
                const y = BAR_BASE + lerp(BAR_HEIGHTS[i], BAR_HEIGHTS[Math.min(i + 1, BAR_HEIGHTS.length - 1)], f) + 0.32
                o.set(lerp(barX(i), barX(i + 1), f) + (r() - 0.5) * 0.02, y + (r() - 0.5) * 0.03, (r() - 0.5) * 0.03)
            },
            color: (_p, r, o) => mix(o, C.pearl, C.white, r()),
        },
        {
            // a dotted floor grid
            weight: 1.4,
            sample: (o, r) => o.set(Math.round(lerp(-2.6, 2.6, r()) * 5) / 5, BAR_BASE - 0.05, Math.round(lerp(-0.9, 0.9, r()) * 5) / 5),
            color: (_p, r, o) => mix(o, C.graphite, C.silver, r() * 0.4),
        },
    ]
    return buildShape(n, parts, 23)
}

function donutShape(n: number): Shape {
    const R = 1.45, tube = 0.36, gap = 0.07
    // protein, carbs, fats (fractions of the ring) in three shades
    const arcs: [number, number, THREE.Color, THREE.Color][] = [
        [0, 0.4, C.crimson, C.scarlet],
        [0.4, 0.82, C.pearl, C.white],
        [0.82, 1, C.blood, C.ember],
    ]
    const parts: Part[] = [
        ...arcs.map(([from, to, c1, c2]): Part => ({
            weight: (to - from) * 10,
            sample: (o, r) => {
                const u = lerp(from * Math.PI * 2 + gap, to * Math.PI * 2 - gap, r())
                const v = r() * Math.PI * 2
                o.set((R + tube * Math.cos(v)) * Math.cos(u), (R + tube * Math.cos(v)) * Math.sin(u), tube * Math.sin(v))
            },
            color: (_p, r, o) => mix(o, c1, c2, r()),
        })),
        {
            // 22 little clusters inside the ring: one per tracked micronutrient
            weight: 1.6,
            sample: (o, r) => {
                const k = Math.floor(r() * 22)
                const a = (k / 22) * Math.PI * 2 + Math.PI / 2
                const s = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(Math.cbrt(r()) * 0.07)
                o.set(Math.cos(a) * 0.78 + s.x, Math.sin(a) * 0.78 + s.y, s.z)
            },
            color: (_p, r, o) => mix(o, C.silver, C.white, r()),
        },
    ]
    return buildShape(n, parts, 37, new THREE.Matrix4().makeRotationX(-0.55).multiply(new THREE.Matrix4().makeRotationZ(0.3)))
}

function helixShape(n: number): Shape {
    const R = 0.95, span = 2.15, twist = 1.75
    const strand = (y: number, phase: number) => new THREE.Vector3(Math.cos(y * twist + phase) * R, y, Math.sin(y * twist + phase) * R)
    const jitter = (r: Rand, s: number) => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(s)
    const parts: Part[] = [
        {
            weight: 5.5,
            sample: (o, r) => {
                const y = lerp(-span, span, r())
                o.copy(strand(y, r() < 0.5 ? 0 : Math.PI)).add(jitter(r, 0.14))
            },
            color: (p, r, o) => mix(o, C.crimson, C.coral, (p.y + span) / (2 * span) * 0.7 + r() * 0.3),
        },
        {
            // base pairs: each rung is half red, half white
            weight: 4.5,
            sample: (o, r) => {
                const rung = Math.floor(r() * 20)
                const y = lerp(-span, span, (rung + 0.5) / 20)
                o.copy(strand(y, 0)).lerp(strand(y, Math.PI), r()).add(jitter(r, 0.035))
            },
            color: (p, r, o) => {
                const a = Math.atan2(p.z, p.x) - p.y * twist
                return Math.cos(a) > 0 ? mix(o, C.pearl, C.white, r()) : mix(o, C.scarlet, C.ember, r())
            },
        },
    ]
    return buildShape(n, parts, 41, new THREE.Matrix4().makeRotationZ(0.42))
}

function globeShape(n: number): Shape {
    const R = 1.38
    const seeds = mulberry32(53)
    const onSphere = (r: Rand) => {
        const u = r() * 2 - 1, a = r() * Math.PI * 2
        const s = Math.sqrt(1 - u * u)
        return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a))
    }
    const nodes = Array.from({ length: 34 }, () => onSphere(seeds))
    const links = Array.from({ length: 46 }, () => [Math.floor(seeds() * nodes.length), Math.floor(seeds() * nodes.length)] as const)
        .filter(([a, b]) => a !== b && nodes[a].angleTo(nodes[b]) > 0.5)
    const parts: Part[] = [
        {
            weight: 5.2,
            sample: (o, r) => o.copy(onSphere(r)).multiplyScalar(R),
            color: (p, r, o) => mix(o, C.graphite, C.silver, 0.25 + 0.5 * r() + 0.25 * (p.y / R)),
        },
        {
            // arcs between people: raised great circles
            weight: 3.2,
            sample: (o, r) => {
                const [a, b] = links[Math.floor(r() * links.length)]
                const t = r()
                const q = new THREE.Quaternion().setFromUnitVectors(nodes[a], nodes[b])
                const step = new THREE.Quaternion().slerp(q, t)
                o.copy(nodes[a]).applyQuaternion(step).multiplyScalar(R * (1 + 0.22 * Math.sin(Math.PI * t)))
            },
            color: (_p, r, o) => mix(o, C.crimson, C.coral, r()),
        },
        {
            weight: 0.9,
            sample: (o, r) => {
                const node = nodes[Math.floor(r() * nodes.length)]
                o.copy(node).multiplyScalar(R).add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.12))
            },
            color: (_p, _r, o) => o.copy(C.white),
        },
        {
            weight: 0.9,
            sample: (o, r) => { const a = r() * Math.PI * 2; o.set(Math.cos(a) * 1.95, (r() - 0.5) * 0.03, Math.sin(a) * 1.95) },
            color: (_p, r, o) => mix(o, C.blood, C.scarlet, r()),
        },
    ]
    return buildShape(n, parts, 59, new THREE.Matrix4().makeRotationX(0.32).multiply(new THREE.Matrix4().makeRotationZ(-0.2)))
}

function logoShape(n: number): Shape {
    // the X from the ProgressX wordmark: two thick crossing strokes
    const len = 3.3, w = 0.58, d = 0.4
    const strokes = [0.56, -0.56]
    const parts: Part[] = [
        ...strokes.map((angle, i): Part => ({
            weight: 5,
            sample: (o, r) => {
                boxSurface(o, r, 0, 0, 0, w, len, d)
                o.applyAxisAngle(new THREE.Vector3(0, 0, 1), angle)
            },
            color: (p, r, o) => {
                const edge = Math.abs(p.z) > d / 2 - 0.01 && r() < 0.55
                if (r() < 0.06) return o.copy(C.white)
                return edge ? mix(o, C.scarlet, C.ember, r()) : mix(o, i ? C.blood : C.crimson, C.scarlet, r() * 0.6)
            },
        })),
        {
            weight: 1.2,
            sample: (o, r) => { const a = r() * Math.PI * 2; const rr = 2.2 + (r() - 0.5) * 0.04; o.set(Math.cos(a) * rr, Math.sin(a) * rr, (r() - 0.5) * 0.04) },
            color: (_p, r, o) => mix(o, C.graphite, C.pearl, r() * 0.6),
        },
    ]
    return buildShape(n, parts, 67)
}

function fieldShape(n: number): Shape {
    const parts: Part[] = [{
        weight: 1,
        sample: (o, r) => o.set(lerp(-11, 11, r()), lerp(-6.5, 6.5, r()), lerp(-10, 1.5, r())),
        color: (_p, r, o) => (r() < 0.22 ? mix(o, C.blood, C.scarlet, r()) : mix(o, C.graphite, C.pearl, r() * 0.7)),
    }]
    return buildShape(n, parts, 71)
}

// ---------- shaders ----------

const pointVertex = /* glsl */ `
    attribute float aSize;
    attribute float aPhase;
    uniform float uSize;
    uniform float uPixelRatio;
    uniform float uTime;
    varying vec3 vColor;
    varying float vTwinkle;
    void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTwinkle = 0.7 + 0.3 * sin(uTime * 1.7 + aPhase * 6.2831);
        gl_PointSize = aSize * uSize * uPixelRatio / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`

const pointFragment = /* glsl */ `
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vTwinkle;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float alpha = pow(core, 1.6) * uOpacity * vTwinkle;
        gl_FragColor = vec4(vColor * (0.65 + core * 0.6), alpha);
    }
`

function pointsMaterial(size: number, pixelRatio: number) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uSize: { value: size },
            uPixelRatio: { value: pixelRatio },
            uTime: { value: 0 },
            uOpacity: { value: 1 },
        },
        vertexShader: pointVertex,
        fragmentShader: pointFragment,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
}

// ---------- the solid chrome dumbbell for the hero ----------

function plateGeometry(R: number, width: number) {
    const bevel = 0.045
    const hole = 0.14
    const profile = [
        new THREE.Vector2(hole, -width / 2),
        new THREE.Vector2(R - bevel, -width / 2),
        new THREE.Vector2(R, -width / 2 + bevel),
        new THREE.Vector2(R, width / 2 - bevel),
        new THREE.Vector2(R - bevel, width / 2),
        new THREE.Vector2(R * 0.62, width / 2),
        new THREE.Vector2(R * 0.6, width / 2 - 0.035), // recessed centre on the face
        new THREE.Vector2(hole + 0.05, width / 2 - 0.035),
        new THREE.Vector2(hole, width / 2),
        new THREE.Vector2(hole, -width / 2),
    ]
    const geometry = new THREE.LatheGeometry(profile, 96)
    geometry.rotateZ(Math.PI / 2) // lathe spins around y; the bar runs along x
    return geometry
}

function solidDumbbell() {
    const group = new THREE.Group()
    const chrome = new THREE.MeshPhysicalMaterial({ color: 0xa9a9b1, metalness: 1, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.15 })
    const steel = new THREE.MeshPhysicalMaterial({ color: 0x3a3a40, metalness: 1, roughness: 0.32 })
    const plate = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, metalness: 0.45, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: new THREE.Color(0x550000) })
    const glow = new THREE.MeshBasicMaterial({ color: 0xff1a0a })
    const glowSoft = new THREE.MeshBasicMaterial({ color: 0xb00000 })

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(HANDLE.r, HANDLE.r, HANDLE.half * 2, 48), chrome)
    handle.rotation.z = Math.PI / 2
    group.add(handle)

    // knurling: fine rings along the grip
    const ringGeo = new THREE.TorusGeometry(HANDLE.r + 0.004, 0.006, 6, 40)
    for (let x = -0.62; x <= 0.62; x += 0.05) {
        if (Math.abs(x) < 0.12) continue
        const ring = new THREE.Mesh(ringGeo, steel)
        ring.rotation.y = Math.PI / 2
        ring.position.x = x
        group.add(ring)
    }

    for (const sign of [-1, 1]) {
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(COLLAR.r, COLLAR.r, COLLAR.to - COLLAR.from, 48), steel)
        collar.rotation.z = Math.PI / 2
        collar.position.x = sign * (COLLAR.from + COLLAR.to) / 2
        group.add(collar)

        PLATES.forEach(([x0, x1, R], i) => {
            const mesh = new THREE.Mesh(plateGeometry(R, x1 - x0), plate)
            mesh.position.x = sign * (x0 + x1) / 2
            if (sign < 0) mesh.rotation.y = Math.PI
            group.add(mesh)

            // glowing red edge on the outside face of every plate, and a ring on the outermost
            const edge = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.011, 8, 160), glow)
            edge.rotation.y = Math.PI / 2
            edge.position.x = sign * (x1 + 0.002)
            group.add(edge)
            if (i === PLATES.length - 1 || i === 0) {
                const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.6, 0.008, 8, 120), glowSoft)
                inner.rotation.y = Math.PI / 2
                inner.position.x = sign * (x1 - 0.03)
                group.add(inner)
            }
        })

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 48), chrome)
        cap.rotation.z = Math.PI / 2
        cap.position.x = sign * 1.86
        group.add(cap)
    }
    return group
}

// ---------- the scene ----------

export function createHomeScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }): HomeScene {
    const width = () => canvas.clientWidth || window.innerWidth
    const height = () => canvas.clientHeight || window.innerHeight
    const small = window.innerWidth < 768
    const pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: "high-performance" })
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width(), height(), false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#050303")

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture
    scene.environmentIntensity = 0.42

    const camera = new THREE.PerspectiveCamera(35, width() / height(), 0.1, 60)
    camera.position.set(0, 0, 7.6)

    // lights for the solid dumbbell (particles are self-lit)
    scene.add(new THREE.AmbientLight(0xffffff, 0.12))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(3, 4, 5)
    scene.add(key)
    const rim = new THREE.PointLight(0xff1a00, 26, 22)
    rim.position.set(-3.5, 1.2, -2.5)
    scene.add(rim)
    const under = new THREE.PointLight(0xc80000, 22, 14)
    under.position.set(2.5, -3, 1.5)
    scene.add(under)

    const rig = new THREE.Group()
    scene.add(rig)

    const solid = solidDumbbell()
    solid.scale.setScalar(1.12)
    rig.add(solid)
    const solidMaterials = new Set<THREE.Material>()
    solid.traverse((o) => {
        if (o instanceof THREE.Mesh) {
            solidMaterials.add(o.material as THREE.Material)
        }
    })

    // ---- morphing particles ----
    const N = small ? 6500 : 12000
    const dumbbell = dumbbellShape(N)
    for (let i = 0; i < dumbbell.pos.length; i++) dumbbell.pos[i] *= 1.12 // match the solid's scale
    const shapes = [dumbbell, barsShape(N), donutShape(N), helixShape(N), globeShape(N), logoShape(N), fieldShape(N), dumbbell]

    const r = mulberry32(97)
    const delays = new Float32Array(N)
    const swirl = new Float32Array(N * 3)
    const sizes = new Float32Array(N)
    const phases = new Float32Array(N)
    for (let i = 0; i < N; i++) {
        delays[i] = r()
        const dir = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.6 + r() * 1.6)
        swirl.set([dir.x, dir.y, dir.z], i * 3)
        sizes[i] = r() < 0.03 ? 2.6 + r() * 1.4 : 0.7 + r() * 0.9
        phases[i] = r()
    }

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(dumbbell.pos)
    const colors = new Float32Array(dumbbell.col)
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1))
    const material = pointsMaterial(small ? 30 : 26, pixelRatio)
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    rig.add(points)

    // ---- slow ambient dust ----
    const DUST = small ? 300 : 700
    const dustPos = new Float32Array(DUST * 3)
    const dustCol = new Float32Array(DUST * 3)
    const dustSize = new Float32Array(DUST)
    const dustPhase = new Float32Array(DUST)
    const dustSpeed = new Float32Array(DUST)
    const dc = new THREE.Color()
    for (let i = 0; i < DUST; i++) {
        dustPos.set([lerp(-9, 9, r()), lerp(-6, 6, r()), lerp(-9, 2, r())], i * 3)
        mix(dc, C.graphite, r() < 0.3 ? C.crimson : C.pearl, r() * 0.6)
        dustCol.set([dc.r, dc.g, dc.b], i * 3)
        dustSize[i] = 0.5 + r() * 0.9
        dustPhase[i] = r()
        dustSpeed[i] = 0.05 + r() * 0.12
    }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage))
    dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustCol, 3))
    dustGeometry.setAttribute("aSize", new THREE.BufferAttribute(dustSize, 1))
    dustGeometry.setAttribute("aPhase", new THREE.BufferAttribute(dustPhase, 1))
    const dustMaterial = pointsMaterial(22, pixelRatio)
    dustMaterial.uniforms.uOpacity.value = 0.55
    const dust = new THREE.Points(dustGeometry, dustMaterial)
    dust.frustumCulled = false
    scene.add(dust)

    // ---- bloom (desktop) ----
    let composer: EffectComposer | null = null
    let bloom: UnrealBloomPass | null = null
    if (!small) {
        composer = new EffectComposer(renderer)
        composer.setPixelRatio(pixelRatio)
        composer.addPass(new RenderPass(scene, camera))
        bloom = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.62, 0.5, 0.32)
        composer.addPass(bloom)
        composer.addPass(new OutputPass())
    }

    // ---- state ----
    let target = 0, timeline = 0
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
    let lastMorph = -1
    let running = true
    let frame = 0
    let lastFrame = performance.now()
    let elapsed = 0

    function morph(p: number, time: number) {
        const k = Math.min(Math.floor(p), shapes.length - 2)
        const f = p - k
        // hold each shape for a while before and after the transition
        const hold = clamp01((f - 0.18) / 0.62)
        const key = Math.round(hold * 400) + k * 1000
        const breathing = !options.reducedMotion
        if (key === lastMorph && !breathing) return
        lastMorph = key
        const a = shapes[k], b = shapes[k + 1]
        const swirlScale = k === 5 ? 2.4 : 1 // the logo bursts outward into the starfield
        for (let i = 0; i < N; i++) {
            const local = clamp01((hold - delays[i] * 0.4) / 0.6)
            const e = easeInOutCubic(local)
            const s = Math.sin(e * Math.PI) * swirlScale
            const wobble = breathing ? Math.sin(time * 1.3 + phases[i] * 6.28) * 0.012 : 0
            for (let c = 0; c < 3; c++) {
                const j = i * 3 + c
                positions[j] = a.pos[j] + (b.pos[j] - a.pos[j]) * e + swirl[j] * s + wobble
                colors[j] = a.col[j] + (b.col[j] - a.col[j]) * e
            }
        }
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.color.needsUpdate = true
    }

    function resize() {
        const w = width(), h = height()
        renderer.setSize(w, h, false)
        composer?.setSize(w, h)
        bloom?.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", resize)

    function render() {
        if (!running) return
        frame = requestAnimationFrame(render)
        const now = performance.now()
        const dt = Math.min((now - lastFrame) / 1000, 0.05)
        lastFrame = now
        elapsed += dt
        const time = elapsed

        timeline += (target - timeline) * (options.reducedMotion ? 1 : Math.min(1, dt * 4.5))
        pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3)
        pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3)
        const T = timeline
        const wide = camera.aspect > 1.05

        // hero: the chrome dumbbell turns with the scroll, then gives way to its particle twin
        const solidOpacity = 1 - smooth(0.45, 0.95, T)
        solid.visible = solidOpacity > 0.001
        // only transparent while fading: an opaque dumbbell sorts and reflects properly
        solidMaterials.forEach((m) => { m.opacity = solidOpacity; m.transparent = solidOpacity < 0.999 })
        material.uniforms.uOpacity.value = lerp(0, 1, smooth(0.5, 0.95, T)) * (T > 6 && T < 7.6 ? lerp(1, 0.75, smooth(6, 6.6, T)) : 1)

        const spin = options.reducedMotion ? 0 : time * 0.22
        const heroWeight = 1 - smooth(1, 1.7, T)
        const ctaWeight = smooth(7.2, 8, T)
        const dumbbellPose = Math.max(heroWeight, ctaWeight)
        rig.rotation.x = lerp(0.12, 0.32, dumbbellPose) + pointer.sy * 0.18
        // gentle sways rather than a full spin, so the dumbbell is never seen end-on
        const storyY = Math.sin(spin * 0.8) * 0.5
        const heroY = -0.55 + Math.min(T, 1) * 0.9 + Math.sin(spin * 1.4) * 0.22
        const ctaY = -0.35 + Math.sin(spin * 1.4) * 0.3
        rig.rotation.y = lerp(lerp(storyY, heroY, heroWeight), ctaY, ctaWeight) + pointer.sx * 0.3
        rig.rotation.z = lerp(0, -0.2, dumbbellPose)

        // move the shapes beside the story text on wide screens, above it on narrow ones
        const inStory = smooth(0.8, 1.5, T) * (1 - smooth(6, 6.7, T))
        rig.position.x = wide ? lerp(0, 1.85, inStory) : 0
        // in the hero and final call to action the dumbbell floats above the big headline
        rig.position.y = (wide ? 0.62 : 0.8) * dumbbellPose + 0.38 * ctaWeight + (wide ? 0 : 1.0 * inStory)
        // on narrow screens, shrink everything to fit the width (the dumbbell is ~4 units wide)
        const fit = wide ? 1 : Math.min(1, camera.aspect * 1.08)
        const scale = (wide ? lerp(1, 0.9, inStory) : lerp(1, 0.98, inStory)) * fit
        rig.scale.setScalar(scale * (1 + (heroWeight * smooth(0, 1, T)) * 0.06) * (1 - 0.14 * ctaWeight))

        morph(Math.max(0, Math.min(shapes.length - 1, T - 1)), time)

        // starfield drifts while it's the backdrop
        points.rotation.y = smooth(6, 7, T) * (1 - ctaWeight) * time * 0.02

        // dust rises slowly
        const dp = dustGeometry.attributes.position.array as Float32Array
        if (!options.reducedMotion) {
            for (let i = 0; i < DUST; i++) {
                dp[i * 3 + 1] += dustSpeed[i] * dt
                if (dp[i * 3 + 1] > 6) dp[i * 3 + 1] = -6
            }
            dustGeometry.attributes.position.needsUpdate = true
        }

        material.uniforms.uTime.value = time
        dustMaterial.uniforms.uTime.value = time
        rim.position.x = -3.5 + Math.sin(time * 0.4) * 1.2

        camera.position.x = pointer.sx * 0.35
        camera.position.y = pointer.sy * 0.22
        camera.lookAt(0, 0, 0)

        if (composer) composer.render()
        else renderer.render(scene, camera)
    }

    const onVisibility = () => {
        if (document.hidden) {
            running = false
            cancelAnimationFrame(frame)
        } else if (!running) {
            running = true
            lastFrame = performance.now()
            render()
        }
    }
    document.addEventListener("visibilitychange", onVisibility)
    render()

    return {
        setTimeline: (t) => { target = t },
        setPointer: (x, y) => { pointer.x = x; pointer.y = y },
        dispose: () => {
            running = false
            cancelAnimationFrame(frame)
            window.removeEventListener("resize", resize)
            document.removeEventListener("visibilitychange", onVisibility)
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
                    o.geometry.dispose()
                    const m = o.material as THREE.Material | THREE.Material[]
                    if (Array.isArray(m)) m.forEach((x) => x.dispose())
                    else m.dispose()
                }
            })
            envTexture.dispose()
            pmrem.dispose()
            composer?.dispose()
            renderer.dispose()
        },
    }
}
