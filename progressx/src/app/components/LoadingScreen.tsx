"use client"

import styles from './loadingScreen.module.css'
import '../global.css'
import { useContext } from 'react'
import { IsLoadingContext } from '../contexts/isLoading'

export default function LoadingScreen(){

    const { isLoading, setIsLoading} = useContext(IsLoadingContext)

    return(
        isLoading? (
            <div><p className={styles.loadingText}>Loading Screen Triggered</p></div>
        ) : (null)
    )
}