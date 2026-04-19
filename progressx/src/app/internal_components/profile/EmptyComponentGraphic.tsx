
'use client';

import Image from 'next/image';
import styles from './EmptyComponentGraphic.module.css'

export default function EmptyComponentGraphic() {
    return (
        <div className={styles.emptyComponentContainer}>
            Add videos you see and they will show up here
            <Image src='/Cobwebs.svg' alt="Cobwebs Graphic" width={200} height={200}/>
        </div>
    )
}