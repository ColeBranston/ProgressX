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
    const [goalState, setGoalState] = useState<goalType>("Maintain")

    const [goalBoundaries, setGoalBoundaries] = useState<Record<goalType, number[]>>({
        "Deficit": [0,0],
        "Maintain": [0,0],
        "Surplus": [0,0]
    })

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
        setIntakeOffset(tempOffset)
    }, [lower, upper])

    useEffect(()=> {
        setGoalState(goal)
        console.log(goalBoundaries)

        /*
            Setting the boundaries for each goal depending on the daily expenditure
        */

        const tempBoundaries = goalBoundaries

        tempBoundaries.Deficit = [totalExpenditure-1000, totalExpenditure-1] // 1000kCal max deficit since thats A. 2Lbs/week, and B. the accepted ammount before you begin to get excess skin
        tempBoundaries.Maintain = [totalExpenditure-50, totalExpenditure+50] // +- 50 acceptance for maintainence
        tempBoundaries.Surplus = [totalExpenditure+1, totalExpenditure+500] // stop is at 500 kCal surplus because any calories over that is just fat tissue

        setGoalBoundaries(tempBoundaries)
    }, [goal])

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

            <div className={styles.goalHightlight} style={{"--offset": goalState==="Deficit"? "9%" : goalState==="Maintain"? "54%": goalState==="Surplus"? "54%" : "0",
                                                            "--height": goalState==="Deficit"? "43%" : goalState==="Maintain"? "20px": goalState==="Surplus"? "22%" : "0",
                                                            "--background": (curr > goalBoundaries[goalState][0] && curr < goalBoundaries[goalState][1])? "rgba(0, 255, 0, 0.4)" : "rgba(var(--primary-color), 0.2)"} as CSSProperties}></div>
            
            {/* This is the vertical progress bar indicating the user's current daily intake */}
            <div className={styles.currProgress} style={{"--curr-scale": intakeOffset} as CSSProperties}></div>
            </>
        </div>
    )
}