"use client";

import { useContext, useEffect, useMemo, useState } from 'react';
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
    FoodAssistant,
    FoodItemFormValues,
    FoodLogEntry,
    FoodItem,
    WaterTracker,
    WaterLogEntry,
    formatVolume,
    getWaterTargetMl,
    DailyScore,
    ScoreCategory,
    getScoreCategories,
    getMacroTargets,
    getCalorieTarget,
    getTotalExpenditure,
    weightKgFromProfile
} from "../../internal_components/index"
import { userDataContext } from '@/app/contexts/userData';
import WeightCheckIn from '@/app/internal_components/weight/WeightCheckIn';
import { backdrop, pressable } from "@/app/internal_components/a11y";

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

type StatCardProps = {
    label: string,
    value: string,
    unit?: string,
    detail: string,
    fraction?: number,
    accent?: "red" | "water"
}

function StatCard({ label, value, unit, detail, fraction, accent = "red" }: StatCardProps) {
    return (
        <div className={`${styles.statCard} ${accent === "water" ? styles.statCardWater : ""}`}>
            <p className={styles.statLabel}>{label}</p>
            <p className={styles.statValue}>{value}{unit ? <span className={styles.statUnit}> {unit}</span> : null}</p>
            <p className={styles.statDetail}>{detail}</p>
            {fraction !== undefined ?
                <div className={styles.statBar}>
                    <div className={styles.statBarFill} style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }} />
                </div>
            : null}
        </div>
    )
}

