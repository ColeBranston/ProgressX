"use client";

import { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState, Dispatch, SetStateAction } from "react";
import debounce from "lodash/debounce";

export type UserData = Record<string, string | number | null>;

// The profile fields POST /api/user saves, and the profiles columns they come from
export const SYNCED_FIELDS = { pfp: "profile_image", bio: "profile_bio", privacy: "profile_privacy" } as const;
type SyncedField = keyof typeof SYNCED_FIELDS;

// The synced fields that differ from what the server last had. Only these are sent, so a stale or
// default copy of the other fields (e.g. pfp: null in a fresh browser) can't overwrite the profile.
export function changedProfileFields(current: UserData, server: UserData): UserData {
  const changes: UserData = {};
  for (const field of Object.keys(SYNCED_FIELDS) as SyncedField[]) {
    if (field in current && (current[field] ?? null) !== (server[field] ?? null)) changes[field] = current[field];
  }
  return changes;
}

type UserDataContextType = {
  userData: UserData;
  setUserData: Dispatch<SetStateAction<UserData>>;
};

export const userDataContext = createContext<UserDataContextType>(
   {
    userData: {username: null},
    setUserData: () => {}
   }
); // just to satisfy type script eslinting

export function UserDataProvider({ children }: { children: ReactNode }) {
  const [userData, setUserDataState] = useState<UserData>({
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

  // The latest profile data, written together with the state (so updates stay pure and the sync code
  // below always sees what was last set, even before React re-renders)
  const latest = useRef(userData);
  const commit = useCallback((next: UserData) => {
    latest.current = next;
    setUserDataState(next);
  }, []);

  // ✅ Load from localStorage once on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("userData");
    console.log("UserData UseEffect Triggered")
    if (storedUser) {
      commit(JSON.parse(storedUser)); // a saved copy, not an edit: the server's values replace it below
    } else {
      localStorage.setItem("userData", JSON.stringify(userData));
    }
  }, []);

  // What the server has for the synced fields; null until it's loaded, and nothing is sent before then
  const serverFields = useRef<UserData | null>(null);
  const loadingServer = useRef(false);
  // synced fields the app changed before that baseline loaded (e.g. the first load failed): when it
  // does load, these keep the new value (and get sent) instead of being replaced by the server's
  const editedBeforeLoad = useRef(new Set<SyncedField>());

  // setUserData for the rest of the app: notes edits to synced fields made before the baseline loaded
  const setUserData = useCallback<Dispatch<SetStateAction<UserData>>>((action) => {
    const prev = latest.current;
    const next = typeof action === "function" ? action(prev) : action;
    if (!serverFields.current) {
      for (const field of Object.keys(SYNCED_FIELDS) as SyncedField[]) {
        if ((next[field] ?? null) !== (prev[field] ?? null)) editedBeforeLoad.current.add(field);
      }
    }
    commit(next);
  }, [commit]);

  // Loads the saved profile as the baseline to compare against, and lets it win over the copy in
  // localStorage, which can be out of date (another device, or from before a new picture)
  async function loadServerFields() {
    if (loadingServer.current) return;
    loadingServer.current = true;
    try {
      const res = await fetch("/api/user");
      if (!res.ok) return; // not logged in yet; tried again on the next change
      const row = (await res.json())?.userData;
      if (!row) return;
      const fields: UserData = {};
      for (const [field, column] of Object.entries(SYNCED_FIELDS)) fields[field] = row[column] ?? null;
      // the server's values win, except for fields edited while it couldn't be loaded
      const apply: UserData = {};
      for (const field of Object.keys(fields) as SyncedField[]) {
        if (!editedBeforeLoad.current.has(field)) apply[field] = fields[field];
      }
      editedBeforeLoad.current.clear();
      serverFields.current = fields;
      commit({ ...latest.current, ...apply });
    } catch (err) {
      console.error("Couldn't load profile:", err);
    } finally {
      loadingServer.current = false;
    }
  }

  // ✅ Create a debounced backend update function
  const debouncedUpdateServer = useMemo(
    () =>
      debounce(async (changes: UserData) => {
        try {
          console.log("Debounced server sync:", changes);

          const res = await fetch("/api/user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ user: changes }),
          });

          if (res.status === 401) {
            // not logged in yet (e.g. on the login page), nothing to sync
            return;
          }

          if (!res.ok) {
            console.error("User Data Update Failed");
          } else {
            serverFields.current = { ...serverFields.current, ...changes };
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

    // Then send what actually changed, once we know what the server has
    if (!serverFields.current) {
      loadServerFields();
      return;
    }
    const changes = changedProfileFields(userData, serverFields.current);
    if (Object.keys(changes).length) debouncedUpdateServer(changes);
    else debouncedUpdateServer.cancel(); // changed back before the send
  }, [userData, debouncedUpdateServer]);

  return (
    <userDataContext.Provider value={{ userData, setUserData }}>
      {children}
    </userDataContext.Provider>
  );
}