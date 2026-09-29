"use client";

import styles from "./consentChecks.module.css";
import { LEGAL_MINIMUM_AGE, TERMS_VERSION } from "./legalInfo";

export type ConsentState = { confirmedAge: boolean, acceptedTerms: boolean }

type ConsentChecksProps = {
    value: ConsentState,
    onChange: (next: ConsentState) => void,
}

// The two boxes needed to create or keep using an account: 18+ and agreeing to the terms + privacy policy
export default function ConsentChecks({ value, onChange }: ConsentChecksProps) {
    return (
        <div className={styles.checks}>
            <label className={styles.check}>
                <input
                    type="checkbox"
                    required
                    checked={value.confirmedAge}
                    onChange={(e) => onChange({ ...value, confirmedAge: e.target.checked })}
                />
                <span>I confirm I am {LEGAL_MINIMUM_AGE} years of age or older</span>
            </label>
            <label className={styles.check}>
                <input
                    type="checkbox"
                    required
                    checked={value.acceptedTerms}
                    onChange={(e) => onChange({ ...value, acceptedTerms: e.target.checked })}
                />
                <span>
                    I have read and agree to the{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, including how my health and fitness
                    information is collected and used
                </span>
            </label>
        </div>
    )
}

// What the consent API routes expect alongside the boxes
export function consentPayload(value: ConsentState) {
    return { ...value, termsVersion: TERMS_VERSION }
}
