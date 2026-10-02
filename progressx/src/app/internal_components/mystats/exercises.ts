// The exercise library. Plain data (no React) so the API routes can validate exercise ids too.
// Each exercise's `motion` names its animation in exerciseMotions.ts.

export type Muscle =
    | "chest" | "front-delts" | "side-delts" | "rear-delts"
    | "biceps" | "triceps" | "forearms"
    | "abs" | "obliques"
    | "traps" | "upper-back" | "lats" | "lower-back"
    | "glutes" | "quads" | "hamstrings" | "calves"

export const MUSCLE_LABELS: Record<Muscle, string> = {
    "chest": "Chest",
    "front-delts": "Front delts",
    "side-delts": "Side delts",
    "rear-delts": "Rear delts",
    "biceps": "Biceps",
    "triceps": "Triceps",
    "forearms": "Forearms",
    "abs": "Abs",
    "obliques": "Obliques",
    "traps": "Traps",
    "upper-back": "Upper back",
    "lats": "Lats",
    "lower-back": "Lower back",
    "glutes": "Glutes",
    "quads": "Quads",
    "hamstrings": "Hamstrings",
    "calves": "Calves",
}

export type MuscleGroup = "Chest" | "Back" | "Shoulders" | "Arms" | "Core" | "Glutes" | "Legs"

export const MUSCLE_GROUPS: Record<MuscleGroup, Muscle[]> = {
    Chest: ["chest"],
    Back: ["lats", "upper-back", "traps", "lower-back"],
    Shoulders: ["front-delts", "side-delts", "rear-delts"],
    Arms: ["biceps", "triceps", "forearms"],
    Core: ["abs", "obliques"],
    Glutes: ["glutes"],
    Legs: ["quads", "hamstrings", "calves"],
}

export type Equipment = "Barbell" | "Dumbbell" | "Cable" | "Machine" | "Bodyweight"

export type Exercise = {
    id: string,
    name: string,
    equipment: Equipment,
    primary: Muscle[],
    secondary: Muscle[],
    motion: string,
    cues: string[],
    bodyweight?: boolean, // weight logged is added load (0 = just bodyweight)
}

