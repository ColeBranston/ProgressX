"use client";

import { useContext, useEffect, useState } from 'react'
import styles from './onboarding.module.css'
import { useRouter } from 'next/navigation';
import { IsLoadingContext } from '@/app/contexts/isLoading';

export default function Onboarding() {

    const [animationComplete, setAnimationComplete] = useState(false)
    const [isUserVerified, setIsUserVerified] = useState(false)
    const [userEmail, setUserEmail] = useState('')

    // form states
    const [username, setUsername] = useState('')
    const [name, setName] = useState('')
    const [height, setHeight] = useState('')
    const [weight, setWeight] = useState('')
    const [age, setAge] = useState('')
    const [gender, setGender] = useState('male')
    const [activity, setActivity] = useState<string>("Sedentary")

    const {setIsLoading} = useContext(IsLoadingContext)

    const router = useRouter()

    //Activity Options and there associated value for faster database indexing
    const activityMap: Record<string, number> = {
        "Sedentary (Little to no exercise)": 1,
        "Lightly Active (Light exercise 1-3 days/week)": 2,
        "Moderately Active (Moderate exercise 3-5 days/week)": 3,
        "Very Active (Hard exercise 6-7 days/week)": 4, 
        "Extra Active (Very hard exercise, physical job)": 5
    }

    useEffect(() => {
        async function checkToken() {
            const data = await fetch("/api/auth", {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            }
          })

          if (!data.ok) {
            router.push("/login")
          } else {
            const json = await data.json()
            const email = json?.user

            if (email) {
                setUserEmail(email)
            }
        
            setIsUserVerified(true)
          }
        }

        checkToken()

        setTimeout(() => {
            setAnimationComplete(true)
        }, 5000)
    }, [])

    async function sendOnboardingDetails(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        console.log("Details have been sent")

        setIsLoading(true)

        const data = await fetch("/api/user/onboarding", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username,
            name: name,
            height: height,
            weight: weight,
            age: age,
            gender: gender,
            activity: activityMap[activity]
          }),
        });

        if (data.ok) {
            setIsLoading(false)
            console.log("Data has been entered: ", await data.json())
            router.replace("/")
        } else {
            setIsLoading(false)

        }
    }

    return(
        <> { isUserVerified? 
            <div className={styles.mainContainer}>
                {animationComplete?
                        <div className={styles.welcomeContainerComplete}>
                            <div className={styles.welcomeTextComplete}><span className={styles.welcomeInitialText}>Welcome to</span>
                                <div className={"mainLogo " + styles.logoExtra}>
                                    <span className="progress">Progress</span>
                                    <span className="X">X</span>
                                </div>
                            </div>
                            <form className={styles.onboardingForm} onSubmit={sendOnboardingDetails}>
                                <div className={styles.emailContainer}>
                                    <p className={styles.emailHeader}>Email: <span className={styles.userEmail}>{userEmail}</span></p>
                                </div>
                                <div className={styles.inputFieldContainer}>
                                <div className={styles.inputWrapper}>
                                        <label htmlFor='Username'>Username</label>
                                        <input required id='Username' className={styles.inputField} placeholder='Username' type="text" onChange={(e) => {setUsername(e.target.value)}}/>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <label htmlFor='Name'>Name</label>
                                        <input required id='Name' className={styles.inputField} placeholder='Name' type="text" onChange={(e) => {setName(e.target.value)}}/>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <label htmlFor='Height'>Height (cm)</label>
                                        <input required id='Height' className={styles.inputField} placeholder='Height' type="number" onChange={(e) => {setHeight(e.target.value)}}/>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <label htmlFor='Age'>Age</label>
                                        <input required id='Age'className={styles.inputField} placeholder='Age' type="number" onChange={(e) => {setAge(e.target.value)}}/>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <label htmlFor='Weight'>Weight (lbs)</label>
                                        <input required id='Weight' className={styles.inputField} placeholder='Weight' type="number" onChange={(e) => {setWeight(e.target.value)}}/>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <label htmlFor='Activity'>Workout Frequency</label>
                                        <select id='Activity' className={styles.selectField} onChange={(e) => {setActivity(e.target.value)}}>
                                            {
                                                Object.keys(activityMap).map((Word) => {
                                                    return <option value={Word}>{Word}</option>
                                                })
                                            }
                                        </select>
                                    </div>
                                    <div className={styles.inputWrapper}>
                                        <label htmlFor='Gender'>Gender</label>
                                        <select id='Gender' className={styles.selectField} onChange={(e) => {setGender(e.target.value)}}>
                                            <option value={'male'}>Male</option>
                                            <option value={'female'}>Female</option>
                                        </select>
                                    </div>
                                </div>
                                <button className={styles.submitButton} type="submit">Submit</button>
                            </form>
                        </div>
                :
                        <div className={styles.welcomeContainer}>
                            <div className={styles.welcomeText}><span className={styles.welcomeInitialText}>Welcome to</span>
                                <div className={"mainLogo " + styles.logoExtra}>
                                    <span className="progress">Progress</span>
                                    <span className="X">X</span>
                                </div>
                            </div>
                        </div>
                }
            </div>
            : null}
            </>
    )
}