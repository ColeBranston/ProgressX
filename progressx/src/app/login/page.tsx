"use client";

import styles from './page.module.css';
import { useState } from 'react';
import { useRouter } from "next/navigation";

export default function Login() {
    const [loginActive, setLoginActive] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [tempPassword, setTempPassword] = useState('')
    const router = useRouter();


    async function SignUpForm(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
    
      if (password === tempPassword) {
        try {
          const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: email,
              password: password,
            }),
          });
    
          if (!res.ok) {
            const errorText = await res.text();
            console.error(`Signup failed (${res.status}): ${errorText}`);
            alert("Signup failed. Check console for details.");
            return;
          }
    
          const data = await res.json();
          console.log("Signup success:", data);

          setLoginActive(false)
    
        } catch (err) {
          console.error("Fetch error:", err);
          alert("Network error while signing up.");
        }
      } else {
        alert("Passwords don't match");
      }
    
      console.log("sign up form submitted");
    }
    
    async function LoginForm(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
    
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email: email,
            password: password,
          }),
        });
    
        if (!res.ok) {
          const errorText = await res.text();
          console.error(`Login failed (${res.status}): ${errorText}`);
          alert("Login failed. Check console for details.");
          return;
        }
    
        const data = await res.json();
        console.log("Login success:", data);
        
        router.push("/");
    
      } catch (err) {
        console.error("Fetch error:", err);
        alert("Network error while logging in.");
      }
    
      console.log("login form submitted");
    }
    

  return (
    loginActive?
    (<div className={styles.mainContainer}>
        <div className="mainLogo">
          <span className="progress">Progress</span>
          <span className="X">X</span>
        </div>
          <form onSubmit={SignUpForm} className={styles.loginFormContainer}>
              <p className={styles.signInHeader}>Sign Up</p>
              <div className={styles.loginRedirectContainer} onClick={() => {setLoginActive(!loginActive)}}>
                  <p className={styles.loginHeader}>Log In</p>
                  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="5,3 15,10 5,17" fill="none" stroke="rgba(var(--primary-color))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              </div>
              <input required className={styles.inputField} placeholder='Email' type="email" onChange={(e)=>{setEmail(e.target.value)}}/>
              <input required className={styles.inputField} placeholder='Password' type="password" onChange={(e)=>{setPassword(e.target.value)}}/>
              <input required className={styles.inputField} placeholder='Confirm Password' type="password" onChange={(e)=>{setTempPassword(e.target.value)}}/>
              <button className={styles.submitButton} type="submit">Sign Up</button>
              <div className={styles.disclaimerContainer}>
                  <p>By continuing you confirm you have read and accept ProgressX&apos;s <a className={styles.disclaimerLinks} href=''>privacy policy</a> and <a className={styles.disclaimerLinks} href=''>terms & conditions</a></p>
              </div>
          </form>
      </div>) 
      
      : 
      
      (<div className={styles.mainContainer}>
        <div className="mainLogo">
          <span className="progress">Progress</span>
          <span className="X">X</span>
        </div>
          <form onSubmit={LoginForm} className={styles.loginFormContainer}>
              <p className={styles.signInHeader}>Login</p>
              <div className={styles.loginRedirectContainer} onClick={() => {setLoginActive(!loginActive)}}>
                  <p className={styles.loginHeader}>Sign Up</p>
                  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="5,3 15,10 5,17" fill="none" stroke="rgba(var(--primary-color))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              </div>
              <input required className={styles.inputField} placeholder='Email' type="email" onChange={(e)=>{setEmail(e.target.value)}}/>
              <input required className={styles.inputField} placeholder='Password' type="password" onChange={(e)=>{setPassword(e.target.value)}}/>
              <button className={styles.submitButton} type="submit">Log In</button>
          </form>
      </div>)
  );
}
