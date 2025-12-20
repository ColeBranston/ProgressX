"use client";

import { CSSProperties, useEffect, useState } from 'react';
import styles from './CalorieTarget.module.css'

export type goalType = ("Deficit" | "Maintain" | "Surplus") 

type targetType = {
    curr?: number,
    totalExpenditure: number,
    goal?: goalType
}

const config = {
    NUM_SEGMENTS: 10
}

function getSegment(upper: number, lower: number) {
    return [config.NUM_SEGMENTS - 1, (upper - lower) / config.NUM_SEGMENTS] as const
}

function getCurrOffset(curr: number, lower: number, upper: number) {
    return curr > lower? (1/(config.NUM_SEGMENTS+1))*((curr - lower) / getSegment(upper, lower)[1] + 1) : (1/(config.NUM_SEGMENTS+1) * curr / lower)
}

export default function CalorieTarget({
    totalExpenditure = 2000,
    curr = 0,
    goal = "Maintain"
}: targetType) {

    const [upper, setUpper] = useState(0)
    const [lower, setLower] = useState(0)
    const [boxArray, setBoxArray] = useState<number[]>([])
    const [intakeOffset, setIntakeOffset] = useState<number>(0)

    useEffect(() => {
        // compute the dynamic range
        const tempUpper = totalExpenditure + 1000
        const tempLower = totalExpenditure - 1000

        setUpper(tempUpper)
        setLower(tempLower)

        // compute segment size
        const [total, val] = getSegment(tempUpper, tempLower)

        // build segment values using local variables (NOT state)
        const tempArray: number[] = []
        let trailPointer = tempLower

        for (let i = 0; i < total; i++) {
            trailPointer += val
            tempArray.push(Math.round(trailPointer))
        }

        // reverse for your UI requirement
        setBoxArray(tempArray.reverse())
    }, [totalExpenditure])

    useEffect(()=> {
        const tempOffset = getCurrOffset(curr, lower, upper)
        console.log("Curr: ", curr, ", Lower: ", lower, ", Upper: ", upper)
        setIntakeOffset(tempOffset)
    }, [lower, upper])

    return (
        <div className={styles.calorieBarContainer}>
            <>
            <div className={styles.segment}>
                <p>{Math.round(upper)}</p>
            </div>
                
            {boxArray?.length==config.NUM_SEGMENTS-1? 
            
                boxArray.map((num) => (
                    <div className={styles.segment} key={num}>
                        <p>{num}</p>
                    </div>
                ))
                :
                Array.from({ length: config.NUM_SEGMENTS-1 }).map((i) => {
                    return  <div className={styles.segment}>
                                <p>0</p>
                            </div>
                })}
            <div className={styles.segment}>
                <p>{Math.round(lower)}</p>
            </div>

            <div className={styles.goalHightlight}></div>
            
            {/* This is the vertical progress bar indicating the user's current daily intake */}
            <div className={styles.currProgress} style={{"--curr-scale": intakeOffset} as CSSProperties}></div>
            </>
        </div>
    )
}