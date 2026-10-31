import StatsSkeleton from "../StatsSkeleton";

export default function Loading() {
    return <StatsSkeleton label="Loading your weight" tiles={5} charts={["wide"]} />
}
