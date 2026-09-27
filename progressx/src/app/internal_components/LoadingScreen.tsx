"use client"

import styles from './loadingScreen.module.css'
import { useContext } from 'react'
import { IsLoadingContext } from '../contexts/isLoading'

export default function LoadingScreen(){

    const { isLoading } = useContext(IsLoadingContext)

    return(
        isLoading? (
            <div className={styles.loadingContainer} role="status" aria-label="Loading">
                <div className={styles.loader}></div>
            </div>
        ) : (null)
    )
}