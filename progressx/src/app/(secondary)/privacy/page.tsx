import type { Metadata } from "next"
import LegalPage from "@/app/internal_components/legal/LegalPage"
import styles from "@/app/internal_components/legal/legal.module.css"
import { LEGAL_CONTACT_EMAIL, LEGAL_MINIMUM_AGE } from "@/app/internal_components/legal/legalInfo"

export const metadata: Metadata = {
    title: "Privacy Policy | ProgressX",
    description: "How ProgressX collects, uses and protects your information.",
}

export default function PrivacyPolicyPage() {
    return (
        <LegalPage title="Privacy Policy" otherPage={{ href: "/terms", label: "Terms of Service" }}>
            <p>
                This Privacy Policy explains how ProgressX (&quot;ProgressX&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses, shares and
                protects your personal information when you use the ProgressX website and services at progressx.ca (the &quot;Service&quot;).
                By using the Service you agree to the practices described here. If you do not agree, please do not use the Service.
            </p>

            <h2><span>01</span>Who can use ProgressX</h2>
            <p className={styles.callout}>
                ProgressX is only for people who are {LEGAL_MINIMUM_AGE} years of age or older. We do not knowingly collect personal
                information from anyone under {LEGAL_MINIMUM_AGE}. If we learn that we have, we will delete the account and its data.
                If you believe someone under {LEGAL_MINIMUM_AGE} has an account, contact us at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
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
                <li>Your food log dates, calorie goals and nutrition display preferences</li>
            </ul>
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
                <li>To provide the features you use, such as your profile, progress photos, diet tracking, calorie targets and research search</li>
                <li>To calculate estimates such as calorie expenditure and targets from the details you give us</li>
                <li>To show your content to other users according to your privacy settings</li>
                <li>To keep the Service running, fix problems, and protect against fraud, abuse and security incidents</li>
                <li>To communicate with you about your account or changes to these policies</li>
                <li>To comply with legal obligations</li>
            </ul>
            <p>We do <strong>not</strong> sell your personal information, and we do not use it for third-party advertising.</p>

            <h2><span>04</span>Health and body information</h2>
            <p>
                Details like your weight, height, body photos and diet logs are sensitive. We use them only to provide the Service to you
                and, where you choose, to share content with other users. We do not share them with advertisers, insurers or employers.
            </p>

            <h2><span>05</span>How we share information</h2>
            <p>We share personal information only in these situations:</p>
            <ul>
                <li><strong>With other users, as you choose.</strong> Your username, profile picture and any content you post may be visible to other users depending on your profile privacy setting.</li>
                <li>
                    <strong>With service providers</strong> who help us run the Service and may only use your information to provide their services to us:
                    <ul>
                        <li>Supabase: authentication and database hosting</li>
                        <li>Cloudinary: storage and delivery of photos and videos</li>
                        <li>Google: sign-in, if you choose to use it</li>
                        <li>Cloudflare: network delivery and security</li>
                    </ul>
                </li>
                <li><strong>For legal reasons.</strong> If required by law, or to protect the rights, safety and property of our users, the public or ProgressX.</li>
                <li><strong>In a business transfer.</strong> If ProgressX is involved in a merger, acquisition or sale of assets, your information may be transferred as part of that transaction, subject to this policy.</li>
            </ul>

            <h2><span>06</span>Cookies and local storage</h2>
            <p>
                We use a single essential cookie, <strong>token</strong>, which keeps you signed in. It expires after one hour and cannot be read by
                scripts on the page. We also store a copy of your profile details in your browser&apos;s local storage so pages load quickly;
                clearing your browser data removes it. We do not use advertising or cross-site tracking cookies.
            </p>

            <h2><span>07</span>Where your information is stored</h2>
            <p>
                Our service providers may store and process your information in Canada, the United States or other countries. Information
                stored outside Canada is subject to the laws of that country and may be accessible to its authorities.
            </p>

            <h2><span>08</span>How long we keep it</h2>
            <p>
                We keep your information for as long as your account is active. If you delete your account, we delete or anonymize your
                personal information within a reasonable time, except where we must keep it to meet legal obligations, resolve disputes or
                enforce our agreements. Copies in backups are removed as those backups expire.
            </p>

            <h2><span>09</span>Your rights and choices</h2>
            <ul>
                <li><strong>Access and correction:</strong> you can view and edit most of your information in the app, or ask us for a copy of the personal information we hold about you.</li>
                <li><strong>Deletion:</strong> you can delete photos and videos in the app, and ask us to delete your account and associated data.</li>
                <li><strong>Privacy settings:</strong> you can change who can see your profile at any time.</li>
                <li><strong>Withdrawing consent:</strong> you can stop using the Service and ask us to delete your account at any time.</li>
            </ul>
            <p>
                To make a request, email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We may need to verify your identity
                first. If you are not satisfied with our response, you may contact the Office of the Privacy Commissioner of Canada.
            </p>

            <h2><span>10</span>Security</h2>
            <p>
                We use reasonable safeguards to protect your information, including encrypted connections, hashed passwords and access
                controls. No system is perfectly secure, so we cannot guarantee absolute security. If we become aware of a breach that
                creates a real risk of significant harm to you, we will notify you as required by law.
            </p>

            <h2><span>11</span>Changes to this policy</h2>
            <p>
                We may update this policy from time to time. If we make significant changes, we will update the date above and, where
                appropriate, notify you in the app or by email. Continuing to use the Service after changes take effect means you accept them.
            </p>

            <h2><span>12</span>Contact us</h2>
            <p>
                Questions or requests about your privacy? Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
        </LegalPage>
    )
}
