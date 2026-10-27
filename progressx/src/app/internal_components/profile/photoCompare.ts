import dayjs from "dayjs"

// Comparing two progress photos side by side: the older one on the left (before), the newer on the right

export function beforeAndAfter<T extends { created_at: string }>(a: T, b: T): [T, T] {
    return dayjs(a.created_at).isAfter(dayjs(b.created_at)) ? [b, a] : [a, b]
}

// How far apart two photos were taken, in calendar days: "Same day", "6 days apart", "3 weeks apart",
// "5 months apart", "1 year apart"
export function timeApart(a: string, b: string): string {
    const days = Math.abs(dayjs(b).startOf("day").diff(dayjs(a).startOf("day"), "day"))
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} apart`
    if (days === 0) return "Same day"
    if (days < 14) return plural(days, "day")
    if (days < 60) return plural(Math.round(days / 7), "week")
    if (days < 365) return plural(Math.round(days / 30.44), "month")
    const years = Math.floor(days / 365)
    const months = Math.round((days - years * 365) / 30.44)
    return months && months < 12 ? `${years} year${years === 1 ? "" : "s"}, ${months} month${months === 1 ? "" : "s"} apart` : plural(Math.round(days / 365), "year")
}
