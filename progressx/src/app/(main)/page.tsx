"use client";

import styles from './page.module.css';
import { Suspense, useContext, useEffect } from 'react';
import { userDataContext } from '../contexts/userData';
import ForYouFeed from '../internal_components/videos/ForYouFeed';

export default function Homepage() {

  const context = useContext(userDataContext)
  const setUserData = context?.setUserData

  useEffect(() => {
    async function getUserData() {
      const data = await fetch('/api/user', {
        method: "GET",
        headers: {
        "Content-Type": "application/json",
        }
      })

      const json = await data.json()

      if (data.ok) {
        console.log("User Data: ", json)

        if (setUserData) { // had to put this check in to satisfy typescript, but it should always be defined since the homepage is wrapped in the provider
          setUserData({
            username: json?.userData?.display_username,
            name: json?.userData?.display_name,
            email: json?.userData?.email,
            age: json?.userData?.age,
            pfp: json?.userData?.profile_image,
            bio: json?.userData.profile_bio,
            privacy: json?.userData?.profile_privacy,
            gender: json?.userData?.gender,
            height: json?.userData?.height_cm,
            weight: json?.userData?.weight_lbs,
            followers: json?.userData?.followers_count,
            following: json?.userData?.following_count,
            likes: json?.userData?.likes_count,
            activity: json?.userData?.activity_level
          })
        }
      } else {
        console.error("Error Fetching User Info: ", json)
      }
    }
    getUserData()
  }, [])

  return (
  <div className='mainWrapper'>
    <div className={styles.videoPlayerContainer}>
      <Suspense><ForYouFeed /></Suspense>
    </div>
  </div>
  );
}
