"use client";

import { createContext, useState } from "react";

export const IsLoadingContext = createContext<any>(false)

export function IsLoadingProvider({ children }: {children: any}){
    const [isLoading, setIsLoading] = useState(false)

    return(
        <IsLoadingContext.Provider value={{ isLoading, setIsLoading }}>
            { children }
        </IsLoadingContext.Provider>
    )
}