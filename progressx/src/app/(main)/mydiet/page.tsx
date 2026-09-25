"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs'
import styles from './dietpage.module.css'
import {
    AnalyticsBar,
    CalorieTarget,
    getMicronutrientTargets,
    goalType,
    ALL_MICRONUTRIENT_NAMES,
    FoodItemForm,
    FoodLogList,
    MicronutrientSettings,
    MonthCalendar,
    QuickAddScaler,
    FoodItemFormValues,
    FoodLogEntry,
    FoodItem
} from "../../internal_components/index"
import { userDataContext } from '@/app/contexts/userData';

// Indexed by dayjs' date.day() (0 = Sunday .. 6 = Saturday), matching weekStart
// below since dayjs' default start of week is Sunday.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'Th', 'F', 'S']

function entryToFormValues(entry: FoodLogEntry): FoodItemFormValues {
    return {
        name: entry.name,
        servingQty: entry.serving_qty,
        servingUnit: entry.serving_unit,
        calories: entry.calories,
        proteinG: entry.protein_g,
        carbsG: entry.carbs_g,
        fatsG: entry.fats_g,
        fiberG: entry.fiber_g,
        micronutrients: entry.micronutrients ?? {}
    }
}

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

    const context = useContext(userDataContext);
    if (!context) {
        throw new Error("UserDataProvider must be used within the app.");
    }
    const { userData } = context;

    // Which day of the food log is currently shown. Navigating weeks (see
    // goToPrevWeek/goToNextWeek below) lets the user reach any past day, not
    // just the current week.
    const [ selectedDate, setSelectedDate ] = useState<Dayjs>(() => dayjs())

    const [ toggleAddItem, setToggleAddItem] = useState(false)
    const [ addItemType, setAddItemType ] = useState<string | null>(null)

    const [ editingEntry, setEditingEntry ] = useState<FoodLogEntry | null>(null)
    const [ quickAddSource, setQuickAddSource ] = useState<FoodItem | null>(null)

    const [ entries, setEntries ] = useState<FoodLogEntry[]>([])
    const [ catalogItems, setCatalogItems ] = useState<FoodItem[]>([])
    const [ loadingCatalog, setLoadingCatalog ] = useState(false)

    const [ displayedMicronutrients, setDisplayedMicronutrients ] = useState<string[]>(ALL_MICRONUTRIENT_NAMES)
    const [ showSettings, setShowSettings ] = useState(false)

    const [ showMonthCalendar, setShowMonthCalendar ] = useState(false)
    const [ calendarMonth, setCalendarMonth ] = useState<Dayjs>(() => dayjs())
    const [ loggedDates, setLoggedDates ] = useState<Set<string>>(new Set())

    const [ goalState, setGoalState ] = useState<goalType>("Maintain")

    // Tracks whether the two calls the initial view depends on - today's food
    // log entries and the saved diet preferences (micronutrients + goal
    // state) - have resolved at least once. The page waits for both before
    // rendering, so it never flashes default values (e.g. "Maintain") that
    // then pop to the user's actual saved state a moment later.
    const [ entriesReady, setEntriesReady ] = useState(false)
    const [ preferencesReady, setPreferencesReady ] = useState(false)
    const initialLoading = !entriesReady || !preferencesReady

    const [ totalExpenditure, setTotalExpenditure ] = useState<number>(0)

    const [ weightKg ] = useState(Number(userData.weight) * config.POUND2KG)

    const today = useMemo(() => dayjs(), [])
    const weekStart = useMemo(() => selectedDate.startOf('week'), [selectedDate])
    const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart])
    const isCurrentWeek = weekStart.isSame(today.startOf('week'), 'day')
    const dateKey = selectedDate.format('YYYY-MM-DD')

    const microTargets = useMemo(
        () => getMicronutrientTargets(userData.gender, userData.age, displayedMicronutrients),
        [userData.gender, userData.age, displayedMicronutrients]
    )

    // Totals actually consumed for the selected day, derived from the logged
    // entries - feeds the macro bars, the micro bars, and the calorie ring.
    const consumed = useMemo(() => {
        const totals = { calories: 0, protein: 0, carbs: 0, fats: 0, micronutrients: {} as Record<string, number> }
        for (const entry of entries) {
            totals.calories += Number(entry.calories) || 0
            totals.protein += Number(entry.protein_g) || 0
            totals.carbs += Number(entry.carbs_g) || 0
            totals.fats += Number(entry.fats_g) || 0
            for (const [name, amount] of Object.entries(entry.micronutrients ?? {})) {
                totals.micronutrients[name] = (totals.micronutrients[name] ?? 0) + (Number(amount) || 0)
            }
        }
        return totals
    }, [entries])

    // Accurate equation for calculating the BMR of a man or woman without using body fat percentage (%)
    const Mifflin_St_Jeor_BMR = useCallback(() => {
        const height = Number(userData?.height)
        const age = Number(userData?.age)
        switch (userData.gender) {
            case "male":
                return (10 * (weightKg) + (6.25 * height) - (5 * age) + 5)

            case "female":
                return (10 * (weightKg) + (6.25 * height) - (5 * age) - 161)

            default:
                console.error("User's Gender is apparently alien: ", userData.gender)
                return 0
        }
    },[])

    const calcTotalExpenditure = useCallback(() => {
        const BMR = Mifflin_St_Jeor_BMR()
        console.log("Activity Number: ", userData.activity, "BMR: ", BMR)
        if (!userData?.activity) return
        return config.ActivityWeighting[userData.activity] * BMR
    }, [userData.activity, Mifflin_St_Jeor_BMR, config.ActivityWeighting])

    // Persists the goal state to the user's diet_config row so it's the
    // base state next time they load the diet page, on any device.
    async function saveGoalState(next: goalType) {
        try {
            await fetch("/api/diet/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ goalState: next })
            })
        } catch (err) {
            console.error("Failed to save goal state: ", err)
        }
    }

    function cycleGoalState() {
        let next: goalType

        switch(goalState) {
            case "Deficit":
                next = "Maintain"
                break;

            case "Maintain":
                next = "Surplus"
                break;

            case "Surplus":
                next = "Deficit"
                break;

            default:
                console.error("Improper Goal State Found: ", goalState)
                return
        }

        setGoalState(next)
        saveGoalState(next)
    }

    function goToPrevWeek() {
        setSelectedDate(weekStart.subtract(7, 'day'))
    }

    function goToNextWeek() {
        if (isCurrentWeek) return
        const next = weekStart.add(7, 'day')
        setSelectedDate(next.isAfter(today, 'day') ? today : next)
    }

    function closeAddPanel() {
        setToggleAddItem(false)
        setAddItemType(null)
        setQuickAddSource(null)
        setEditingEntry(null)
    }

    function openEntryForEdit(entry: FoodLogEntry) {
        setEditingEntry(entry)
        setAddItemType('edit')
        setToggleAddItem(true)
    }

    function openMonthCalendar() {
        setCalendarMonth(selectedDate)
        setShowMonthCalendar(true)
    }

    function selectDateFromCalendar(date: Dayjs) {
        setSelectedDate(date)
        setShowMonthCalendar(false)
    }

    function jumpToTodayFromCalendar() {
        setSelectedDate(dayjs())
        setShowMonthCalendar(false)
    }

    useEffect(() => {
        const stored = localStorage.getItem("TotalExpenditure");

        if (stored !== null) {
            setTotalExpenditure(Number(stored));
            return;
        }

        const expenditure = calcTotalExpenditure();
        setTotalExpenditure(Number(expenditure));
        localStorage.setItem("TotalExpenditure", String(expenditure));
    }, []);

    // Load the selected day's food log whenever the day changes. entriesReady
    // only ever flips true once (on the first completion, success or not) -
    // it gates the initial render, not every subsequent day change.
    useEffect(() => {
        let cancelled = false

        async function loadEntries() {
            try {
                const res = await fetch(`/api/diet/log?date=${dateKey}`)
                if (res.ok) {
                    const json = await res.json()
                    if (!cancelled) setEntries(json.entries ?? [])
                }
            } catch (err) {
                console.error("Failed to load food log entries: ", err)
            } finally {
                if (!cancelled) setEntriesReady(true)
            }
        }

        loadEntries()

        return () => { cancelled = true }
    }, [dateKey])

    // Load the user's saved micronutrient display preference and calorie
    // goal state (Deficit/Maintain/Surplus) once - the goal state becomes
    // the dial's base state on load instead of always starting at "Maintain".
    useEffect(() => {
        let cancelled = false

        async function loadPreferences() {
            try {
                const res = await fetch("/api/diet/preferences")
                if (res.ok) {
                    const json = await res.json()
                    if (cancelled) return
                    if (json.displayedMicronutrients) {
                        setDisplayedMicronutrients(json.displayedMicronutrients)
                    }
                    if (json.goalState) {
                        setGoalState(json.goalState)
                    }
                }
            } catch (err) {
                console.error("Failed to load diet preferences: ", err)
            } finally {
                if (!cancelled) setPreferencesReady(true)
            }
        }

        loadPreferences()

        return () => { cancelled = true }
    }, [])

    // Load the user's personal food catalog lazily, only once Quick Add is opened.
    useEffect(() => {
        if (addItemType !== 'quick') return

        let cancelled = false

        async function loadCatalog() {
            setLoadingCatalog(true)
            try {
                const res = await fetch("/api/diet/food-items")
                if (res.ok) {
                    const json = await res.json()
                    if (!cancelled) setCatalogItems(json.items ?? [])
                }
            } catch (err) {
                console.error("Failed to load food catalog: ", err)
            } finally {
                if (!cancelled) setLoadingCatalog(false)
            }
        }

        loadCatalog()

        return () => { cancelled = true }
    }, [addItemType])

    // Load which days have a food log entry for the visible calendar month,
    // only while the month calendar is open - re-fetches whenever the user
    // flips to a different month.
    useEffect(() => {
        if (!showMonthCalendar) return

        let cancelled = false

        async function loadSummary() {
            try {
                const res = await fetch(`/api/diet/log/summary?month=${calendarMonth.format('YYYY-MM')}`)
                if (res.ok) {
                    const json = await res.json()
                    if (!cancelled) setLoggedDates(new Set<string>(json.loggedDates ?? []))
                }
            } catch (err) {
                console.error("Failed to load food log summary: ", err)
            }
        }

        loadSummary()

        return () => { cancelled = true }
    }, [showMonthCalendar, calendarMonth])

    async function savePreferences(next: string[]) {
        setDisplayedMicronutrients(next)
        setShowSettings(false)
        try {
            await fetch("/api/diet/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayedMicronutrients: next })
            })
        } catch (err) {
            console.error("Failed to save diet preferences: ", err)
        }
    }

    async function handleCreateSubmit(values: FoodItemFormValues, opts: { saveToCatalog: boolean }) {
        try {
            const res = await fetch("/api/diet/log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: values.name,
                    servingQty: values.servingQty,
                    servingUnit: values.servingUnit,
                    calories: values.calories,
                    proteinG: values.proteinG,
                    carbsG: values.carbsG,
                    fatsG: values.fatsG,
                    fiberG: values.fiberG,
                    micronutrients: values.micronutrients,
                    logDate: dateKey,
                    foodItemId: quickAddSource?.id ?? null,
                    saveToCatalog: opts.saveToCatalog
                })
            })

            if (res.ok) {
                const json = await res.json()
                setEntries((prev) => [...prev, json.entry])
                closeAddPanel()
            } else {
                console.error("Failed to add food log entry")
            }
        } catch (err) {
            console.error("Failed to add food log entry: ", err)
        }
    }

    async function handleEditSubmit(values: FoodItemFormValues) {
        if (!editingEntry) return

        try {
            const res = await fetch(`/api/diet/log/${editingEntry.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: values.name,
                    servingQty: values.servingQty,
                    servingUnit: values.servingUnit,
                    calories: values.calories,
                    proteinG: values.proteinG,
                    carbsG: values.carbsG,
                    fatsG: values.fatsG,
                    fiberG: values.fiberG,
                    micronutrients: values.micronutrients
                })
            })

            if (res.ok) {
                const json = await res.json()
                setEntries((prev) => prev.map((entry) => (entry.id === json.entry.id ? json.entry : entry)))
                closeAddPanel()
            } else {
                console.error("Failed to update food log entry")
            }
        } catch (err) {
            console.error("Failed to update food log entry: ", err)
        }
    }

    async function handleDeleteEntry() {
        if (!editingEntry) return

        try {
            const res = await fetch(`/api/diet/log/${editingEntry.id}`, { method: "DELETE" })

            if (res.ok) {
                const deletedId = editingEntry.id
                setEntries((prev) => prev.filter((entry) => entry.id !== deletedId))
                closeAddPanel()
            } else {
                console.error("Failed to delete food log entry")
            }
        } catch (err) {
            console.error("Failed to delete food log entry: ", err)
        }
    }

    if (initialLoading) {
        return (
            <div className="mainWrapper">
                <div className={styles.pageLoadingContainer}>
                    <span className={styles.spinner} />
                </div>
            </div>
        )
    }

    return(
        <div className="mainWrapper">
            <div className={styles.mainContainer}>
                <div className={styles.daysDots}>
                    <button type="button" className={styles.todayButton} onClick={openMonthCalendar} aria-label="Open month calendar">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="3" y="5" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.6"/>
                            <path d="M3 9.75H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            <path d="M7.5 2.5V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            <path d="M16.5 2.5V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            <circle cx="8" cy="13.75" r="1.15" fill="currentColor"/>
                            <circle cx="12" cy="13.75" r="1.15" fill="currentColor"/>
                            <circle cx="16" cy="13.75" r="1.15" fill="currentColor"/>
                            <circle cx="8" cy="17.25" r="1.15" fill="currentColor"/>
                        </svg>
                    </button>
                    <button type="button" className={styles.weekNavButton} onClick={goToPrevWeek} aria-label="Previous week">‹</button>
                    <div className={styles.dayDial}>
                        {weekDates.map((date) => {
                            const isSelected = date.isSame(selectedDate, 'day')
                            const isToday = date.isSame(today, 'day')
                            return (
                                <button
                                    key={date.format('YYYY-MM-DD')}
                                    type="button"
                                    className={`${styles.dayPill} ${isSelected ? styles.selectedDay : ''} ${isToday ? styles.todayPill : ''}`}
                                    disabled={date.isAfter(today, 'day')}
                                    onClick={() => setSelectedDate(date)}
                                >
                                    <span className={styles.dayPillWeekday}>{WEEKDAY_LABELS[date.day()]}</span>
                                    <span className={styles.dayPillDate}>{date.format('D')}</span>
                                </button>
                            )
                        })}
                    </div>
                    <button type="button" className={styles.weekNavButton} onClick={goToNextWeek} disabled={isCurrentWeek} aria-label="Next week">›</button>
                </div>
                <div className={styles.foodIntakeDisplayContainer}>
                    <div className={styles.dailyFoodIntakeContainer}>
                        <p className={styles.dailyIntakeHeader}>{selectedDate.format('dddd')}</p>
                        <button onClick={()=>{ if (toggleAddItem) { closeAddPanel() } else { setToggleAddItem(true) } }}>
                            <svg width="30" height="38" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                        <FoodLogList entries={entries} onSelect={openEntryForEdit} />
                    </div>
                    {toggleAddItem?

                    <div className={styles.addFoodItemContainer}>
                        {addItemType === 'edit' && editingEntry ?

                            <FoodItemForm
                                mode="edit"
                                initialValues={entryToFormValues(editingEntry)}
                                onSubmit={handleEditSubmit}
                                onCancel={closeAddPanel}
                                onDelete={handleDeleteEntry}
                            />

                        : addItemType === "manual" ?
                            <>
                            <button type="button" className={styles.backButton} onClick={()=>setAddItemType(null)}>Back</button>
                            <FoodItemForm mode="create" onSubmit={handleCreateSubmit} onCancel={closeAddPanel} />
                            </>

                        : addItemType === "quick" ?
                            <>
                            <button type="button" className={styles.backButton} onClick={()=>{ setAddItemType(null); setQuickAddSource(null) }}>Back</button>
                            {quickAddSource ?
                                <QuickAddScaler
                                    item={quickAddSource}
                                    onSubmit={handleCreateSubmit}
                                    onCancel={() => setQuickAddSource(null)}
                                />
                            :
                                <div className={styles.catalogList}>
                                    {loadingCatalog ?
                                        <div className={styles.spinnerContainer}><span className={styles.spinner} /></div>
                                    : catalogItems.length === 0 ?
                                        <p>No saved items yet - add one manually and save it to your catalog.</p>
                                    :
                                        catalogItems.map((item) => (
                                            <button type="button" key={item.id} className={styles.catalogItemButton} onClick={() => setQuickAddSource(item)}>
                                                {item.name}
                                            </button>
                                        ))
                                    }
                                </div>
                            }
                            </>

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
                            <AnalyticsBar name={'Protein'} val={Math.round(consumed.protein)} total={Math.round(2.4*weightKg)} colour={"red"} measure={"g"} size={'normal'}/>
                            <AnalyticsBar name={'Carbohydrates'} val={Math.round(consumed.carbs)} total={Math.round((2100 - (2.4*(weightKg)*4 + Math.max(0.6*(weightKg), 0.2*2100/9)*9))/4)} colour={"red"} measure={"g"} size={'normal'}/>
                            <AnalyticsBar name={'Fats'} val={Math.round(consumed.fats)} total={Math.round(Math.max(0.6*(weightKg), 0.2*2100/9))} colour={"red"} measure={"g"} size={'normal'}/>

                            <div className={styles.microsHeaderRow}>
                                <p className={styles.dietAnalyticsHeaders}>Micros</p>
                                <button type="button" className={styles.settingsButton} onClick={() => setShowSettings(true)} aria-label="Choose displayed micronutrients">⚙</button>
                            </div>
                            {microTargets.map((nutrient) => (
                                <AnalyticsBar key={nutrient.name} name={nutrient.name} val={Math.round(consumed.micronutrients[nutrient.name] ?? 0)} total={nutrient.total} colour={"red"} measure={nutrient.measure} size={'small'}/>
                            ))}
                        </div>
                        <div className={styles.calorieContainer}>
                            <p className={styles.caloriesHeader}>Caloric Intake</p>
                            <p key={Math.round(consumed.calories)} className={styles.caloriesText}>{Math.round(consumed.calories)} kCal</p>
                            <CalorieTarget curr={consumed.calories} totalExpenditure={totalExpenditure} goal={goalState}/>
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
            {showSettings?
                <div className={styles.modalBackdrop} onClick={() => setShowSettings(false)}>
                    <div onClick={(e) => e.stopPropagation()}>
                        <MicronutrientSettings
                            selected={displayedMicronutrients}
                            onSave={savePreferences}
                            onClose={() => setShowSettings(false)}
                        />
                    </div>
                </div>
            : null}
            {showMonthCalendar?
                <div className={styles.modalBackdrop} onClick={() => setShowMonthCalendar(false)}>
                    <div onClick={(e) => e.stopPropagation()}>
                        <MonthCalendar
                            visibleMonth={calendarMonth}
                            selectedDate={selectedDate}
                            today={today}
                            loggedDates={loggedDates}
                            onSelectDate={selectDateFromCalendar}
                            onChangeMonth={setCalendarMonth}
                            onJumpToday={jumpToTodayFromCalendar}
                            onClose={() => setShowMonthCalendar(false)}
                        />
                    </div>
                </div>
            : null}
        </div>
    )
}
