"use client";

import { createContext, ReactNode, useEffect, useMemo, useState, Dispatch, SetStateAction } from "react";
import debounce from "lodash/debounce";

type UserData = Record<string, string | number | null>;

type UserDataContextType = {
  userData: UserData;
  setUserData: Dispatch<SetStateAction<UserData>>;
};

export const userDataContext = createContext<UserDataContextType | undefined>(undefined);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const [userData, setUserData] = useState<UserData>({
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
    activity: -1
  });

  // ✅ Load from localStorage once on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("userData");
    if (storedUser) {
      setUserData(JSON.parse(storedUser));
    } else {
      localStorage.setItem("userData", JSON.stringify(userData));
    }
  }, []);

  // ✅ Create a debounced backend update function
  const debouncedUpdateServer = useMemo(
    () =>
      debounce(async (updatedUserData: UserData) => {
        try {
          console.log("Debounced server sync:", updatedUserData);

          const res = await fetch("/api/user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ user: updatedUserData }),
          });

          if (!res.ok) {
            console.error("User Data Update Failed");
          } else {
            console.log("User Data Update Completed Successfully");
          }
        } catch (err) {
          console.error("Sync failed:", err);
        }
      }, 10000), // ← 10 second debounce
    []
  );

  // ✅ Watch for userData changes
  useEffect(() => {
    // Always keep localStorage in sync immediately
    localStorage.setItem("userData", JSON.stringify(userData));

    // Then trigger the debounced backend update
    debouncedUpdateServer(userData);
  }, [userData, debouncedUpdateServer]);

  return (
    <userDataContext.Provider value={{ userData, setUserData }}>
      {children}
    </userDataContext.Provider>
  );
}