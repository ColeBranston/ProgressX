"use client";

import { createContext, useEffect, useState } from "react";

export const userDataContext = createContext<any>(false)

export function UserDataProvider({ children }: {children: any}){

    const [userData, setUserData] = useState({
        username: null,
        name: null,
        email: null,
        age: null, 
        pfp: null,
        bio: null,
        privacy: "private",
        gender: null,
        height: null,
        weight: null,
        followers: 0,
        following: 0,
        likes: 0,
    })

    useEffect(()=> {
        const storedUser = localStorage.getItem("userData")
        if (storedUser) {
            setUserData(JSON.parse(storedUser))
        } else {
            localStorage.setItem("userData", JSON.stringify(userData))
        }
    }, [])

    useEffect(()=> {
        localStorage.setItem("userData", JSON.stringify(userData))
    }, [userData])

    return(
        <userDataContext.Provider value={{ userData, setUserData }}>
            { children }
        </userDataContext.Provider>
    )
}