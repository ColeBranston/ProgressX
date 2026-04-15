"use client";
import ProfileWeb from '../../internal_pages/profile_web'
import { Suspense } from "react";

export default function ProfilePage() {
    return (
        <Suspense>
            <ProfileWeb />
        </Suspense>
    )
}