export default function DietPage() {

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
    const [ waterEntries, setWaterEntries ] = useState<WaterLogEntry[]>([])
    const [ customWaterGoalMl, setCustomWaterGoalMl ] = useState<number | null>(null) // set in Settings
    const [ waterReady, setWaterReady ] = useState(false)
    const [ entriesReady, setEntriesReady ] = useState(false)
    const [ preferencesReady, setPreferencesReady ] = useState(false)
    const initialLoading = !entriesReady || !preferencesReady || !waterReady

    // Derived from userData on every render - userData is loaded from localStorage
    // after the first render, so reading it once at mount gave 0 / NaN targets.
    const weightKg = weightKgFromProfile(userData)

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

    const totalExpenditure = useMemo(
        () => getTotalExpenditure(userData),
        [userData]
    )

    const recommendedWaterMl = useMemo(
        () => getWaterTargetMl({ weightLbs: userData.weight, gender: userData.gender, activity: userData.activity }),
        [userData.weight, userData.gender, userData.activity]
    )
    const waterTargetMl = customWaterGoalMl ?? recommendedWaterMl
    const waterConsumedMl = waterEntries.reduce((sum, entry) => sum + (Number(entry.amount_ml) || 0), 0)

    const { protein: proteinTarget, carbs: carbsTarget, fats: fatsTarget } = getMacroTargets(weightKg, getCalorieTarget(totalExpenditure, goalState))
    const isToday = selectedDate.isSame(today, 'day')

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

    // Load the selected day's water log whenever the day changes (same pattern as the food log below)
    useEffect(() => {
        let cancelled = false

        async function loadWater() {
            try {
                const res = await fetch(`/api/diet/water?date=${dateKey}`)
                if (res.ok) {
                    const json = await res.json()
                    if (!cancelled) {
                        setWaterEntries(json.entries ?? [])
                        setCustomWaterGoalMl(typeof json.customGoalMl === "number" ? json.customGoalMl : null)
                    }
                } else if (!cancelled) {
                    setWaterEntries([])
                }
            } catch (err) {
                console.error("Failed to load water log entries: ", err)
            } finally {
                if (!cancelled) setWaterReady(true)
            }
        }

        loadWater()

        return () => { cancelled = true }
    }, [dateKey])

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

    // Water is added optimistically so the droplet reacts instantly; the
    // temporary entry is swapped for the saved one, or removed if saving fails.
    async function addWater(amountMl: number) {
        const tempId = `temp-${crypto.randomUUID()}`
        const optimistic: WaterLogEntry = {
            id: tempId,
            user_id: "",
            log_date: dateKey,
            amount_ml: amountMl,
            created_at: new Date().toISOString()
        }
        setWaterEntries((prev) => [...prev, optimistic])

        try {
            const res = await fetch("/api/diet/water", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amountMl, logDate: dateKey })
            })

            if (!res.ok) throw new Error(`status ${res.status}`)

            const json = await res.json()
            setWaterEntries((prev) => prev.map((entry) => (entry.id === tempId ? json.entry : entry)))
        } catch (err) {
            console.error("Failed to add water: ", err)
            setWaterEntries((prev) => prev.filter((entry) => entry.id !== tempId))
        }
    }

    async function undoWater(entry: WaterLogEntry) {
        if (entry.id.startsWith("temp-")) return // still saving

        setWaterEntries((prev) => prev.filter((e) => e.id !== entry.id))

        try {
            const res = await fetch(`/api/diet/water/${entry.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(`status ${res.status}`)
        } catch (err) {
            console.error("Failed to undo water: ", err)
            setWaterEntries((prev) => [...prev, entry].sort((a, b) => a.created_at.localeCompare(b.created_at)))
        }
    }

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
        if (await addEntry(values, opts)) closeAddPanel()
    }

    // Logs a food for the selected day; true once it's saved. The assistant uses this directly so the
    // chat stays open (one message can produce several foods to add).
    async function addEntry(values: FoodItemFormValues, opts: { saveToCatalog: boolean }): Promise<boolean> {
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
                return true
            }
            console.error("Failed to add food log entry")
        } catch (err) {
            console.error("Failed to add food log entry: ", err)
        }
        return false
    }

    async function handleEditSubmit(values: FoodItemFormValues, opts: { saveToCatalog: boolean }) {
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
                    micronutrients: values.micronutrients,
                    saveToCatalog: opts.saveToCatalog
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

    // The Food Log bookmark: saves a logged food to the quick-add catalog, or removes it again.
    // Removing only deletes the catalog item - logged entries always stay.
    const [ savingToCatalog, setSavingToCatalog ] = useState<Set<string>>(new Set())

    async function toggleEntryInCatalog(target: FoodLogEntry) {
        setSavingToCatalog((prev) => new Set(prev).add(target.id))
        const sameFood = (entry: FoodLogEntry) => entry.name.trim().toLowerCase() === target.name.trim().toLowerCase()

        try {
            if (target.catalog_item_id) {
                const removedId = target.catalog_item_id
                const res = await fetch(`/api/diet/food-items/${removedId}`, { method: "DELETE" })
                if (!res.ok) throw new Error(`status ${res.status}`)
                setEntries((prev) => prev.map((entry) => (
                    entry.catalog_item_id === removedId ? { ...entry, catalog_item_id: null, food_item_id: entry.food_item_id === removedId ? null : entry.food_item_id } : entry
                )))
            } else {
                const res = await fetch(`/api/diet/log/${target.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ saveToCatalog: true })
                })
                if (!res.ok) throw new Error(`status ${res.status}`)
                const json = await res.json()
                // other entries of the same food that day are now in Quick Add too
                setEntries((prev) => prev.map((entry) => (
                    entry.id === json.entry.id ? json.entry : sameFood(entry) ? { ...entry, catalog_item_id: json.entry.catalog_item_id } : entry
                )))
            }
        } catch (err) {
            console.error("Failed to update Quick Add: ", err)
        } finally {
            setSavingToCatalog((prev) => {
                const next = new Set(prev)
                next.delete(target.id)
                return next
            })
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

    const scoreCategories: ScoreCategory[] = getScoreCategories(
        { ...consumed, waterMl: waterConsumedMl },
        {
            totalExpenditure,
            goal: goalState,
            macros: { protein: proteinTarget, carbs: carbsTarget, fats: fatsTarget },
            waterMl: waterTargetMl,
            micros: microTargets,
        }
    )

    if (initialLoading) {
        return (
            <div className={`mainWrapper ${styles.dietWrapper}`}>
                <div className={styles.pageLoadingContainer} role="status" aria-label="Loading your diet">
                    <span className={styles.spinner} />
                </div>
            </div>
        )
    }

    return(
        <div className={`mainWrapper ${styles.dietWrapper}`}>
            <div className={styles.mainContainer}>
                <header className={styles.pageHeader}>
                    <div className={styles.pageTitleGroup}>
                        <h1 className={styles.pageTitle}>{isToday ? "Today" : selectedDate.format('dddd')}</h1>
                        <p className={styles.pageDate}>{selectedDate.format('dddd, MMMM D, YYYY')}</p>
                    </div>
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
                </header>

                <section className={styles.statStrip} aria-label="Daily summary">
                    <div className={styles.scoreSlot}>
                        <DailyScore categories={scoreCategories} isToday={isToday} />
                    </div>
                    <StatCard
                        label="Calories"
                        value={Math.round(consumed.calories).toLocaleString()}
                        unit="kCal"
                        detail={totalExpenditure ? `of ~${totalExpenditure.toLocaleString()} burned` : "Add your details to estimate burn"}
                        fraction={totalExpenditure ? consumed.calories / totalExpenditure : 0}
                    />
                    <StatCard
                        label="Protein"
                        value={String(Math.round(consumed.protein))}
                        unit="g"
                        detail={proteinTarget ? `of ${proteinTarget} g target` : "Add your weight for a target"}
                        fraction={proteinTarget ? consumed.protein / proteinTarget : 0}
                    />
                    <StatCard
                        label="Water"
                        value={formatVolume(waterConsumedMl)}
                        detail={`of ${formatVolume(waterTargetMl)} goal`}
                        fraction={waterConsumedMl / waterTargetMl}
                        accent="water"
                    />
                    <StatCard
                        label="Logged"
                        value={String(entries.length)}
                        unit={entries.length === 1 ? "food" : "foods"}
                        detail={`${waterEntries.length} ${waterEntries.length === 1 ? "drink" : "drinks"} ${isToday ? "today" : "this day"}`}
                    />
                </section>

                <div className={styles.dashboardGrid}>
                    <section className={`${styles.card} ${styles.foodCard}`}>
                        <div className={styles.cardHeader}>
                            <div>
                                <p className={styles.cardTitle}>Food Log</p>
                                <p className={styles.cardSubtitle}>{selectedDate.format('dddd')}</p>
                            </div>
                            <button
                                type="button"
                                className={`${styles.addFoodButton} ${toggleAddItem ? styles.addFoodButtonOpen : ""}`}
                                onClick={()=>{ if (toggleAddItem) { closeAddPanel() } else { setToggleAddItem(true) } }}
                                aria-label={toggleAddItem ? "Close add food" : "Add food"}
                            >
                                <svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>{toggleAddItem ? "Close" : "Add food"}</span>
                            </button>
                        </div>
                        <div className={styles.cardBody}>
                            {toggleAddItem?
                                <div className={styles.addPanel}>
                                    {addItemType === 'edit' && editingEntry ?

                                        <FoodItemForm
                                            mode="edit"
                                            initialValues={entryToFormValues(editingEntry)}
                                            onSubmit={handleEditSubmit}
                                            onCancel={closeAddPanel}
                                            onDelete={handleDeleteEntry}
                                            alreadyInCatalog={Boolean(editingEntry.catalog_item_id)}
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
                                            <>
                                            <FoodAssistant dateKey={dateKey} onAdd={addEntry} />
                                            <p className={styles.catalogHeading}>Saved foods</p>
                                            <div className={`${styles.catalogList} ${styles.catalogListCompact}`}>
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
                                            </>
                                        }
                                        </>

                                    :
                                    <>
                                        <div className={styles.addFoodItemButtons} {...pressable(()=>setAddItemType("manual"))}>
                                            <p>Add Manually</p>
                                        </div>
                                        <div className={styles.addFoodItemButtons} {...pressable(()=>setAddItemType("quick"))}>
                                            <p>Quick Add</p>
                                        </div>
                                    </>
                                    }
                                </div>
                            :
                                <FoodLogList entries={entries} onSelect={openEntryForEdit} onToggleCatalog={toggleEntryInCatalog} savingIds={savingToCatalog} />
                            }
                        </div>
                    </section>

                    <section className={`${styles.card} ${styles.calorieCard}`}>
                        <div className={styles.cardHeader}>
                            <div>
                                <p className={styles.cardTitle}>Caloric Intake</p>
                                <p key={Math.round(consumed.calories)} className={styles.caloriesText}>{Math.round(consumed.calories)} kCal</p>
                            </div>
                        </div>
                        <div className={styles.calorieBody}>
                            <CalorieTarget curr={consumed.calories} totalExpenditure={totalExpenditure} goal={goalState}/>
                            <button type="button" onClick={cycleGoalState} className={styles.customButton} aria-label={`Calorie goal: ${goalState}. Click to change`}>
                                <ul>
                                    <li style={{height: "15px", width: "15px"}} className={goalState=='Surplus'? styles.highlightedGoalItem : undefined}/>
                                    <li style={{height: "12.5px", width: "12.5px"}} className={goalState=='Maintain'? styles.highlightedGoalItem : undefined}/>
                                    <li style={{height: "10px", width: "10px"}} className={goalState=='Deficit'? styles.highlightedGoalItem : undefined}/>
                                </ul>
                                <p>{goalState}</p>
                            </button>
                        </div>
                    </section>

                    <section className={`${styles.card} ${styles.waterCard}`}>
                        <WaterTracker entries={waterEntries} targetMl={waterTargetMl} isCustomGoal={customWaterGoalMl !== null} onAdd={addWater} onUndo={undoWater} />
                    </section>

                    <section className={`${styles.card} ${styles.weightCard}`} aria-label="Weigh-in">
                        <WeightCheckIn dateKey={dateKey} isToday={isToday} />
                    </section>

                    <section className={`${styles.card} ${styles.nutritionCard}`}>
                        <p className={styles.cardTitle}>Macros</p>
                        <div className={styles.macroRow}>
                            <AnalyticsBar name={'Protein'} val={Math.round(consumed.protein)} total={proteinTarget} colour={"red"} measure={"g"} size={'normal'}/>
                            <AnalyticsBar name={'Carbohydrates'} val={Math.round(consumed.carbs)} total={carbsTarget} colour={"red"} measure={"g"} size={'normal'}/>
                            <AnalyticsBar name={'Fats'} val={Math.round(consumed.fats)} total={fatsTarget} colour={"red"} measure={"g"} size={'normal'}/>
                        </div>

                        <div className={styles.microsHeaderRow}>
                            <p className={styles.cardTitle}>Micros</p>
                            <button type="button" className={styles.settingsButton} onClick={() => setShowSettings(true)} aria-label="Choose displayed micronutrients">⚙</button>
                        </div>
                        <div className={styles.microGrid}>
                            {microTargets.map((nutrient) => {
                                const val = Math.round(consumed.micronutrients[nutrient.name] ?? 0)
                                // limits (sodium) read "x/2300 mg max" and turn amber once you're over
                                const isLimit = nutrient.kind === "limit"
                                return (
                                    <AnalyticsBar
                                        key={nutrient.name}
                                        name={nutrient.name}
                                        val={val}
                                        total={nutrient.total}
                                        colour={isLimit && val > nutrient.total ? "#ff9f0a" : "red"}
                                        measure={isLimit ? `${nutrient.measure} max` : nutrient.measure}
                                        size={'small'}
                                    />
                                )
                            })}
                        </div>
                    </section>
                </div>
            </div>
            {showSettings?
                <div className={styles.modalBackdrop} {...backdrop(() => setShowSettings(false))}>
                    <div>
                        <MicronutrientSettings
                            selected={displayedMicronutrients}
                            onSave={savePreferences}
                            onClose={() => setShowSettings(false)}
                        />
                    </div>
                </div>
            : null}
            {showMonthCalendar?
                <div className={styles.modalBackdrop} {...backdrop(() => setShowMonthCalendar(false))}>
                    <div>
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
