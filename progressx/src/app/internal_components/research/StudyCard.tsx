import styles from './studycard.module.css'  
import base64url from 'base64url'

export default function StudyCard({ id, title, journal, callbackFunc }: { id: string, title: string, journal: string, callbackFunc: Function }) {
    return (
        <div className={styles.cardContainer} onClick={() => callbackFunc(`/research/doc/${base64url.encode(id)}`)}>
            <p className={styles.title}>{title}</p>
            <p className={styles.journal}>{journal}</p>
        </div>
    )
}