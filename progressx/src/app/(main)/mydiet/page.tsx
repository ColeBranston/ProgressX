"use client";

import { useContext, useEffect, useState } from 'react';
import dayjs from 'dayjs'
import styles from './dietpage.module.css'
import { AnalyticsBar, CalorieTarget, goalType } from "../../internal_components/index"
import { userDataContext } from '@/app/contexts/userData';

export default function DietPage() {
     
    type dietConfigType = {
        POUND2KG: number,
        ActivityWeighting: Record<string, number>
    }

    const config: dietConfigType = {
        POUND2KG: 0.45359237,
        ActivityWeighting: {
            "1": 1.2,
            "2": 1.375,
            "3": 1.55,
            "4": 1.725,
            "5": 1.9, 
        }
    }

    const { userData } = useContext(userDataContext)

    const [ daySelector, setDaySelector ] = useState(dayjs().day())
    const [ toggleAddItem, setToggleAddItem] = useState(false)

    const [ addItemType, setAddItemType ] = useState<string | null>(null)

    const [ goalState, setGoalState ] = useState<goalType>("Maintain")

    const [ totalExpenditure, setTotalExpenditure ] = useState<number>(0)

    const [ totalCal, setTotalCal ] = useState<number>(2100)

    // Accurate equation for calculating the BMR of a man or woman without using body fat percentage (%)
    function Mifflin_St_Jeor_BMR() {
        switch (userData.gender) {
            case "male":
                return (10 * (userData.weight * config.POUND2KG) + (6.25 * userData.height) - (5 * userData.age) + 5)

            case "female":  
                return (10 * (userData.weight * config.POUND2KG) + (6.25 * userData.height) - (5 * userData.age) - 161)

            default:
                console.error("User's Gender is apparently alien: ", userData.gender)
                return 0
        }
    }

    function calcTotalExpenditure() {
        const BMR = Mifflin_St_Jeor_BMR()
        console.log("Activity Number: ", userData.activity, "BMR: ", BMR)
        return config.ActivityWeighting[userData.activity] * BMR
    }

    function getDay(x: Number) {
        switch(x) {
            case 0:
                return "Sunday"
            case 1:
                return "Monday"
            case 2:
                return "Tuesday"
            case 3:
                return "Wednesday"
            case 4:
                return "Thursday"
            case 5:
                return "Friday"
            case 6:
                return "Saturday"
            default:
                console.error("No Day Found: ", x)
        }
    }

    function cycleGoalState() {
        switch(goalState) {
            case "Deficit":
                setGoalState("Maintain")
                break;

            case "Maintain":
                setGoalState("Surplus")
                break;

            case "Surplus":
                setGoalState("Deficit")
                break;

            default:
                console.error("Improper Goal State Found: ", goalState)
        }
    }

    useEffect(() => {
        const stored = localStorage.getItem("TotalExpenditure");

        if (stored !== null) {
            setTotalExpenditure(Number(stored));
            return;
        }

        const expenditure = calcTotalExpenditure();
        setTotalExpenditure(expenditure);
        localStorage.setItem("TotalExpenditure", String(expenditure));
    }, []);

    return(
        <div className="mainWrapper">
            <div className={styles.mainContainer}>
                <div className={styles.daysDots}>
                    <div className={styles.calenderButtonContainer}>
                    <svg width="45" height="45" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <g clipPath="url(#clip0_245_153)">
                        <path d="M7.5 10.5H6.5C6.23478 10.5 5.98043 10.6054 5.79289 10.7929C5.60536 10.9804 5.5 11.2348 5.5 11.5C5.5 11.7652 5.60536 12.0196 5.79289 12.2071C5.98043 12.3946 6.23478 12.5 6.5 12.5H7.5C7.76522 12.5 8.01957 12.3946 8.20711 12.2071C8.39464 12.0196 8.5 11.7652 8.5 11.5C8.5 11.2348 8.39464 10.9804 8.20711 10.7929C8.01957 10.6054 7.76522 10.5 7.5 10.5Z"/>
                        <path d="M12.5 10.5H11.5C11.2348 10.5 10.9804 10.6054 10.7929 10.7929C10.6054 10.9804 10.5 11.2348 10.5 11.5C10.5 11.7652 10.6054 12.0196 10.7929 12.2071C10.9804 12.3946 11.2348 12.5 11.5 12.5H12.5C12.7652 12.5 13.0196 12.3946 13.2071 12.2071C13.3946 12.0196 13.5 11.7652 13.5 11.5C13.5 11.2348 13.3946 10.9804 13.2071 10.7929C13.0196 10.6054 12.7652 10.5 12.5 10.5Z"/>
                        <path d="M17.5 10.5H16.5C16.2348 10.5 15.9804 10.6054 15.7929 10.7929C15.6054 10.9804 15.5 11.2348 15.5 11.5C15.5 11.7652 15.6054 12.0196 15.7929 12.2071C15.9804 12.3946 16.2348 12.5 16.5 12.5H17.5C17.7652 12.5 18.0196 12.3946 18.2071 12.2071C18.3946 12.0196 18.5 11.7652 18.5 11.5C18.5 11.2348 18.3946 10.9804 18.2071 10.7929C18.0196 10.6054 17.7652 10.5 17.5 10.5Z"/>
                        <path d="M7.5 14.5H6.5C6.23478 14.5 5.98043 14.6054 5.79289 14.7929C5.60536 14.9804 5.5 15.2348 5.5 15.5C5.5 15.7652 5.60536 16.0196 5.79289 16.2071C5.98043 16.3946 6.23478 16.5 6.5 16.5H7.5C7.76522 16.5 8.01957 16.3946 8.20711 16.2071C8.39464 16.0196 8.5 15.7652 8.5 15.5C8.5 15.2348 8.39464 14.9804 8.20711 14.7929C8.01957 14.6054 7.76522 14.5 7.5 14.5Z"/>
                        <path d="M12.5 14.5H11.5C11.2348 14.5 10.9804 14.6054 10.7929 14.7929C10.6054 14.9804 10.5 15.2348 10.5 15.5C10.5 15.7652 10.6054 16.0196 10.7929 16.2071C10.9804 16.3946 11.2348 16.5 11.5 16.5H12.5C12.7652 16.5 13.0196 16.3946 13.2071 16.2071C13.3946 16.0196 13.5 15.7652 13.5 15.5C13.5 15.2348 13.3946 14.9804 13.2071 14.7929C13.0196 14.6054 12.7652 14.5 12.5 14.5Z"/>
                        <path d="M17.5 14.5H16.5C16.2348 14.5 15.9804 14.6054 15.7929 14.7929C15.6054 14.9804 15.5 15.2348 15.5 15.5C15.5 15.7652 15.6054 16.0196 15.7929 16.2071C15.9804 16.3946 16.2348 16.5 16.5 16.5H17.5C17.7652 16.5 18.0196 16.3946 18.2071 16.2071C18.3946 16.0196 18.5 15.7652 18.5 15.5C18.5 15.2348 18.3946 14.9804 18.2071 14.7929C18.0196 14.6054 17.7652 14.5 17.5 14.5Z"/>
                        <path d="M7.5 18.5H6.5C6.23478 18.5 5.98043 18.6054 5.79289 18.7929C5.60536 18.9804 5.5 19.2348 5.5 19.5C5.5 19.7652 5.60536 20.0196 5.79289 20.2071C5.98043 20.3946 6.23478 20.5 6.5 20.5H7.5C7.76522 20.5 8.01957 20.3946 8.20711 20.2071C8.39464 20.0196 8.5 19.7652 8.5 19.5C8.5 19.2348 8.39464 18.9804 8.20711 18.7929C8.01957 18.6054 7.76522 18.5 7.5 18.5Z"/>
                        <path d="M12.5 18.5H11.5C11.2348 18.5 10.9804 18.6054 10.7929 18.7929C10.6054 18.9804 10.5 19.2348 10.5 19.5C10.5 19.7652 10.6054 20.0196 10.7929 20.2071C10.9804 20.3946 11.2348 20.5 11.5 20.5H12.5C12.7652 20.5 13.0196 20.3946 13.2071 20.2071C13.3946 20.0196 13.5 19.7652 13.5 19.5C13.5 19.2348 13.3946 18.9804 13.2071 18.7929C13.0196 18.6054 12.7652 18.5 12.5 18.5Z"/>
                        <path d="M17.5 18.5H16.5C16.2348 18.5 15.9804 18.6054 15.7929 18.7929C15.6054 18.9804 15.5 19.2348 15.5 19.5C15.5 19.7652 15.6054 20.0196 15.7929 20.2071C15.9804 20.3946 16.2348 20.5 16.5 20.5H17.5C17.7652 20.5 18.0196 20.3946 18.2071 20.2071C18.3946 20.0196 18.5 19.7652 18.5 19.5C18.5 19.2348 18.3946 18.9804 18.2071 18.7929C18.0196 18.6054 17.7652 18.5 17.5 18.5Z"/>
                        <path d="M21.5 3H18.75C18.6837 3 18.6201 2.97366 18.5732 2.92678C18.5263 2.87989 18.5 2.8163 18.5 2.75V1C18.5 0.734784 18.3946 0.48043 18.2071 0.292893C18.0196 0.105357 17.7652 0 17.5 0C17.2348 0 16.9804 0.105357 16.7929 0.292893C16.6054 0.48043 16.5 0.734784 16.5 1V5.75C16.5 5.94891 16.421 6.13968 16.2803 6.28033C16.1397 6.42098 15.9489 6.5 15.75 6.5C15.5511 6.5 15.3603 6.42098 15.2197 6.28033C15.079 6.13968 15 5.94891 15 5.75V3.5C15 3.36739 14.9473 3.24021 14.8536 3.14645C14.7598 3.05268 14.6326 3 14.5 3H8.25C8.1837 3 8.12011 2.97366 8.07322 2.92678C8.02634 2.87989 8 2.8163 8 2.75V1C8 0.734784 7.89464 0.48043 7.70711 0.292893C7.51957 0.105357 7.26522 0 7 0C6.73478 0 6.48043 0.105357 6.29289 0.292893C6.10536 0.48043 6 0.734784 6 1V5.75C6 5.94891 5.92098 6.13968 5.78033 6.28033C5.63968 6.42098 5.44891 6.5 5.25 6.5C5.05109 6.5 4.86032 6.42098 4.71967 6.28033C4.57902 6.13968 4.5 5.94891 4.5 5.75V3.5C4.5 3.36739 4.44732 3.24021 4.35355 3.14645C4.25979 3.05268 4.13261 3 4 3H2.5C1.96957 3 1.46086 3.21071 1.08579 3.58579C0.710714 3.96086 0.5 4.46957 0.5 5V22C0.5 22.5304 0.710714 23.0391 1.08579 23.4142C1.46086 23.7893 1.96957 24 2.5 24H21.5C22.0304 24 22.5391 23.7893 22.9142 23.4142C23.2893 23.0391 23.5 22.5304 23.5 22V5C23.5 4.46957 23.2893 3.96086 22.9142 3.58579C22.5391 3.21071 22.0304 3 21.5 3ZM21.5 21.5C21.5 21.6326 21.4473 21.7598 21.3536 21.8536C21.2598 21.9473 21.1326 22 21 22H3C2.86739 22 2.74021 21.9473 2.64645 21.8536C2.55268 21.7598 2.5 21.6326 2.5 21.5V9.5C2.5 9.36739 2.55268 9.24021 2.64645 9.14645C2.74021 9.05268 2.86739 9 3 9H21C21.1326 9 21.2598 9.05268 21.3536 9.14645C21.4473 9.24021 21.5 9.36739 21.5 9.5V21.5Z"/>
                        </g>
                        <defs>
                        <clipPath id="clip0_245_153">
                        <rect width="24" height="24" fill="white"/>
                        </clipPath>
                    </defs>
                    </svg>
                    </div>
                    <table>
                        <tbody>
                            <tr>
                                <td><p>S</p></td>
                                <td><p>M</p></td>
                                <td><p>T</p></td>
                                <td><p>W</p></td>
                                <td><p>Th</p></td>
                                <td><p>F</p></td>
                                <td><p>S</p></td>
                            </tr>
                            <tr>
                                <td><button className={daySelector == 0? styles.selectedDay: undefined} disabled={dayjs().day() < 0} onClick={()=>setDaySelector(0)}/></td>
                                <td><button className={daySelector == 1? styles.selectedDay: undefined} disabled={dayjs().day() < 1} onClick={()=>setDaySelector(1)}/></td>
                                <td><button className={daySelector == 2? styles.selectedDay: undefined} disabled={dayjs().day() < 2} onClick={()=>setDaySelector(2)}/></td>
                                <td><button className={daySelector == 3? styles.selectedDay: undefined} disabled={dayjs().day() < 3} onClick={()=>setDaySelector(3)}/></td>
                                <td><button className={daySelector == 4? styles.selectedDay: undefined} disabled={dayjs().day() < 4} onClick={()=>setDaySelector(4)}/></td>
                                <td><button className={daySelector == 5? styles.selectedDay: undefined} disabled={dayjs().day() < 5} onClick={()=>setDaySelector(5)}/></td>
                                <td><button className={daySelector == 6? styles.selectedDay: undefined} disabled={dayjs().day() < 6} onClick={()=>setDaySelector(6)}/></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className={styles.foodIntakeDisplayContainer}>
                    <div className={styles.dailyFoodIntakeContainer}>
                        <p className={styles.dailyIntakeHeader}>{getDay(daySelector)}</p>
                        <button onClick={()=>setToggleAddItem(!toggleAddItem)}>
                            <svg width="30" height="38" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    {toggleAddItem?

                    <div className={styles.addFoodItemContainer}>
                        {addItemType?
                        
                        (addItemType === "manual" ?
                            <>
                            <button onClick={()=>setAddItemType(null)}>Back</button>
                            </>
                            :

                            addItemType === "quick" ?
                                <button onClick={()=>setAddItemType(null)}>Back</button>

                            :
                            
                            null
                        )
                        :
                        <>
                            <div className={styles.addFoodItemButtons} onClick={()=>setAddItemType("manual")}>
                                <p>Add Manually</p>
                            </div>
                            <div className={styles.addFoodItemButtons} onClick={()=>setAddItemType("quick")}>
                                <p>Quick Add</p>
                            </div>
                        </>
                        }
                    </div>
                    
                    :

                    null
                    }
                     <div className={styles.dietAnalytics}>
                        <div className={styles.analyticsContainer}>
                            <p className={styles.dietAnalyticsHeaders}>Macros</p>
                            <AnalyticsBar name={'Protein'} val={5} total={15} colour={"red"} measure={"g"} size={'normal'}/>
                            <AnalyticsBar name={'Carbohydrates'} val={5} total={15} colour={"red"} measure={"g"} size={'normal'}/>
                            <AnalyticsBar name={'Fats'} val={5} total={15} colour={"red"} measure={"g"} size={'normal'}/>

                            <p className={styles.dietAnalyticsHeaders}>Micros</p>
                            <AnalyticsBar name={'Vitamin D'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Vitamin B(12)'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Folate (B9)'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Vitamin C'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Iron'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Calcium'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Magnesium'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Potassium'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Zinc'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                            <AnalyticsBar name={'Iodine'} val={5} total={15} colour={"red"} measure={"g"} size={'small'}/>
                        </div>
                        <div className={styles.calorieContainer}>
                            <p className={styles.caloriesHeader}>Caloric Intake</p>
                            <p key={totalCal} className={styles.caloriesText}>{totalCal} kCal</p>
                            <CalorieTarget curr={totalCal} totalExpenditure={totalExpenditure} goal={goalState}/>
                            <div className={styles.customButtonContainer}>
                                <div onClick={cycleGoalState} className={styles.customButton}>                               
                                    <ul>
                                        <li style={{height: "15px", width: "15px"}} className={goalState=='Surplus'? styles.highlightedGoalItem : undefined}/>
                                        <li style={{height: "12.5px", width: "12.5px"}} className={goalState=='Maintain'? styles.highlightedGoalItem : undefined}/>
                                        <li style={{height: "10px", width: "10px"}} className={goalState=='Deficit'? styles.highlightedGoalItem : undefined}/>
                                    </ul>
                                    <p>{goalState}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}