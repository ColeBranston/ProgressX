import styles from './studycard.module.css'  
import base64url from 'base64url'

export default function StudyCard({ id, title, journal, callbackFunc }: { id: string, title: string, journal: string, callbackFunc: CallableFunction }) {
    return (
        <div className={styles.cardContainer} onClick={() => callbackFunc(`/research/doc/${base64url.encode(id)}`)}>
            <div className={styles.journalContainer}><p className={styles.journal}>{journal}</p></div>
            <div className={styles.loremContainer}><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque semper magna nec lacus interdum viverra. Sed quis dictum massa. Phasellus vel odio auctor, accumsan eros sed, ultrices lorem. Donec cursus a mauris quis interdum. Suspendisse consectetur aliquam sem egestas malesuada. Sed sed dui mi. Praesent faucibus leo lorem, sit amet molestie massa placerat at. In eget quam eu orci tristique egestas. In placerat arcu efficitur ex feugiat, non efficitur mauris sollicitudin. Nulla at enim massa. Curabitur nec leo sit amet velit laoreet vulputate sit amet non velit.</p></div>
            <div className={styles.titleContainer}><p className={styles.title}>{title}</p></div>
        </div>
    )
}