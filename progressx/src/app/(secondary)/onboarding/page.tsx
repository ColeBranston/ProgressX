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
    const [name, setName] = useState('')
    const [height, setHeight] = useState('')
    const [weight, setWeight] = useState('')
    const [age, setAge] = useState('')
    const [gender, setGender] = useState('male')

    const {setIsLoading} = useContext(IsLoadingContext)

    const router = useRouter()

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
            name: name,
            height: height,
            weight: weight,
            age: age,
            gender: gender
          }),
        });

        if (data.ok) {
            setIsLoading(false)
            router.push('/')
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
                                        <label htmlFor='Gender'>Gender</label>
                                        <select id='Gender' className={styles.selectField} onChange={(e) => {setGender(e.target.value)}}>
                                            <option className={styles.maleSelect} value={'male'}>Male</option>
                                            <option className={styles.femaleSelect} value={'female'}>Female</option>
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