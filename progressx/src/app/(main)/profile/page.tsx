"use client";
import { Suspense } from 'react';
import ProfileWeb from '../../internal_pages/profile_web'

export default function ProfilePage() {
    return (
        <Suspense>
            <ProfileWeb />
        </Suspense>
    )
}