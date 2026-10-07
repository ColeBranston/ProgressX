import type { Metadata } from "next"
import LegalPage from "@/app/internal_components/legal/LegalPage"
import styles from "@/app/internal_components/legal/legal.module.css"
import { LEGAL_CONTACT_EMAIL, LEGAL_MINIMUM_AGE, PRIVACY_OFFICER_EMAIL, PRIVACY_OFFICER_NAME, PRIVACY_OFFICER_TITLE } from "@/app/internal_components/legal/legalInfo"

export const metadata: Metadata = {
    title: "Privacy Policy | ProgressX",
    description: "How ProgressX collects, uses and protects your information.",
    alternates: { canonical: "/privacy" },
}

export default function PrivacyPolicyPage() {
    return (
        <LegalPage title="Privacy Policy" otherPage={{ href: "/terms", label: "Terms of Service" }}>
            <p>
                This Privacy Policy explains how ProgressX (&quot;ProgressX&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses, shares and
                protects your personal information when you use the ProgressX website and services at progressx.ca (the &quot;Service&quot;).
                We ask for your express agreement to this policy when you create your account, and again whenever it changes in an
                important way; we keep a record of each agreement. If you do not agree, please do not use the Service.
            </p>

            <h2><span>01</span>Who can use ProgressX</h2>
            <p className={styles.callout}>
                ProgressX is only for people who are {LEGAL_MINIMUM_AGE} years of age or older. We do not knowingly collect personal
                information from anyone under {LEGAL_MINIMUM_AGE}. If we learn that we have, we will delete the account and its data.
                If you believe someone under {LEGAL_MINIMUM_AGE} has an account, contact us at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
            <p>
                ProgressX is not currently offered to residents of Quebec (see our <a href="/terms">Terms of Service</a>), and we do not
                knowingly collect personal information from them. If we learn that we have, we will delete the account and its data.
            </p>

            <h2><span>02</span>Information we collect</h2>
            <h3>Account information</h3>
            <ul>
                <li><strong>Email and password.</strong> If you sign up with email, we collect your email address and password. Passwords are handled by our authentication provider and stored in hashed form; we never see them in plain text.</li>
                <li><strong>Google sign-in.</strong> If you sign in with Google, we receive your name, email address and profile picture from Google. We do not receive your Google password.</li>
            </ul>
            <h3>Profile and fitness information you provide</h3>
            <ul>
                <li>Username, display name and bio</li>
                <li>Age, gender, height, weight and activity level</li>
                <li>Profile picture and your profile privacy setting</li>
                <li>Progress photos, videos and the descriptions you add to them</li>
            </ul>
            <h3>Diet and nutrition information</h3>
            <ul>
                <li>Foods you create or log, serving sizes, calories and macro- and micronutrient values</li>
                <li>Water you log and your daily water goal</li>
                <li>Your food log dates, calorie goals and nutrition display preferences</li>
            </ul>
            <h3>Workout information</h3>
            <ul>
                <li>Your workout splits, the exercises in them, and the sets you log (weight, repetitions and date)</li>
                <li>Your preferred weight unit</li>
            </ul>
            <h3>Consent records</h3>
            <p>
                When you agree to our Terms of Service and this policy and confirm you are {LEGAL_MINIMUM_AGE} or older, we record which
                version you agreed to, when, how (sign-up form, Google sign-in or a later update) and your browser type, as proof of consent.
            </p>
            <h3>Research searches</h3>
            <p>
                When you search the Research section, we process your search terms to return results.
                <strong> Your most recent search may be shown to other users as a &quot;recent search&quot;</strong>, so please don&apos;t
                include personal information in search terms.
            </p>
            <h3>Technical information</h3>
            <ul>
                <li>A login cookie that keeps you signed in (see Cookies below)</li>
                <li>Information your browser sends automatically, such as IP address, browser type and the pages you request, which may appear in server and network logs</li>
            </ul>

            <h2><span>03</span>How we use your information</h2>
            <ul>
                <li>To create and secure your account and sign you in</li>
                <li>To provide the features you use, such as your profile, progress photos, diet, water and workout tracking, your stats and research search</li>
                <li>To calculate estimates such as calorie expenditure and targets from the details you give us</li>
                <li>To show your content to other users according to your privacy settings</li>
                <li>To keep the Service running, fix problems, and protect against fraud, abuse and security incidents</li>
                <li>To communicate with you about your account or changes to these policies</li>
                <li>To comply with legal obligations</li>
            </ul>
            <p>We do <strong>not</strong> sell your personal information, and we do not use it for third-party advertising.</p>

            <h2><span>04</span>Health and body information</h2>
            <p>
                Details like your weight, height, body photos, diet logs and workout history are sensitive personal information. We collect
                them only with your express consent and use them only to provide the Service to you and, where you choose, to share content
                with other users. We do not share them with advertisers, insurers or employers, and we do not use them to make decisions
                about you. ProgressX is a personal fitness tool: it is not a health care provider and does not give medical advice.
            </p>
            <p>
                Photos you upload are checked and re-created from their image data before they are stored, which removes hidden content and
                metadata such as the location where a photo was taken.
            </p>

            <h2><span>05</span>How we share information</h2>
            <p>We share personal information only in these situations:</p>
            <ul>
                <li><strong>With other users, as you choose.</strong> Other signed-in users can see your username, name, profile picture, bio and follower, following and like counts. Videos you post are shown to other users (including in the For You feed) only while your profile is public; when it is private, only you can see them. The videos you like or favourite are visible only to you.</li>
                <li>
                    <strong>With service providers</strong> who help us run the Service and may only use your information to provide their services to us:
                    <ul>
                        <li>Supabase: authentication and database hosting</li>
                        <li>Cloudinary: storage and delivery of photos</li>
                        <li>Google: sign-in, if you choose to use it</li>
                        <li>Cloudflare: network delivery and security, and storage and streaming of videos you post</li>
                    </ul>
                </li>
                <li><strong>For legal reasons.</strong> If required by law, or to protect the rights, safety and property of our users, the public or ProgressX.</li>
                <li><strong>In a business transfer.</strong> If ProgressX is involved in a merger, acquisition or sale of assets, your information may be transferred as part of that transaction, subject to this policy.</li>
            </ul>

            <h2><span>06</span>Cookies and local storage</h2>
            <p>
                We use two essential cookies that keep you signed in: <strong>token</strong> (a short-lived sign-in token) and
                <strong> refresh_token</strong> (used to renew it). Both last at most 30 days, are only sent over secure connections in
                production, and cannot be read by scripts on the page. They are removed when you log out or delete your account. We also store a copy of your profile details in your browser&apos;s local storage so pages load quickly;
                clearing your browser data removes it. We do not use advertising or cross-site tracking cookies.
            </p>

            <h2><span>07</span>Where your information is stored</h2>
            <p>
                Our database (Supabase) is hosted in the United States, and our photo storage (Cloudinary) and other service providers may
                store and process your information in the United States or other countries. Information stored outside Canada is subject to
                the laws of that country and may be accessible to its courts, law enforcement and national security authorities. We require
                our service providers to protect it and to use it only to provide their services to us.
            </p>

            <h2><span>08</span>How long we keep it</h2>
            <p>
                We keep your information for as long as your account is active. When you delete your account, your profile, logs, consent
                records and all of your photos are deleted immediately from our systems. Copies in our providers&apos; backups are removed
                automatically as those backups expire, within 30 days. We may keep information longer only where the law requires it.
            </p>

            <h2><span>09</span>Your rights and choices</h2>
            <ul>
                <li><strong>Access and portability:</strong> download a copy of all the personal information we hold about you at any time from Settings &gt; Your data &gt; Download my data.</li>
                <li><strong>Correction:</strong> you can view and edit most of your information in the app, or ask us to correct it.</li>
                <li><strong>Deletion:</strong> delete individual photos in the app, or permanently delete your whole account and all of its data from Settings &gt; Your data &gt; Delete account.</li>
                <li><strong>Privacy settings:</strong> you can change who can see your profile and blur your progress photos at any time.</li>
                <li><strong>Withdrawing consent:</strong> you can withdraw your consent at any time by deleting your account. You can also contact us to withdraw consent to a particular use.</li>
            </ul>
            <p>
                For any other request, email our Privacy Officer at <a href={`mailto:${PRIVACY_OFFICER_EMAIL}`}>{PRIVACY_OFFICER_EMAIL}</a>. We may
                need to verify your identity first, and we respond within 30 days. If you are not satisfied with our response, you can
                complain to the <a href="https://www.priv.gc.ca" target="_blank" rel="noopener noreferrer">Office of the Privacy Commissioner of Canada</a>.
            </p>

            <h2><span>10</span>Security</h2>
            <p>
                We protect your information with safeguards suited to its sensitivity, including encrypted connections, hashed passwords,
                database access rules that keep each user&apos;s data separate, rate limits on sign-in and uploads, and checks on every
                uploaded file. No system is perfectly secure, so we cannot guarantee absolute security. If a breach of security safeguards
                creates a real risk of significant harm to you, we will notify you and report it to the Office of the Privacy
                Commissioner of Canada as soon as feasible, and we keep a record of every breach.
            </p>

            <h2><span>11</span>Changes to this policy</h2>
            <p>
                We may update this policy from time to time. If we make significant changes, we will update the date above and ask you to
                review and agree to the new version the next time you use ProgressX.
            </p>

            <h2><span>12</span>Contact us</h2>
            <p>
                {PRIVACY_OFFICER_NAME}, {PRIVACY_OFFICER_TITLE}, is accountable for how ProgressX handles personal information. Questions,
                requests or complaints about your privacy: <a href={`mailto:${PRIVACY_OFFICER_EMAIL}`}>{PRIVACY_OFFICER_EMAIL}</a>. For
                general support, email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
        </LegalPage>
    )
}
