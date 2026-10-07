"use client";

import Link from "next/link";
import { CSSProperties, MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import styles from "./homepage.module.css";
import type { HomeScene } from "./scene";

// The public landing page at /homepage. A fixed three.js canvas (scene.ts) sits behind everything and is
// driven by scroll: the page works out one timeline value from where the visitor is and hands it over.

const STORY = [
    {
        kicker: "Train",
        title: <>Every rep,<br />on the record.</>,
        body: "Build your split from 57 exercises, each with an animated form guide and the muscles it works. Log sets in seconds and the app remembers what you did last time.",
        chips: ["Split templates", "Animated form", "Last-time memory"],
        widget: "train",
    },
    {
        kicker: "Overload",
        title: <>Watch strength<br />compound.</>,
        body: "Estimated one-rep max, top sets and weekly volume for every lift, week over week. When you hit the top of your rep range, it tells you to add weight.",
        chips: ["Est. 1RM", "Weekly volume", "PR detection"],
        widget: "overload",
    },
    {
        kicker: "Fuel",
        title: <>Eat like you<br />mean it.</>,
        body: "Calories, protein, carbs and fats set from your body and your goal, plus 22 micronutrients and water. One daily score tells you how the day went.",
        chips: ["Macros", "22 micronutrients", "Daily score"],
        widget: "fuel",
    },
    {
        kicker: "Science",
        title: <>Backed by the<br />literature.</>,
        body: "Search peer-reviewed research from PubMed right inside the app, and bookmark the studies worth coming back to. Train on evidence, not hype.",
        chips: ["PubMed search", "Bookmarks", "Peer-reviewed"],
        widget: "science",
    },
    {
        kicker: "Community",
        title: <>Progress is louder<br />together.</>,
        body: "Follow lifters, share the journey and keep progress photos private until you decide otherwise. Your profile, your rules.",
        chips: ["Follow", "Progress photos", "Privacy blur"],
        widget: "community",
    },
    {
        kicker: "ProgressX",
        title: <>This is<br /><span className={styles.redText}>ProgressX.</span></>,
        body: "Training, nutrition, research and community in one place, designed around a single idea: you should be able to see yourself getting better.",
        chips: [],
        widget: "cta",
    },
] as const

const MARQUEE = ["Progressive overload", "Macros", "Micronutrients", "Personal records", "Research", "Progress photos", "Splits", "Water", "Est. 1RM", "Daily score"]

function clamp01(v: number) {
    return Math.min(1, Math.max(0, v))
}

export default function Homepage() {
    const rootRef = useRef<HTMLDivElement>(null)
    const scrollerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const heroRef = useRef<HTMLElement>(null)
    const storyRef = useRef<HTMLElement>(null)
    const afterStoryRef = useRef<HTMLElement>(null)
    const previewRef = useRef<HTMLElement>(null)
    const ctaRef = useRef<HTMLElement>(null)
    const sceneRef = useRef<HomeScene | null>(null)
    const [stage, setStage] = useState(0)
    const [webgl, setWebgl] = useState(true)
    const [scrolled, setScrolled] = useState(false)

    // ---- the 3D scene (loaded after first paint so the page shows instantly) ----
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const probe = document.createElement("canvas")
        if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) {
            setWebgl(false)
            return
        }
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        let cancelled = false
        import("./scene").then(({ createHomeScene }) => {
            if (cancelled) return
            try {
                sceneRef.current = createHomeScene(canvas, { reducedMotion })
                rootRef.current?.classList.add(styles.sceneReady)
                update()
            } catch (err) {
                console.error("Couldn't start the 3D scene: ", err)
                setWebgl(false)
            }
        })
        return () => {
            cancelled = true
            sceneRef.current?.dispose()
            sceneRef.current = null
        }
    }, [])

    // ---- scroll → timeline, story stage and CSS variables ----
    function update() {
        const scroller = scrollerRef.current, root = rootRef.current
        const hero = heroRef.current, story = storyRef.current, after = afterStoryRef.current, cta = ctaRef.current
        if (!scroller || !root || !hero || !story || !after || !cta) return
        const y = scroller.scrollTop
        const vh = scroller.clientHeight

        const heroProgress = clamp01(y / (hero.offsetHeight * 0.85))
        const storyEnd = story.offsetTop + story.offsetHeight - vh
        const storyProgress = clamp01((y - story.offsetTop) / (story.offsetHeight - vh)) * (STORY.length - 1)
        const burst = clamp01((y - storyEnd) / (vh * 0.9))
        const gather = clamp01((y - (cta.offsetTop - vh)) / (vh * 0.85))

        let timeline = heroProgress
        if (y >= story.offsetTop) timeline = 1 + storyProgress
        if (burst > 0) timeline = 6 + burst
        if (gather > 0) timeline = 7 + gather
        sceneRef.current?.setTimeline(timeline)

        setStage(Math.min(STORY.length - 1, Math.floor(storyProgress + 0.5)))
        setScrolled(y > 24)
        root.style.setProperty("--page", String(clamp01(y / (scroller.scrollHeight - vh))))
        root.style.setProperty("--hero", heroProgress.toFixed(4))
        root.style.setProperty("--story", (storyProgress / (STORY.length - 1)).toFixed(4))

        const preview = previewRef.current
        if (preview) {
            const rect = preview.getBoundingClientRect()
            root.style.setProperty("--preview", clamp01(1 - (rect.top - vh * 0.15) / (vh * 0.85)).toFixed(4))
        }
    }

    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) return
        let ticking = false
        const onScroll = () => {
            if (ticking) return
            ticking = true
            requestAnimationFrame(() => {
                ticking = false
                update()
            })
        }
        scroller.addEventListener("scroll", onScroll, { passive: true })
        window.addEventListener("resize", onScroll)
        update()
        return () => {
            scroller.removeEventListener("scroll", onScroll)
            window.removeEventListener("resize", onScroll)
        }
    }, [])

    // ---- reveal-on-scroll ----
    useEffect(() => {
        const root = rootRef.current
        if (!root) return
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    entry.target.classList.add(styles.revealed)
                    observer.unobserve(entry.target)
                }
            }
        }, { root: scrollerRef.current, threshold: 0.18 })
        root.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el))
        return () => observer.disconnect()
    }, [])

    // ---- pointer: parallax for the scene, spotlight for the page ----
    function onPointerMove(e: MouseEvent<HTMLDivElement>) {
        const x = (e.clientX / window.innerWidth) * 2 - 1
        const y = -((e.clientY / window.innerHeight) * 2 - 1)
        sceneRef.current?.setPointer(x, y)
        rootRef.current?.style.setProperty("--mx", `${e.clientX}px`)
        rootRef.current?.style.setProperty("--my", `${e.clientY}px`)
    }

    function scrollToId(id: string) {
        const el = document.getElementById(id)
        const scroller = scrollerRef.current
        if (el && scroller) scroller.scrollTo({ top: el.offsetTop - (id === "story" ? 0 : 40), behavior: "smooth" })
    }

    return (
        <div ref={rootRef} className={`${styles.root} ${webgl ? "" : styles.noWebgl}`} onMouseMove={onPointerMove}>
            <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
            <div className={styles.vignette} aria-hidden="true" />
            <div className={styles.spotlight} aria-hidden="true" />
            <div className={styles.grain} aria-hidden="true" />
            <div className={styles.progressBar} aria-hidden="true" />

            <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
                <a href="#top" className={styles.logo} onClick={(e) => { e.preventDefault(); scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" }) }}>
                    <span>Progress</span><span className={styles.logoX}>X</span>
                </a>
                <nav className={styles.navLinks} aria-label="Sections">
                    <button type="button" onClick={() => scrollToId("story")}>Product</button>
                    <button type="button" onClick={() => scrollToId("features")}>Features</button>
                    <button type="button" onClick={() => scrollToId("app")}>The app</button>
                    <button type="button" onClick={() => scrollToId("privacy")}>Privacy</button>
                </nav>
                <div className={styles.navActions}>
                    <Link href="/login" className={styles.navGhost}>Log in</Link>
                    <Link href="/login" className={styles.navCta}>Open app <Arrow /></Link>
                </div>
            </header>

            <div ref={scrollerRef} className={styles.scroller}>
                {/* ---------- Hero ---------- */}
                <section ref={heroRef} id="top" className={styles.hero}>
                    <div className={styles.heroMeta}>
                        <span className={styles.dot} /> Built in Canada · 2026
                    </div>
                    <div className={styles.heroSide} aria-hidden="true">Strength · Nutrition · Science · Community</div>

                    <div className={styles.hud} aria-hidden="true">
                        <span className={`${styles.hudTag} ${styles.hudA}`}><b>Est. 1RM</b> 225 lb <em>+12.5</em></span>
                        <span className={`${styles.hudTag} ${styles.hudB}`}><b>Volume</b> 18.4k lb <em>+8%</em></span>
                        <span className={`${styles.hudTag} ${styles.hudD}`}><b>Daily score</b> 92%</span>
                    </div>

                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}>The fitness app that shows its work</p>
                        <h1 className={styles.heroTitle} aria-label="Built for progress.">
                            <SplitWord text="BUILT" delay={0} />
                            <SplitWord text="FOR" delay={5} />
                            <SplitWord text="PROGRESS." delay={8} accent />
                        </h1>
                        <div className={styles.heroBottom}>
                            <p className={styles.heroLead}>
                                Log every set, every meal and every rep, then watch the numbers climb.
                                ProgressX turns your training into proof.
                            </p>
                            <div className={styles.heroButtons}>
                                <Magnetic><Link href="/login" className={styles.primaryButton}>Start for free <Arrow /></Link></Magnetic>
                                <Link href="/login" className={styles.secondaryButton}>Open the app</Link>
                            </div>
                        </div>
                    </div>

                    <button type="button" className={styles.scrollCue} onClick={() => scrollToId("story")}>
                        <span>Scroll</span><i />
                    </button>
                </section>

                <div className={styles.marquee} aria-hidden="true">
                    {[0, 1].map((row) => (
                        <div key={row} className={`${styles.marqueeTrack} ${row ? styles.marqueeReverse : ""}`}>
                            {[...MARQUEE, ...MARQUEE].map((word, i) => (
                                <span key={i} className={i % 2 ? styles.marqueeOutline : ""}>{word}<i>✦</i></span>
                            ))}
                        </div>
                    ))}
                </div>

                {/* ---------- Scroll story: the particles morph behind these panels ---------- */}
                <section ref={storyRef} id="story" className={styles.story} style={{ height: `${(STORY.length - 1) * 95 + 100}svh` } as CSSProperties}>
                    <div className={styles.storySticky}>
                        <ol className={styles.rail} aria-label="Chapters">
                            {STORY.map((chapter, i) => (
                                <li key={chapter.kicker} className={i === stage ? styles.railActive : i < stage ? styles.railDone : ""}>
                                    <span>{String(i + 1).padStart(2, "0")}</span>
                                    <em>{chapter.kicker}</em>
                                </li>
                            ))}
                            <i className={styles.railFill} />
                        </ol>

                        <div className={styles.panels}>
                            {STORY.map((chapter, i) => (
                                <article key={chapter.kicker} className={`${styles.panel} ${i === stage ? styles.panelActive : i < stage ? styles.panelPast : ""}`} aria-hidden={i !== stage}>
                                    <p className={styles.panelKicker}><span>{String(i + 1).padStart(2, "0")}</span>{chapter.kicker}</p>
                                    <h2 className={styles.panelTitle}>{chapter.title}</h2>
                                    <p className={styles.panelBody}>{chapter.body}</p>
                                    {chapter.chips.length ?
                                        <div className={styles.chips}>{chapter.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
                                    : null}
                                    <StoryWidget kind={chapter.widget} active={i === stage} />
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ---------- Numbers ---------- */}
                <section ref={afterStoryRef} className={styles.stats}>
                    {[
                        { value: 57, label: "Exercises with animated form guides" },
                        { value: 7, label: "Muscle groups tracked week over week" },
                        { value: 22, label: "Micronutrients in your daily score" },
                        { value: 6, label: "Proven split templates to start from" },
                    ].map((stat, i) => (
                        <div key={stat.label} className={styles.stat} data-reveal style={{ "--d": `${i * 90}ms` } as CSSProperties}>
                            <Counter to={stat.value} />
                            <p>{stat.label}</p>
                        </div>
                    ))}
                </section>

                {/* ---------- Bento ---------- */}
                <section id="features" className={styles.section}>
                    <div className={styles.sectionHead} data-reveal>
                        <p className={styles.eyebrow}>Everything in one place</p>
                        <h2 className={styles.sectionTitle}>Small details.<br /><span className={styles.redText}>Serious results.</span></h2>
                    </div>
                    <div className={styles.bento}>
                        <TiltCard className={styles.cardWide} title="Progress photos, private by default" text="Side-by-side check-ins with a privacy blur until you tap to reveal. Every upload is checked, re-encoded and stripped of location data.">
                            <div className={styles.photos}>
                                <div className={styles.photo}><span>Week 1</span></div>
                                <div className={`${styles.photo} ${styles.photoAfter}`}><span>Week 12</span></div>
                            </div>
                        </TiltCard>
                        <TiltCard title="One score for the whole day" text="Calories, macros, water and micros rolled into a single number.">
                            <ScoreRing value={92} />
                        </TiltCard>
                        <TiltCard title="Hydration that adds up" text="Quick-add water against a recommended goal, or set your own.">
                            <div className={styles.glass}><div className={styles.water} /><span>2.4 / 3.2 L</span></div>
                        </TiltCard>
                        <TiltCard className={styles.cardWide} title="See exactly what you trained" text="A weekly heatmap of working sets per muscle group shows what's getting attention and what's being skipped.">
                            <Heat />
                        </TiltCard>
                        <TiltCard title="Start from a proven split" text="Push / Pull / Legs, Upper / Lower, Full Body, Glute Focus and more.">
                            <div className={styles.splitList}>
                                {["Push", "Pull", "Legs", "Upper", "Lower", "Glutes"].map((day, i) => <span key={day} style={{ "--i": i } as CSSProperties}>{day}</span>)}
                            </div>
                        </TiltCard>
                        <TiltCard title="Research worth keeping" text="Bookmark the studies that matter and find them again in seconds.">
                            <div className={styles.papers}>
                                {["Protein timing and hypertrophy", "Training volume dose-response", "Sleep and strength recovery"].map((title, i) => (
                                    <span key={title} style={{ "--i": i } as CSSProperties}><em>PubMed</em>{title}</span>
                                ))}
                            </div>
                        </TiltCard>
                        <TiltCard title="Every PR, celebrated" text="Beat your best estimated one-rep max and the set gets a PR badge on the spot.">
                            <div className={styles.prBadge}><b>PR</b><span>Squat<br /><strong>275 × 5</strong></span></div>
                        </TiltCard>
                    </div>
                </section>

                {/* ---------- App preview ---------- */}
                <section id="app" ref={previewRef} className={styles.preview}>
                    <div className={styles.sectionHead} data-reveal>
                        <p className={styles.eyebrow}>The app</p>
                        <h2 className={styles.sectionTitle}>Your numbers,<br /><span className={styles.redText}>beautifully clear.</span></h2>
                    </div>
                    <div className={styles.deviceStage}>
                        <div className={styles.device}>
                            <div className={styles.deviceBar}><i /><i /><i /><span>progressx.ca/mystats</span></div>
                            <div className={styles.deviceBody}>
                                <aside className={styles.deviceNav}>
                                    <b>Progress<span className={styles.logoX}>X</span></b>
                                    {["For You", "Research", "Following", "MyStats", "MyDiet", "Profile"].map((item) => (
                                        <span key={item} className={item === "MyStats" ? styles.deviceNavActive : ""}>{item}</span>
                                    ))}
                                </aside>
                                <div className={styles.deviceMain}>
                                    <p className={styles.deviceTitle}>Bench Press</p>
                                    <div className={styles.deviceTiles}>
                                        <div><em>Best est. 1RM</em><b>225 lb</b><small>+12.5 lb vs last week</small></div>
                                        <div><em>Top set</em><b>195 lb</b><small>× 6 reps</small></div>
                                        <div><em>Volume</em><b>14.2k lb</b><small>9 sets</small></div>
                                    </div>
                                    <div className={styles.deviceChart}>
                                        <svg viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
                                            <defs>
                                                <linearGradient id="hpArea" x1="0" x2="0" y1="0" y2="1">
                                                    <stop offset="0%" stopColor="#ff2a14" stopOpacity="0.45" />
                                                    <stop offset="100%" stopColor="#ff2a14" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            {[35, 70, 105].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} className={styles.gridLine} />)}
                                            <path d="M0 118 C40 112 60 104 90 100 S150 86 180 80 S240 70 270 56 S330 40 400 22 L400 140 L0 140 Z" fill="url(#hpArea)" />
                                            <path className={styles.chartLine} d="M0 118 C40 112 60 104 90 100 S150 86 180 80 S240 70 270 56 S330 40 400 22" />
                                            <path className={styles.chartLineMuted} d="M0 126 C50 122 80 116 120 112 S200 100 240 94 S320 80 400 66" />
                                        </svg>
                                        <i className={styles.chartDot} />
                                    </div>
                                    <Heat compact />
                                </div>
                            </div>
                        </div>
                        <div className={`${styles.floatCard} ${styles.floatOne}`}><b>PR</b> Bench 195 × 6</div>
                        <div className={`${styles.floatCard} ${styles.floatTwo}`}>Add a rep: aim for <b>195 × 7</b></div>
                    </div>
                </section>

                {/* ---------- Privacy ---------- */}
                <section id="privacy" className={styles.section}>
                    <div className={styles.privacy}>
                        <div data-reveal>
                            <p className={styles.eyebrow}>Privacy</p>
                            <h2 className={styles.sectionTitle}>Your data<br /><span className={styles.redText}>stays yours.</span></h2>
                            <p className={styles.privacyLead}>Health data deserves better than fine print. ProgressX follows Canada&apos;s privacy law (PIPEDA), and you stay in control from day one.</p>
                        </div>
                        <ul className={styles.privacyList}>
                            {[
                                ["Encrypted", "In transit and at rest, with sessions that sign you out after inactivity."],
                                ["Exportable", "Download everything you've logged as a file, any time."],
                                ["Deletable", "Delete your account and every photo with it, in one step."],
                                ["Never sold", "No ads, no data brokers. Your progress isn't the product."],
                            ].map(([title, text], i) => (
                                <li key={title} data-reveal style={{ "--d": `${i * 90}ms` } as CSSProperties}>
                                    <span className={styles.privacyIndex}>{String(i + 1).padStart(2, "0")}</span>
                                    <div><b>{title}</b><p>{text}</p></div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* ---------- Final call to action: the particles gather into a dumbbell again ---------- */}
                <section ref={ctaRef} className={styles.cta}>
                    <div className={styles.ctaInner} data-reveal>
                        <p className={styles.eyebrow}>Ready when you are</p>
                        <h2 className={styles.ctaTitle}>Your next PR<br /><span className={styles.redText}>starts today.</span></h2>
                        <div className={styles.heroButtons}>
                            <Magnetic><Link href="/login" className={styles.primaryButton}>Create your account <Arrow /></Link></Magnetic>
                            <Link href="/login" className={styles.secondaryButton}>Open the app</Link>
                        </div>
                        <p className={styles.ctaNote}>Free to use. 18+. Not available in Quebec.</p>
                    </div>
                </section>

                <footer className={styles.footer}>
                    <div className={styles.footerBrand}>
                        <span className={styles.logo}><span>Progress</span><span className={styles.logoX}>X</span></span>
                        <p>Fitness, measured.</p>
                    </div>
                    <nav className={styles.footerLinks} aria-label="Footer">
                        <Link href="/login">Open the app</Link>
                        <Link href="/login">Log in</Link>
                        <Link href="/terms">Terms</Link>
                        <Link href="/privacy">Privacy</Link>
                    </nav>
                    <p className={styles.footerSmall}>© 2026 ProgressX. Built in Canada.</p>
                </footer>
            </div>
        </div>
    )
}

// ---------- small pieces ----------

function Arrow() {
    return (
        <svg className={styles.arrow} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function SplitWord({ text, delay, accent }: { text: string, delay: number, accent?: boolean }) {
    return (
        <span className={`${styles.word} ${accent ? styles.wordAccent : ""}`} aria-hidden="true">
            {text.split("").map((letter, i) => (
                <span key={i} className={styles.letter} style={{ "--i": delay + i } as CSSProperties}>{letter}</span>
            ))}
        </span>
    )
}

function Magnetic({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLSpanElement>(null)
    return (
        <span
            ref={ref}
            className={styles.magnetic}
            onMouseMove={(e) => {
                const el = ref.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                el.style.setProperty("--tx", `${(e.clientX - rect.left - rect.width / 2) * 0.25}px`)
                el.style.setProperty("--ty", `${(e.clientY - rect.top - rect.height / 2) * 0.35}px`)
            }}
            onMouseLeave={() => {
                ref.current?.style.setProperty("--tx", "0px")
                ref.current?.style.setProperty("--ty", "0px")
            }}
        >
            {children}
        </span>
    )
}

function TiltCard({ title, text, children, className }: { title: string, text: string, children: ReactNode, className?: string }) {
    const ref = useRef<HTMLDivElement>(null)
    return (
        <div
            ref={ref}
            data-reveal
            className={`${styles.card} ${className ?? ""}`}
            onMouseMove={(e) => {
                const el = ref.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height
                el.style.setProperty("--px", `${px * 100}%`)
                el.style.setProperty("--py", `${py * 100}%`)
                el.style.setProperty("--rx", `${(0.5 - py) * 7}deg`)
                el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`)
            }}
            onMouseLeave={() => {
                ref.current?.style.setProperty("--rx", "0deg")
                ref.current?.style.setProperty("--ry", "0deg")
            }}
        >
            <div className={styles.cardVisual}>{children}</div>
            <h3 className={styles.cardTitle}>{title}</h3>
            <p className={styles.cardText}>{text}</p>
        </div>
    )
}

function Counter({ to }: { to: number }) {
    const ref = useRef<HTMLSpanElement>(null)
    const [value, setValue] = useState(0)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setValue(to)
            return
        }
        let frame = 0
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return
            observer.disconnect()
            const start = performance.now()
            const tick = (now: number) => {
                const t = Math.min(1, (now - start) / 1400)
                setValue(Math.round(to * (1 - Math.pow(1 - t, 4))))
                if (t < 1) frame = requestAnimationFrame(tick)
            }
            frame = requestAnimationFrame(tick)
        }, { threshold: 0.5 })
        observer.observe(el)
        return () => {
            observer.disconnect()
            cancelAnimationFrame(frame)
        }
    }, [to])
    return <span ref={ref} className={styles.statValue}>{value}</span>
}

function ScoreRing({ value }: { value: number }) {
    const r = 46, c = 2 * Math.PI * r
    return (
        <div className={styles.ring}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r={r} className={styles.ringTrack} />
                <circle cx="60" cy="60" r={r} className={styles.ringValue} style={{ "--c": c, "--v": c * (1 - value / 100) } as CSSProperties} />
            </svg>
            <span><b>{value}</b>%</span>
        </div>
    )
}

// Deterministic "weekly sets" heatmap used on the cards and the device mockup
const HEAT_ROWS = ["Chest", "Back", "Shoulders", "Arms", "Core", "Glutes", "Legs"]
function Heat({ compact }: { compact?: boolean }) {
    const weeks = compact ? 10 : 12
    return (
        <div className={`${styles.heat} ${compact ? styles.heatCompact : ""}`} aria-hidden="true">
            {HEAT_ROWS.map((row, r) => (
                <div key={row} className={styles.heatRow}>
                    <span>{row}</span>
                    {Array.from({ length: weeks }, (_, w) => {
                        const v = (Math.sin(r * 2.1 + w * 0.9) + 1) / 2 * 0.6 + (w / weeks) * 0.4
                        const level = r === 4 && w % 3 === 0 ? 0 : Math.min(5, Math.max(1, Math.round(v * 5)))
                        return <i key={w} className={styles[`h${level}`]} style={{ "--i": r * weeks + w } as CSSProperties} />
                    })}
                </div>
            ))}
        </div>
    )
}

function StoryWidget({ kind, active }: { kind: string, active: boolean }) {
    const cls = `${styles.widget} ${active ? styles.widgetActive : ""}`
    switch (kind) {
        case "train":
            return (
                <div className={cls}>
                    <div className={styles.widgetHead}><b>Bench Press</b><span>3 / 3 sets · 6–10 reps</span></div>
                    {[["1", "185 lb × 8"], ["2", "185 lb × 8"], ["3", "190 lb × 7"]].map(([n, set]) => (
                        <div key={n} className={styles.setRow}><span>{n}</span><b>{set}</b><em>e1RM 234 lb</em></div>
                    ))}
                </div>
            )
        case "overload":
            return (
                <div className={cls}>
                    <div className={styles.widgetStat}><em>Best est. 1RM this week</em><b>225 lb</b><span className={styles.up}>+12.5 lb vs last week</span></div>
                    <p className={styles.widgetHint}>You hit 10+ reps on every set last time. Try 195 lb today.</p>
                </div>
            )
        case "fuel":
            return (
                <div className={cls}>
                    {[["Protein", 92, styles.barRed], ["Carbs", 78, styles.barWhite], ["Fats", 85, styles.barDeep]].map(([label, pct, tone]) => (
                        <div key={label as string} className={styles.macro}>
                            <span>{label}</span>
                            <i><b className={tone as string} style={{ "--w": `${pct}%` } as CSSProperties} /></i>
                            <em>{pct}%</em>
                        </div>
                    ))}
                </div>
            )
        case "science":
            return (
                <div className={cls}>
                    <div className={styles.search}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>creatine and strength</div>
                    <div className={styles.paper}><em>PubMed · Meta-analysis</em><b>Creatine supplementation and resistance training outcomes</b></div>
                </div>
            )
        case "community":
            return (
                <div className={cls}>
                    <div className={styles.avatars}>
                        {["A", "M", "J", "S", "K"].map((a, i) => <span key={a} style={{ "--i": i } as CSSProperties}>{a}</span>)}
                        <em>+ your crew</em>
                    </div>
                    <div className={styles.blurPhoto}><span>Tap to reveal</span></div>
                </div>
            )
        default:
            return (
                <div className={`${cls} ${styles.widgetCta}`}>
                    <Link href="/login" className={styles.primaryButton}>Start for free <Arrow /></Link>
                    <Link href="/login" className={styles.secondaryButton}>Open the app</Link>
                </div>
            )
    }
}
