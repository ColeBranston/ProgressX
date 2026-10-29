import Link from "next/link";
import styles from "./IdVerification.module.css";

// The API's answer when posting or interacting needs a verified ID (see api/libs/requireVerified)
export function needsVerification(message: string | null | undefined): boolean {
    return Boolean(message?.startsWith("Verify your ID"))
}

// An error message, followed by a "Verify now" link when it's because the ID isn't verified yet
export default function VerifyHint({ message }: { message: string }) {
    return (
        <>
            {message}
            {needsVerification(message) ? <> <Link href="/settings#verification" className={styles.verifyLink}>Verify now</Link></> : null}
        </>
    )
}
