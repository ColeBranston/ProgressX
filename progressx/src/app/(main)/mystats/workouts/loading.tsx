import StatsSkeleton from "../StatsSkeleton";

export default function Loading() {
    return <StatsSkeleton label="Loading your workouts" controls="tabs" charts={["wide", "wide"]} />
}
