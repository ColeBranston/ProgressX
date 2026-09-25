"use client";

import { Dayjs } from 'dayjs'
import styles from './MonthCalendar.module.css'

type MonthCalendarProps = {
    visibleMonth: Dayjs
    selectedDate: Dayjs
    today: Dayjs
    loggedDates: Set<string>
    onSelectDate: (date: Dayjs) => void
    onChangeMonth: (next: Dayjs) => void
    onJumpToday: () => void
    onClose: () => void
}

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Full month grid showing every day, with a dot marking days that have a
// food log entry so the user can see logged vs. skipped days at a glance.
// Clicking a day jumps the diet page to it and closes the calendar.
export default function MonthCalendar({
    visibleMonth,
    selectedDate,
    today,
    loggedDates,
    onSelectDate,
    onChangeMonth,
    onJumpToday,
    onClose
}: MonthCalendarProps) {
    const monthStart = visibleMonth.startOf('month')
    const gridStart = monthStart.startOf('week')
    const days = Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'))
    const isCurrentMonth = visibleMonth.isSame(today, 'month')

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <button type="button" className={styles.navButton} onClick={() => onChangeMonth(visibleMonth.subtract(1, 'month'))} aria-label="Previous month">‹</button>
                <p className={styles.monthLabel}>{visibleMonth.format('MMMM YYYY')}</p>
                <button type="button" className={styles.navButton} onClick={() => onChangeMonth(visibleMonth.add(1, 'month'))} disabled={isCurrentMonth} aria-label="Next month">›</button>
            </div>

            <div className={styles.weekdayRow}>
                {WEEKDAY_HEADERS.map((label, i) => (
                    <span key={i}>{label}</span>
                ))}
            </div>

            <div className={styles.grid}>
                {days.map((date) => {
                    const key = date.format('YYYY-MM-DD')
                    const inMonth = date.isSame(monthStart, 'month')
                    const isFuture = date.isAfter(today, 'day')
                    const isSelected = date.isSame(selectedDate, 'day')
                    const isToday = date.isSame(today, 'day')
                    const hasLog = loggedDates.has(key)

                    return (
                        <button
                            type="button"
                            key={key}
                            className={[
                                styles.dayCell,
                                !inMonth ? styles.outsideMonth : '',
                                isToday ? styles.todayCell : '',
                                isSelected ? styles.selectedCell : ''
                            ].join(' ').trim()}
                            disabled={isFuture}
                            onClick={() => onSelectDate(date)}
                        >
                            <span>{date.format('D')}</span>
                            {hasLog ? <span className={styles.logDot} /> : null}
                        </button>
                    )
                })}
            </div>

            <div className={styles.footer}>
                <button type="button" className={styles.todayLink} onClick={onJumpToday}>Jump to today</button>
                <button type="button" className={styles.closeButton} onClick={onClose}>Close</button>
            </div>
        </div>
    )
}