export const EXERCISES: Exercise[] = [
    // ---------- Chest ----------
    {
        id: "barbell-bench-press", name: "Flat Barbell Bench Press", equipment: "Barbell", motion: "bench-press",
        primary: ["chest"], secondary: ["front-delts", "triceps"],
        cues: ["Shoulder blades pinched and down", "Lower the bar to mid-chest", "Drive your feet into the floor"],
    },
    {
        id: "incline-dumbbell-press", name: "Incline Dumbbell Press", equipment: "Dumbbell", motion: "incline-press",
        primary: ["chest", "front-delts"], secondary: ["triceps"],
        cues: ["Bench at 30-45°", "Elbows about 45° from your sides", "Press up and slightly in"],
    },
    {
        id: "dumbbell-fly", name: "Dumbbell Fly", equipment: "Dumbbell", motion: "fly",
        primary: ["chest"], secondary: ["front-delts"],
        cues: ["Soft bend in the elbows", "Open wide until you feel a stretch", "Hug a big tree on the way up"],
    },
    {
        id: "cable-crossover", name: "Cable Crossover", equipment: "Cable", motion: "cable-crossover",
        primary: ["chest"], secondary: ["front-delts"],
        cues: ["Slight forward lean", "Sweep the handles down and together", "Squeeze for a second at the bottom"],
    },
    {
        id: "machine-chest-press", name: "Machine Chest Press", equipment: "Machine", motion: "machine-chest-press",
        primary: ["chest"], secondary: ["front-delts", "triceps"],
        cues: ["Handles at mid-chest height", "Shoulder blades back against the pad", "Press out without locking your elbows hard"],
    },
    {
        id: "pec-deck", name: "Pec Deck", equipment: "Machine", motion: "pec-deck",
        primary: ["chest"], secondary: ["front-delts"],
        cues: ["Elbows at chest height, bent about 90°", "Squeeze the pads together in front of you", "Open slowly until you feel a stretch"],
    },
    {
        id: "push-up", name: "Push-Up", equipment: "Bodyweight", motion: "push-up", bodyweight: true,
        primary: ["chest"], secondary: ["front-delts", "triceps", "abs"],
        cues: ["Body in one straight line", "Chest to just above the floor", "Hands under your shoulders"],
    },
    {
        id: "chest-dip", name: "Dip", equipment: "Bodyweight", motion: "dip", bodyweight: true,
        primary: ["chest", "triceps"], secondary: ["front-delts"],
        cues: ["Lean slightly forward for more chest", "Lower until upper arms are parallel", "Lock out without shrugging"],
    },

    // ---------- Back ----------
    {
        id: "pull-up", name: "Pull-Up", equipment: "Bodyweight", motion: "pull-up", bodyweight: true,
        primary: ["lats"], secondary: ["biceps", "upper-back", "forearms"],
        cues: ["Start from a dead hang", "Pull your elbows down to your ribs", "Chin clears the bar"],
    },
    {
        id: "lat-pulldown", name: "Lat Pulldown", equipment: "Cable", motion: "lat-pulldown",
        primary: ["lats"], secondary: ["biceps", "upper-back"],
        cues: ["Slight lean back", "Pull the bar to your upper chest", "Control it back up"],
    },
    {
        id: "barbell-row", name: "Barbell Row", equipment: "Barbell", motion: "bent-over-row",
        primary: ["lats", "upper-back"], secondary: ["rear-delts", "biceps", "lower-back"],
        cues: ["Hinge to about 45°", "Pull the bar to your lower ribs", "Keep your back flat"],
    },
    {
        id: "dumbbell-row", name: "One-Arm Dumbbell Row", equipment: "Dumbbell", motion: "dumbbell-row",
        primary: ["lats", "upper-back"], secondary: ["rear-delts", "biceps"],
        cues: ["Brace on a bench", "Row the dumbbell to your hip", "Don't twist your torso"],
    },
    {
        id: "seated-cable-row", name: "Seated Cable Row", equipment: "Cable", motion: "seated-row",
        primary: ["upper-back", "lats"], secondary: ["biceps", "rear-delts"],
        cues: ["Sit tall", "Pull the handle to your stomach", "Squeeze your shoulder blades together"],
    },
    {
        id: "neutral-grip-row", name: "Neutral-Grip Row", equipment: "Cable", motion: "seated-row",
        primary: ["upper-back", "lats"], secondary: ["biceps", "rear-delts", "forearms"],
        cues: ["Palms facing each other (V-handle or neutral handles)", "Pull to your lower ribs, elbows close to your sides", "Chest up, don't rock back"],
    },
    {
        id: "deadlift", name: "Deadlift", equipment: "Barbell", motion: "deadlift",
        primary: ["hamstrings", "glutes", "lower-back"], secondary: ["traps", "quads", "forearms", "lats"],
        cues: ["Bar over mid-foot", "Push the floor away", "Lock out with your hips, not your back"],
    },
    {
        id: "face-pull", name: "Face Pull", equipment: "Cable", motion: "face-pull",
        primary: ["rear-delts"], secondary: ["upper-back", "traps"],
        cues: ["Rope at face height", "Pull toward your forehead", "Finish with hands beside your ears"],
    },
    {
        id: "barbell-shrug", name: "Barbell Shrug", equipment: "Barbell", motion: "shrug",
        primary: ["traps"], secondary: ["forearms"],
        cues: ["Arms stay straight", "Shoulders straight up to your ears", "Pause at the top"],
    },

    // ---------- Shoulders ----------
    {
        id: "overhead-press", name: "Overhead Press", equipment: "Barbell", motion: "overhead-press",
        primary: ["front-delts"], secondary: ["side-delts", "triceps", "traps"],
        cues: ["Squeeze your glutes", "Press straight up past your face", "Head through at the top"],
    },
    {
        id: "dumbbell-shoulder-press", name: "Seated Dumbbell Press", equipment: "Dumbbell", motion: "seated-shoulder-press",
        primary: ["front-delts", "side-delts"], secondary: ["triceps"],
        cues: ["Back against the pad", "Dumbbells start at ear height", "Press until arms are straight"],
    },
    {
        id: "lateral-raise", name: "Dumbbell Lateral Raise", equipment: "Dumbbell", motion: "lateral-raise",
        primary: ["side-delts"], secondary: ["traps"],
        cues: ["Lead with your elbows", "Raise to shoulder height", "Lower slowly"],
    },
    {
        id: "rear-delt-fly", name: "Rear Delt Fly", equipment: "Dumbbell", motion: "rear-delt-fly",
        primary: ["rear-delts"], secondary: ["upper-back"],
        cues: ["Hinge forward, flat back", "Open your arms out to the sides", "Thumbs slightly down"],
    },
    {
        id: "reverse-pec-deck", name: "Reverse Pec Deck", equipment: "Machine", motion: "reverse-pec-deck",
        primary: ["rear-delts"], secondary: ["upper-back", "traps"],
        cues: ["Chest against the pad, handles at shoulder height", "Sweep your arms back and out in a wide arc", "Don't shrug; lead with the back of your arms"],
    },
    {
        id: "machine-shoulder-press", name: "Machine Shoulder Press", equipment: "Machine", motion: "machine-shoulder-press",
        primary: ["front-delts", "side-delts"], secondary: ["triceps"],
        cues: ["Handles start around ear height", "Back flat against the pad", "Press up until your arms are nearly straight"],
    },
    {
        id: "machine-lateral-raise", name: "Machine Lateral Raise", equipment: "Machine", motion: "machine-lateral-raise",
        primary: ["side-delts"], secondary: ["traps"],
        cues: ["Pivot lines up with your shoulders", "Push out and up with your elbows", "Stop at shoulder height and lower slowly"],
    },

    // ---------- Arms ----------
    {
        id: "barbell-curl", name: "Barbell Curl", equipment: "Barbell", motion: "curl",
        primary: ["biceps"], secondary: ["forearms"],
        cues: ["Elbows pinned to your sides", "Curl all the way up", "No swinging"],
    },
    {
        id: "dumbbell-curl", name: "Dumbbell Curl", equipment: "Dumbbell", motion: "dumbbell-curl",
        primary: ["biceps"], secondary: ["forearms"],
        cues: ["Palms up the whole way", "Squeeze at the top", "Lower under control"],
    },
    {
        id: "hammer-curl", name: "Hammer Curl", equipment: "Dumbbell", motion: "dumbbell-curl",
        primary: ["biceps", "forearms"], secondary: [],
        cues: ["Thumbs up, palms facing in", "Elbows stay still", "Full range of motion"],
    },
    {
        id: "cable-curl", name: "Cable Curl", equipment: "Cable", motion: "cable-curl",
        primary: ["biceps"], secondary: ["forearms"],
        cues: ["Low pulley, straight bar or handle", "Elbows stay at your sides", "Keep tension at the bottom, don't let the stack touch"],
    },
    {
        id: "machine-strict-curl", name: "Machine Strict Curl", equipment: "Machine", motion: "machine-curl",
        primary: ["biceps"], secondary: ["forearms"],
        cues: ["Upper arms flat on the pad", "Curl all the way up and squeeze", "Lower slowly to a full stretch"],
    },
    {
        id: "machine-hammer-curl", name: "Machine Hammer Curl", equipment: "Machine", motion: "machine-curl",
        primary: ["biceps", "forearms"], secondary: [],
        cues: ["Neutral handles, thumbs up", "Upper arms stay on the pad", "Control the lowering"],
    },
    {
        id: "triceps-pushdown", name: "Rope Triceps Pushdown", equipment: "Cable", motion: "pushdown",
        primary: ["triceps"], secondary: [],
        cues: ["Elbows tucked at your sides", "Push down and pull the rope apart at the bottom", "Only your forearms move"],
    },
    {
        id: "skull-crusher", name: "Skull Crusher", equipment: "Barbell", motion: "skull-crusher",
        primary: ["triceps"], secondary: [],
        cues: ["Upper arms stay still", "Lower the bar toward your forehead", "Extend fully"],
    },
    {
        id: "overhead-triceps-extension", name: "Overhead Triceps Extension", equipment: "Dumbbell", motion: "overhead-extension",
        primary: ["triceps"], secondary: [],
        cues: ["Elbows point forward", "Lower behind your head", "Extend to straight arms"],
    },

    // ---------- Legs ----------
    {
        id: "back-squat", name: "Back Squat", equipment: "Barbell", motion: "squat",
        primary: ["quads", "glutes"], secondary: ["hamstrings", "lower-back", "abs"],
        cues: ["Brace before you descend", "Knees track over your toes", "Hips to at least knee height"],
    },
    {
        id: "goblet-squat", name: "Goblet Squat", equipment: "Dumbbell", motion: "goblet-squat",
        primary: ["quads", "glutes"], secondary: ["abs"],
        cues: ["Hold the dumbbell at your chest", "Sit between your heels", "Chest stays up"],
    },
    {
        id: "leg-press", name: "Leg Press", equipment: "Machine", motion: "leg-press",
        primary: ["quads", "glutes"], secondary: ["hamstrings"],
        cues: ["Feet shoulder-width on the platform", "Lower until knees are near 90°", "Don't lock your knees"],
    },
    {
        id: "hack-squat", name: "Hack Squat", equipment: "Machine", motion: "hack-squat",
        primary: ["quads", "glutes"], secondary: ["hamstrings"],
        cues: ["Back and shoulders flat against the pads", "Feet shoulder-width, mid-platform", "Lower until your thighs are at least parallel"],
    },
    {
        id: "romanian-deadlift", name: "Romanian Deadlift", equipment: "Barbell", motion: "romanian-deadlift",
        primary: ["hamstrings", "glutes"], secondary: ["lower-back", "forearms"],
        cues: ["Soft knees", "Push your hips back", "Bar slides down your thighs"],
    },
    {
        id: "walking-lunge", name: "Walking Lunge", equipment: "Dumbbell", motion: "lunge",
        primary: ["quads", "glutes"], secondary: ["hamstrings", "calves"],
        cues: ["Long step forward", "Back knee just above the floor", "Torso upright"],
    },
    {
        id: "bulgarian-split-squat", name: "Bulgarian Split Squat", equipment: "Dumbbell", motion: "split-squat",
        primary: ["quads", "glutes"], secondary: ["hamstrings"],
        cues: ["Back foot up on a bench", "Drop straight down", "Front knee over your toes"],
    },
    {
        id: "leg-extension", name: "Leg Extension", equipment: "Machine", motion: "leg-extension",
        primary: ["quads"], secondary: [],
        cues: ["Knee lines up with the pivot", "Extend fully and squeeze", "Lower slowly"],
    },
    {
        id: "leg-curl", name: "Lying Hamstring Curl", equipment: "Machine", motion: "leg-curl",
        primary: ["hamstrings"], secondary: ["calves"],
        cues: ["Hips pressed into the pad", "Curl your heels to your glutes", "Control the way down"],
    },
    {
        id: "seated-leg-curl", name: "Seated Hamstring Curl", equipment: "Machine", motion: "seated-leg-curl",
        primary: ["hamstrings"], secondary: ["calves"],
        cues: ["Knees line up with the machine's pivot", "Thigh pad snug so your hips stay down", "Curl your heels under the seat, then control the return"],
    },
    {
        id: "hip-thrust", name: "Hip Thrust", equipment: "Barbell", motion: "hip-thrust",
        primary: ["glutes"], secondary: ["hamstrings"],
        cues: ["Upper back on the bench", "Drive through your heels", "Chin tucked, ribs down at the top"],
    },
    {
        id: "calf-raise", name: "Standing Calf Raise", equipment: "Machine", motion: "calf-raise",
        primary: ["calves"], secondary: [],
        cues: ["Full stretch at the bottom", "Rise all the way onto your toes", "Pause at the top"],
    },

    // ---------- Glutes ----------
    {
        id: "good-morning", name: "Good Morning", equipment: "Barbell", motion: "good-morning",
        primary: ["hamstrings", "glutes"], secondary: ["lower-back"],
        cues: ["Bar on your upper back, soft knees", "Push your hips straight back", "Stop when your torso is near parallel"],
    },
    {
        id: "glute-bridge", name: "Glute Bridge", equipment: "Bodyweight", motion: "glute-bridge", bodyweight: true,
        primary: ["glutes"], secondary: ["hamstrings"],
        cues: ["Feet flat, close to your hips", "Drive through your heels", "Squeeze your glutes hard at the top"],
    },
    {
        id: "cable-kickback", name: "Cable Glute Kickback", equipment: "Cable", motion: "cable-kickback",
        primary: ["glutes"], secondary: ["hamstrings"],
        cues: ["Strap on the ankle, hold the frame", "Kick back and up, not out to the side", "Don't arch your lower back"],
    },
    {
        id: "hip-abduction", name: "Hip Abduction", equipment: "Machine", motion: "hip-abduction",
        primary: ["glutes"], secondary: [],
        cues: ["Sit tall against the pad", "Push your knees out", "Control the return"],
    },
    {
        id: "sumo-deadlift", name: "Sumo Deadlift", equipment: "Barbell", motion: "sumo-deadlift",
        primary: ["glutes", "quads"], secondary: ["hamstrings", "lower-back", "traps", "forearms"],
        cues: ["Wide stance, toes turned out", "Grip inside your knees", "Push your knees out and stand up tall"],
    },
    {
        id: "step-up", name: "Dumbbell Step-Up", equipment: "Dumbbell", motion: "step-up",
        primary: ["glutes", "quads"], secondary: ["hamstrings", "calves"],
        cues: ["Whole foot on the box", "Drive through the top leg's heel", "Don't push off the bottom foot"],
    },
    {
        id: "back-extension", name: "45° Back Extension", equipment: "Bodyweight", motion: "back-extension", bodyweight: true,
        primary: ["glutes", "lower-back"], secondary: ["hamstrings"],
        cues: ["Pad just below your hips", "Round down, then squeeze your glutes to rise", "Stop in a straight line, don't hyperextend"],
    },
    {
        id: "donkey-kick", name: "Donkey Kick", equipment: "Bodyweight", motion: "donkey-kick", bodyweight: true,
        primary: ["glutes"], secondary: ["hamstrings"],
        cues: ["Hands under shoulders, knees under hips", "Keep the knee bent at 90°", "Press your heel toward the ceiling"],
    },

    // ---------- Core ----------
    {
        id: "plank", name: "Plank", equipment: "Bodyweight", motion: "plank", bodyweight: true,
        primary: ["abs"], secondary: ["obliques", "front-delts"],
        cues: ["Elbows under shoulders", "Squeeze glutes and brace", "Log reps as seconds held"],
    },
    {
        id: "crunch", name: "Crunch", equipment: "Bodyweight", motion: "crunch", bodyweight: true,
        primary: ["abs"], secondary: ["obliques"],
        cues: ["Lower back stays down", "Curl your ribs toward your hips", "Exhale at the top"],
    },
    {
        id: "hanging-leg-raise", name: "Hanging Leg Raise", equipment: "Bodyweight", motion: "hanging-leg-raise", bodyweight: true,
        primary: ["abs"], secondary: ["obliques", "forearms"],
        cues: ["Hang still, no swinging", "Raise your legs to hip height or higher", "Lower under control"],
    },
    {
        id: "cable-crunch", name: "Weighted Cable Ab Crunch", equipment: "Cable", motion: "cable-crunch",
        primary: ["abs"], secondary: ["obliques"],
        cues: ["Kneel facing the stack", "Crunch your elbows toward your knees", "Hips stay still"],
    },
]

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((exercise) => [exercise.id, exercise]))

