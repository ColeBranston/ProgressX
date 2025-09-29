"use client";

import styles from './page.module.css';
import '../global.css';
import { useState } from 'react';

export default function Login() {
  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); 
    console.log("form submitted");
  }

  const [loginActive, setLoginActive] = useState(true)

  return (
    loginActive?
    (<div className={styles.mainContainer}>
        <div className="mainLogo">
          <span className="progress">Progress</span>
          <span className="X">X</span>
        </div>
          <form onSubmit={submitForm} className={styles.loginFormContainer}>
              <p className={styles.signInHeader}>Sign Up</p>
              <div className={styles.loginRedirectContainer} onClick={() => {setLoginActive(!loginActive)}}>
                  <p className={styles.loginHeader}>Log In</p>
                  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="5,3 15,10 5,17" fill="none" stroke="rgba(var(--primary-color))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              </div>
              <input className={styles.inputField} placeholder='Email' type="email" />
              <input className={styles.inputField} placeholder='Password' type="password" />
              <input className={styles.inputField} placeholder='Confirm Password' type="password" />
              <button className={styles.submitButton} type="submit">Sign Up</button>
              <div className={styles.disclaimerContainer}>
                  <p>By continuing you confirm you have read and accept ProgressX's <a className={styles.disclaimerLinks} href=''>privacy policy</a> and <a className={styles.disclaimerLinks} href=''>terms & conditions</a></p>
              </div>
          </form>
      </div>) 
      
      : 
      
      (<div className={styles.mainContainer}>
        <div className="mainLogo">
          <span className="progress">Progress</span>
          <span className="X">X</span>
        </div>
          <form onSubmit={submitForm} className={styles.loginFormContainer}>
              <p className={styles.signInHeader}>Login</p>
              <div className={styles.loginRedirectContainer} onClick={() => {setLoginActive(!loginActive)}}>
                  <p className={styles.loginHeader}>Sign Up</p>
                  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="5,3 15,10 5,17" fill="none" stroke="rgba(var(--primary-color))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              </div>
              <input className={styles.inputField} placeholder='Email' type="email" />
              <input className={styles.inputField} placeholder='Password' type="password" />
              <button className={styles.submitButton} type="submit">Log In</button>
          </form>
      </div>)
  );
}
