"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./mystats.module.css";

const TABS = [
    { href: "/mystats", label: "Diet" },
    { href: "/mystats/workouts", label: "Workouts" },
    { href: "/mystats/weight", label: "Weight" },
]

export default function StatsNav() {
    const pathname = usePathname()

    return (
        <nav className={styles.tabs} aria-label="My Stats sections">
            {TABS.map((tab) => {
                const active = pathname === tab.href
                return (
                    <Link key={tab.href} href={tab.href} className={active ? styles.tabActive : undefined} aria-current={active ? "page" : undefined}>
                        {tab.label}
                    </Link>
                )
            })}
        </nav>
    )
}
