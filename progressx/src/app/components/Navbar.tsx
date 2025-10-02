"use client";

import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation";
import styles from './navbar.module.css';

export default function Navbar(){
    const router = useRouter()
    const pathname = usePathname()
    
    return(
    <div className={styles.navBar}>
        <div className="mainLogo">
          <span className="progress">Progress</span>
          <span className="X">X</span>
        </div>
        <div>
          <form>
            <input className={styles.searchbar} type={"search"}></input>
          </form>
          <ul className={styles.navbarList}>
            <li className={pathname == "/" ? styles.active : ""} onClick={()=>{router.push("/")}}>For You</li>
            <li className={pathname == "/research" ? styles.active : ""} onClick={()=>{router.push("/research")}}>Research</li>
            <li className={pathname == "/following" ? styles.active : ""} onClick={()=>{router.push("/following")}}>Following</li>
            <li className={pathname == "/upload" ? styles.active : ""} onClick={()=>{router.push("/upload")}}>Upload</li>
            <li className={pathname == "/mystats" ? styles.active : ""} onClick={()=>{router.push("/mystats")}}>MyStats</li>
            <li className={pathname == "/profile" ? styles.active : ""} onClick={()=>{router.push("/profile")}}>Profile</li>
          </ul>
        </div>
      </div>)
}