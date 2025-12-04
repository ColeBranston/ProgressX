"use client";

import { ReactNode, useEffect, useState } from 'react';
import styles from './CalorieTarget.module.css'

export type goalType = ("Deficit" | "Maintain" | "Surplus") 

type targetType = {
    upperGoal?: number,
    lowerGoal?: number
    upper?: number,
    lower?: number,
    curr?: number
}

const config = {
    NUM_SEGMENTS: 10 // number of segments for target
}

function getSegment(upper: number, lower: number) {
    return [config.NUM_SEGMENTS - 1, (upper - lower) / config.NUM_SEGMENTS]
}

export default function CalorieTarget({
    
    upper = 1500,
    lower = 500,
    curr = 0
}: targetType) {

    const [total, val] = getSegment(upper, lower)

    const [ boxArray, setBoxArray ] = useState<any>([])// if I make of type ReactNode it breaks, while there is a fix, pretty dumb to figure out

    useEffect(() => {
        const tempArray = []
        let trailPointer = lower

        for (let i = 0; i < total; i++) {
            tempArray.push(Math.round(trailPointer + val))
            trailPointer = trailPointer + val
        }

        setBoxArray(tempArray.reverse())

    }, [upper, lower])

    useEffect(() => {
        console.log(boxArray)
    }, [boxArray])

    return (
        <div className={styles.calorieBarContainer}>
            <div className={styles.segment}>
                <p>{upper}</p>
            </div>
             {
                boxArray.map((num: number) => {
                    return (
                        <div className={styles.segment}>
                            <p>{num}</p>
                        </div>
                    )
                })

            }
            <div className={styles.segment}>
                <p>{lower}</p>
            </div>
        </div>
    )
}