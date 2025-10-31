
'use client';

import styles from './EmptyComponentGraphic.module.css'

export default function EmptyComponentGraphic() {
    return (
        <div className={styles.emptyComponentContainer}>
            Add videos you see and they will show up here
            <img src='/Cobwebs.svg' width={"200px"} height={"200px"}/>
        </div>
    )
}