// Searching the saved foods in Quick Add: every word typed has to appear somewhere in the name,
// ignoring case and accents, so "chick bre" finds "Chicken Breast" and "creme" finds "Crème fraîche"

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function matchesFoodSearch(name: string, query: string): boolean {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    const haystack = normalize(name)
    return words.every((word) => haystack.includes(word))
}
