"use client";

import { useRouter } from 'next/navigation';
import styles from './page.module.css';
export default function Homepage() {

  const router = useRouter()

  return (
    
  <div className={styles.mainContainer}>
    <div className={styles.videoDisplay}>this is the video display is the video display</div>
    <div className={styles.sideMisc}>This is the side bar</div>
  </div>
  );
}
