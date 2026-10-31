import styles from "../../internal_pages/profile.module.css";
import ProfileSkeleton from "../../internal_components/profile/ProfileSkeleton";

// Your profile and other people's (profile/[username]) while the page comes from the server
export default function Loading() {
    return (
        <div className="mainWrapper">
            <div className={styles.mainContainer}>
                <ProfileSkeleton />
            </div>
        </div>
    )
}
