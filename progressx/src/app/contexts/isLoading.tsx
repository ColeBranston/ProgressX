"use client";

import { createContext, Dispatch, ReactNode, SetStateAction, useState } from "react";

export const IsLoadingContext = createContext<{isLoading: boolean, setIsLoading: Dispatch<SetStateAction<boolean>>}>({isLoading: false, setIsLoading: () => {}})

export function IsLoadingProvider({ children }: {children: ReactNode}){
    const [isLoading, setIsLoading] = useState(false)

    return(
        <IsLoadingContext.Provider value={{ isLoading, setIsLoading }}>
            { children }
        </IsLoadingContext.Provider>
    )
}