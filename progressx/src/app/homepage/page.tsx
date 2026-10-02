import type { Metadata } from "next";
import Homepage from "../internal_components/homepage/Homepage";

export const metadata: Metadata = {
    title: "ProgressX | Fitness, measured",
    description: "Log every set, meal and rep, then watch the numbers climb. Workouts, nutrition, research and community in one place.",
};

export default function HomepageRoute() {
    return <Homepage />;
}
