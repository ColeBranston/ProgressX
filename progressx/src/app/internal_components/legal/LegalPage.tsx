import Link from "next/link"
import { ReactNode } from "react"
import styles from "./legal.module.css"
import { LEGAL_LAST_UPDATED } from "./legalInfo"

type LegalPageProps = {
    title: string,
    otherPage: { href: string, label: string },
    children: ReactNode
}

export default function LegalPage({ title, otherPage, children }: LegalPageProps) {
    return (
        <div className={styles.pageScroll}>
            <div className={styles.page}>
                <div className={styles.topBar}>
                    <Link href="/login" className="mainLogo">
                        <span className="progress">Progress</span>
                        <span className="X">X</span>
                    </Link>
                    <Link href={otherPage.href} className={styles.otherPageLink}>{otherPage.label}</Link>
                </div>

                <article className={styles.document}>
                    <h1 className={styles.title}>{title}</h1>
                    <p className={styles.updated}>Last updated: {LEGAL_LAST_UPDATED}</p>
                    {children}
                </article>

                <footer className={styles.footer}>
                    <Link href="/privacy">Privacy Policy</Link>
                    <Link href="/terms">Terms of Service</Link>
                    <Link href="/login">Back to ProgressX</Link>
                </footer>
            </div>
        </div>
    )
}