export function isExerciseId(id: unknown): id is string {
    return typeof id === "string" && id in EXERCISE_BY_ID
}

export function exerciseInGroup(exercise: Exercise, group: MuscleGroup): boolean {
    const muscles = MUSCLE_GROUPS[group]
    return exercise.primary.some((muscle) => muscles.includes(muscle))
}

// ---------- Units ----------

export type WeightUnit = "lb" | "kg"
export const LB_PER_KG = 2.20462262

export function toKg(value: number, unit: WeightUnit): number {
    return unit === "kg" ? value : value / LB_PER_KG
}

export function fromKg(kg: number, unit: WeightUnit): number {
    const value = unit === "kg" ? kg : kg * LB_PER_KG
    return Math.round(value * 10) / 10
}

export function formatWeight(kg: number, unit: WeightUnit): string {
    return `${fromKg(kg, unit).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
}

// Epley estimate of the one-rep max from a set
export function estimatedOneRepMax(weightKg: number, reps: number): number {
    if (weightKg <= 0 || reps <= 0) return 0
    return reps === 1 ? weightKg : weightKg * (1 + reps / 30)
}

// ---------- Split templates ----------

export type SplitDayExercise = { exerciseId: string, sets: number, reps: string }
export type SplitDay = { name: string, exercises: SplitDayExercise[] }

const ex = (exerciseId: string, sets = 3, reps = "8-12"): SplitDayExercise => ({ exerciseId, sets, reps })

export const SPLIT_TEMPLATES: { name: string, description: string, days: SplitDay[] }[] = [
    {
        name: "Push / Pull / Legs",
        description: "3 days, run once or twice a week",
        days: [
            { name: "Push", exercises: [ex("barbell-bench-press", 4, "5-8"), ex("overhead-press", 3, "6-10"), ex("incline-dumbbell-press"), ex("lateral-raise", 3, "12-15"), ex("triceps-pushdown", 3, "10-15")] },
            { name: "Pull", exercises: [ex("deadlift", 3, "3-5"), ex("pull-up", 3, "6-10"), ex("barbell-row"), ex("face-pull", 3, "12-15"), ex("barbell-curl", 3, "10-12")] },
            { name: "Legs", exercises: [ex("back-squat", 4, "5-8"), ex("romanian-deadlift"), ex("leg-press", 3, "10-12"), ex("leg-curl", 3, "10-12"), ex("calf-raise", 4, "12-15")] },
        ],
    },
    {
        name: "Upper / Lower",
        description: "4 days a week",
        days: [
            { name: "Upper A", exercises: [ex("barbell-bench-press", 4, "5-8"), ex("barbell-row", 4, "6-10"), ex("overhead-press"), ex("lat-pulldown"), ex("barbell-curl"), ex("triceps-pushdown")] },
            { name: "Lower A", exercises: [ex("back-squat", 4, "5-8"), ex("romanian-deadlift"), ex("leg-extension"), ex("calf-raise", 4, "12-15"), ex("hanging-leg-raise", 3, "10-15")] },
            { name: "Upper B", exercises: [ex("incline-dumbbell-press"), ex("pull-up"), ex("dumbbell-shoulder-press"), ex("seated-cable-row"), ex("hammer-curl"), ex("skull-crusher")] },
            { name: "Lower B", exercises: [ex("deadlift", 3, "3-5"), ex("bulgarian-split-squat"), ex("leg-curl"), ex("hip-thrust"), ex("plank", 3, "30-60")] },
        ],
    },
    {
        name: "Full Body",
        description: "3 days a week, rest days between",
        days: [
            { name: "Full Body A", exercises: [ex("back-squat", 3, "5-8"), ex("barbell-bench-press", 3, "5-8"), ex("barbell-row"), ex("lateral-raise", 3, "12-15"), ex("plank", 3, "30-60")] },
            { name: "Full Body B", exercises: [ex("deadlift", 3, "3-5"), ex("overhead-press"), ex("pull-up"), ex("walking-lunge"), ex("dumbbell-curl")] },
        ],
    },
    {
        name: "Push / Pull / Legs (Machines)",
        description: "3 days, mostly machines and cables",
        days: [
            { name: "Push", exercises: [ex("barbell-bench-press", 3, "6-10"), ex("machine-chest-press", 3, "8-12"), ex("pec-deck", 3, "12-15"), ex("machine-shoulder-press", 3, "8-12"), ex("machine-lateral-raise", 3, "12-15"), ex("lateral-raise", 2, "15-20"), ex("triceps-pushdown", 3, "10-15")] },
            { name: "Pull", exercises: [ex("lat-pulldown", 3, "8-12"), ex("neutral-grip-row", 3, "8-12"), ex("reverse-pec-deck", 3, "12-15"), ex("face-pull", 3, "12-15"), ex("machine-strict-curl", 3, "10-12"), ex("machine-hammer-curl", 2, "10-12"), ex("cable-curl", 2, "12-15"), ex("cable-crunch", 3, "10-15")] },
            { name: "Legs", exercises: [ex("hack-squat", 3, "8-12"), ex("leg-press", 3, "10-12"), ex("leg-extension", 3, "12-15"), ex("seated-leg-curl", 3, "10-12"), ex("leg-curl", 2, "10-12")] },
        ],
    },
    {
        name: "Glute Focus",
        description: "2 glute days, add to any split",
        days: [
            { name: "Glutes A", exercises: [ex("hip-thrust", 4, "8-12"), ex("bulgarian-split-squat", 3, "8-12"), ex("romanian-deadlift", 3, "8-10"), ex("cable-kickback", 3, "12-15"), ex("hip-abduction", 3, "15-20")] },
            { name: "Glutes B", exercises: [ex("sumo-deadlift", 3, "5-8"), ex("good-morning", 3, "8-10"), ex("step-up", 3, "10-12"), ex("back-extension", 3, "12-15"), ex("glute-bridge", 3, "15-20")] },
        ],
    },
    {
        name: "Bro Split",
        description: "5 days, one muscle group each",
        days: [
            { name: "Chest", exercises: [ex("barbell-bench-press", 4, "6-10"), ex("incline-dumbbell-press"), ex("dumbbell-fly"), ex("cable-crossover"), ex("chest-dip")] },
            { name: "Back", exercises: [ex("deadlift", 3, "3-5"), ex("pull-up"), ex("barbell-row"), ex("seated-cable-row"), ex("barbell-shrug")] },
            { name: "Shoulders", exercises: [ex("overhead-press", 4, "6-10"), ex("lateral-raise", 4, "12-15"), ex("rear-delt-fly", 3, "12-15"), ex("face-pull")] },
            { name: "Arms", exercises: [ex("barbell-curl"), ex("skull-crusher"), ex("hammer-curl"), ex("triceps-pushdown"), ex("overhead-triceps-extension")] },
            { name: "Legs", exercises: [ex("back-squat", 4, "5-8"), ex("leg-press"), ex("romanian-deadlift"), ex("leg-extension"), ex("leg-curl"), ex("calf-raise", 4, "12-15")] },
        ],
    },
]

export const MAX_SPLIT_DAYS = 14
export const MAX_DAY_EXERCISES = 20
