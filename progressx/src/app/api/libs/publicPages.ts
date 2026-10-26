// Pages anyone can browse without signing in: the public video feed, the research and video/people
// search, and other people's profiles (only what they've made public). Everything else in the app,
// including your own profile (/profile), sends visitors who aren't signed in to the login page.
export function isPublicPage(path: string): boolean {
    return path === "/explore" || path === "/search" || path === "/research" || path.startsWith("/research/")
        || /^\/profile\/[^/]+$/.test(path)
}
