'use client';

import Image from 'next/image';
import styles from './EmptyComponentGraphic.module.css'

export default function EmptyComponentGraphic({ text = "Add videos you see and they will show up here" }: { text?: string }) {
    return (
        <div className={styles.emptyComponentContainer}>
            {text}
            <Image src='/cobwebs.svg' alt="" width={200} height={200}/>
        </div>
    )
}
