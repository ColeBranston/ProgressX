import styles from "../../internal_pages/profile.module.css"
import own from "./profileskeleton.module.css"
import { Bone, Circle, SkeletonStatus } from "../skeleton/Skeleton"

// Someone's profile while it loads: picture, name, counts and bio in the real header layout, then the
// tabs and a row of video tiles
export default function ProfileSkeleton() {
    return (
        <SkeletonStatus label="Loading profile" className={own.skeleton}>
            <div className={styles.profileHeaderContainer}>
                <Circle size={180} className={own.photo} />
                <div className={`${styles.profileInfoContainer} ${own.info}`}>
                    <div className={styles.profileInfoRow}>
                        <Bone width={180} height={30} />
                        <Bone width={64} height={22} radius={99} />
                    </div>
                    <div className={styles.profileInfoRow}>
                        <Bone width={110} height={36} radius={10} />
                        <Bone width={36} height={36} radius={10} />
                    </div>
                    <div className={styles.profileInfoRow}>
                        {Array.from({ length: 3 }, (_, i) => <Bone key={i} width={90} height={20} />)}
                    </div>
                    <Bone width={300} height={14} />
                </div>
            </div>
            <div className={own.tabs}>
                {Array.from({ length: 4 }, (_, i) => <Bone key={i} width={110} height={24} />)}
            </div>
            <div className={own.tiles}>
                {Array.from({ length: 5 }, (_, i) => <Bone key={i} width="100%" radius={14} className={own.tile} />)}
            </div>
        </SkeletonStatus>
    )
}
