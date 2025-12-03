"use client"

import styles from './AnalyticsBar.module.css'

type nutrienceProps = {
  name: string,
  val: number,
  colour: string,
  total: number,
  measure: string
  size?: "small" | "normal"
}

export default function AnalyticsBar({
  name,
  val,
  colour,
  total,
  measure,
  size = "small"
}: nutrienceProps) {
  return (
    <div className={`${styles.outerBarContainer} ${size=="small"? styles.smallBar : size=="normal"? styles.normalBar : undefined}`}>
      <div className={styles.barContainer} style={{"--barColour":`${colour}`} as React.CSSProperties}></div>
      <div className={styles.innerBarContainer} style={{"--barColour":`${colour}`, "--barSize":`${(val/total)*100}%`} as React.CSSProperties}></div>
      <p style={size=="small"? {fontSize: "13px"} : size=="normal"? {fontSize: "16px"} : undefined}>{name}: {val}/{total} {measure}</p>
    </div>
  )
}