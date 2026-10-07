import type { Metadata } from "next";

// The login page is a client component, so its metadata (title, canonical address) lives here
export const metadata: Metadata = {
    title: "Log in | ProgressX",
    description: "Log in to ProgressX to track your workouts, nutrition and progress.",
    alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
