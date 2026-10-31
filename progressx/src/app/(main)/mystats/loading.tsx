import StatsSkeleton from "./StatsSkeleton";

// Inside the My Stats layout, so the header and tab row stay put while the Diet tab loads
export default function Loading() {
    return <StatsSkeleton label="Loading your stats" tiles={5} charts={["wide", "half", "half", "wide"]} />
}
