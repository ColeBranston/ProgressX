"use client";
import { Suspense, use } from 'react';
import OtherProfile from '../../../internal_pages/other_profile'

// Someone else's profile: /profile/<username>
export default function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = use(params)
    let name = username
    try { name = decodeURIComponent(username) } catch { /* already decoded */ }
    return (
        <Suspense>
            <OtherProfile username={name} />
        </Suspense>
    )
}
