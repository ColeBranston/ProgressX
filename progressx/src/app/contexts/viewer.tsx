"use client";

import { createContext, ReactNode, useCallback, useContext } from "react";

// Whether the person looking at the page is signed in. Some app pages (the public feed at /explore,
// search, research and other people's profiles) can be browsed signed out; everything that needs an
// account sends those visitors to the login page instead.
const ViewerContext = createContext({ signedIn: true })

export function ViewerProvider({ signedIn, children }: { signedIn: boolean, children: ReactNode }) {
    return <ViewerContext.Provider value={{ signedIn }}>{children}</ViewerContext.Provider>
}

export function useViewer() {
    return useContext(ViewerContext)
}

// For actions that need an account (like, follow, post): returns true when signed in, otherwise
// sends the visitor to the login page and returns false
export function useRequireSignIn() {
    const { signedIn } = useViewer()
    return useCallback(() => {
        if (!signedIn) window.location.assign("/login")
        return signedIn
    }, [signedIn])
}
