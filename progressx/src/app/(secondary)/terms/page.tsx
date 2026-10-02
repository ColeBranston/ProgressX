import type { Metadata } from "next"
import Link from "next/link"
import LegalPage from "@/app/internal_components/legal/LegalPage"
import styles from "@/app/internal_components/legal/legal.module.css"
import { LEGAL_CONTACT_EMAIL, LEGAL_GOVERNING_LAW, LEGAL_MINIMUM_AGE } from "@/app/internal_components/legal/legalInfo"

export const metadata: Metadata = {
    title: "Terms of Service | ProgressX",
    description: "The terms that govern your use of ProgressX.",
}

export default function TermsOfServicePage() {
    return (
        <LegalPage title="Terms of Service" otherPage={{ href: "/privacy", label: "Privacy Policy" }}>
            <p>
                These Terms of Service (the &quot;Terms&quot;) are an agreement between you and ProgressX (&quot;ProgressX&quot;, &quot;we&quot;, &quot;us&quot;)
                and govern your use of the ProgressX website and services at progressx.ca (the &quot;Service&quot;). By creating an account or
                using the Service, you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not
                use the Service.
            </p>

            <h2><span>01</span>Eligibility</h2>
            <p className={styles.callout}>
                You must be at least {LEGAL_MINIMUM_AGE} years old to create an account or use ProgressX. By using the Service, you confirm
                that you are {LEGAL_MINIMUM_AGE} or older and able to form a binding contract. We may ask for confirmation of your age and
                will close any account we believe belongs to someone under {LEGAL_MINIMUM_AGE}.
            </p>
            <p className={styles.callout}>
                ProgressX is not currently available to residents of the Province of Quebec. By creating an account or using the Service,
                you confirm that you do not reside in Quebec. If you live in Quebec, or move there, you may not use the Service and should
                delete your account from Settings. We will close any account we believe belongs to a Quebec resident, along with its data.
            </p>

            <h2><span>02</span>Your account</h2>
            <ul>
                <li>Give accurate information when you sign up and keep it up to date.</li>
                <li>Keep your login details secure and don&apos;t share your account. You are responsible for activity on your account.</li>
                <li>One person per account. Don&apos;t create accounts for others or impersonate anyone.</li>
                <li>Tell us right away at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> if you think your account has been compromised.</li>
            </ul>

            <h2><span>03</span>Not medical advice</h2>
            <p className={styles.callout}>
                ProgressX is for general informational and tracking purposes only. It is not a substitute for professional medical,
                nutritional or fitness advice, diagnosis or treatment.
            </p>
            <ul>
                <li>Calorie targets, expenditure estimates and nutrition figures are estimates based on the information you provide and general formulas. They may not be right for you.</li>
                <li>Talk to a doctor or qualified professional before starting a new exercise program or diet, especially if you have a medical condition, are pregnant, or take medication.</li>
                <li>Stop exercising and seek medical help if you feel pain, dizziness or shortness of breath.</li>
                <li>You take part in any physical activity or diet at your own risk.</li>
            </ul>

            <h2><span>04</span>Research content</h2>
            <p>
                The Research section lets you search summaries and links to studies published by third parties, such as articles indexed
                in PubMed. We do not write, review or endorse these studies, and we do not guarantee that they are accurate, complete or
                current. Studies may be preliminary, disputed or not applicable to you. Always read research critically and consult a
                professional before acting on it. Rights in those works belong to their authors and publishers.
            </p>

            <h2><span>05</span>Your content</h2>
            <p>
                You keep ownership of the photos, videos, text and other content you post (&quot;Your Content&quot;). By posting it, you grant
                ProgressX a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, resize and display Your Content only as
                needed to operate and improve the Service, including showing it to other users according to your privacy settings. This
                licence ends when you delete Your Content or your account, except for copies kept in backups for a limited time or where
                others have already shared it as the Service allows.
            </p>
            <p>You are responsible for Your Content and confirm that you have the rights to post it, including the consent of anyone who appears in it.</p>

            <h2><span>06</span>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
                <li>Post nudity or sexually explicit content, or any content that depicts or involves a minor</li>
                <li>Harass, bully, threaten, shame or discriminate against anyone, including comments about other users&apos; bodies</li>
                <li>Promote self-harm, eating disorders, extreme or dangerous dieting, or the use of illegal or unprescribed performance-enhancing drugs</li>
                <li>Post content that is illegal, misleading, or infringes someone else&apos;s intellectual property or privacy</li>
                <li>Post other people&apos;s photos or personal information without their permission</li>
                <li>Impersonate another person, or misrepresent your identity or age</li>
                <li>Use the Service for spam, advertising or commercial solicitation without our permission</li>
                <li>Scrape, crawl or bulk-download data from the Service, or use automated tools to access it</li>
                <li>Try to access other accounts, probe or break our security, or interfere with or overload the Service</li>
                <li>Reverse engineer the Service, except where the law allows it</li>
            </ul>

            <h2><span>07</span>Moderation, suspension and termination</h2>
            <p>
                We may remove content or suspend or close accounts that we reasonably believe break these Terms, create risk for others,
                or expose us to legal liability. Where appropriate we will try to tell you why. You can stop using the Service and ask us to
                delete your account at any time. Sections that by their nature should survive termination, including Sections 3, 4, 9, 10,
                11 and 12, will continue to apply.
            </p>

            <h2><span>08</span>ProgressX&apos;s rights</h2>
            <p>
                The Service, including its design, software, logos and the ProgressX name, belongs to ProgressX and is protected by law.
                These Terms give you a personal, non-transferable, revocable right to use the Service as intended. They do not give you
                any other rights in it. If you send us feedback or ideas, we may use them without any obligation to you.
            </p>

            <h2><span>09</span>Third-party services</h2>
            <p>
                The Service relies on and links to third-party services, such as Google sign-in and external research publishers. We are
                not responsible for third-party services or content, and your use of them is governed by their own terms and policies.
            </p>

            <h2><span>10</span>Disclaimers</h2>
            <p>
                The Service is provided <strong>&quot;as is&quot; and &quot;as available&quot;</strong>. To the fullest extent permitted by law, we disclaim
                all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy and
                non-infringement. We do not promise that the Service will be uninterrupted, error-free or secure, or that any results,
                such as weight, strength or body composition changes, will be achieved.
            </p>

            <h2><span>11</span>Limitation of liability</h2>
            <p>
                To the fullest extent permitted by law, ProgressX will not be liable for any indirect, incidental, special, consequential
                or punitive damages, or for any loss of data, profits or goodwill, or for any personal injury or health outcome arising from
                your use of the Service or reliance on its content. Our total liability for any claim relating to the Service is limited to
                the greater of the amount you paid us in the 12 months before the claim or CAD $100. Some jurisdictions do not allow these
                limits, so they may not fully apply to you.
            </p>

            <h2><span>12</span>Indemnity</h2>
            <p>
                You agree to indemnify and hold ProgressX harmless from claims, losses and expenses, including reasonable legal fees,
                arising from Your Content, your use of the Service, or your breach of these Terms or of anyone else&apos;s rights.
            </p>

            <h2><span>13</span>Governing law</h2>
            <p>
                These Terms are governed by the laws of {LEGAL_GOVERNING_LAW}, without regard to conflict-of-law rules. You and ProgressX
                agree to the exclusive jurisdiction of the courts located there, except where the law of your place of residence gives you
                the right to bring a claim locally.
            </p>

            <h2><span>14</span>Changes to these Terms</h2>
            <p>
                We may update these Terms from time to time. If we make significant changes, we will update the date above and, where
                appropriate, notify you in the app or by email. Continuing to use the Service after changes take effect means you accept the
                updated Terms.
            </p>

            <h2><span>15</span>General</h2>
            <p>
                These Terms and the Privacy Policy are the entire agreement between you and ProgressX about the Service. If any part is
                found unenforceable, the rest stays in effect. Our failure to enforce a provision is not a waiver. You may not transfer your
                rights under these Terms; we may transfer ours as part of a merger, acquisition or sale of assets.
            </p>

            <h2><span>16</span>Contact us</h2>
            <p>
                Questions about these Terms? Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
        </LegalPage>
    )
}
