"use client"

import styles from './loadingScreen.module.css'
import { useContext } from 'react'
import { IsLoadingContext } from '../contexts/isLoading'

export default function LoadingScreen(){

    const { isLoading, setIsLoading} = useContext(IsLoadingContext)

    return(
        isLoading? (
            <>
            <div className={styles.backdropBlur}></div>
            <div className={styles.loadingContainer}>
                <div className={styles.loader}></div>
            </div>
            </>
        ) : (null)
    )
}