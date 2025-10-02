"use client";

import styles from './page.module.css';
import { useContext, useEffect, useState } from 'react';
import { useRouter } from "next/navigation";
import { IsLoadingContext } from '../contexts/isLoading';

export default function Login() {
    const [loginActive, setLoginActive] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [tempPassword, setTempPassword] = useState('')
    const router = useRouter();
    const { isLoading, setIsLoading} = useContext(IsLoadingContext)


    useEffect(() => {
      console.log("Searching for token: ")
      if (window.location.hash){
        setIsLoading(true)

        console.log("token found")
        const tokens = window.location.hash.substring(1)
        const googleToken = new URLSearchParams(tokens).get("access_token")
        console.log(googleToken)
        try {
          async function tokenClean(googleToken: String){
            const res = await fetch("http://localhost:3000/api/auth/login/google", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                token: googleToken
              }),
            });
      
            if (!res.ok) {
              const errorText = await res.text();
              console.error(`Signup failed (${res.status}): ${errorText}`);
              alert("Signup failed. Check console for details.");
              return;
            }

            console.log("google token set")
            
            setIsLoading(false)

            router.push("/")
          
          
          }
          if (googleToken) {
            tokenClean(googleToken)
          }
          
      }catch(e) {
        console.log("Error sending google token")
      }}
    },[])

    async function SignUpForm(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
    
      if (password === tempPassword) {
        try {
          setIsLoading(true)
          
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

            setIsLoading(false)

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

      setIsLoading(false)

      console.log("sign up form submitted");
    }
    
    async function LoginForm(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
    
      try {
        setIsLoading(true)

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

          setIsLoading(false)
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
      setIsLoading(false)

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
              <p className={styles.orText}>Or</p>
              <a href='/api/auth/login/google' className={styles.googleText}>
                <div className={styles.googleAuthButton}>
                  <svg viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid"><path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"/><path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"/><path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"/><path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"/></svg>
                  <p>Sign in with Google</p>
                </div>
              </a>
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
              <p className={styles.signInHeader}>Log In</p>
              <div className={styles.loginRedirectContainer} onClick={() => {setLoginActive(!loginActive)}}>
                  <p className={styles.loginHeader}>Sign Up</p>
                  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <polyline points="5,3 15,10 5,17" fill="none" stroke="rgba(var(--primary-color))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              </div>
              <input required className={styles.inputField} placeholder='Email' type="email" onChange={(e)=>{setEmail(e.target.value)}}/>
              <input required className={styles.inputField} placeholder='Password' type="password" onChange={(e)=>{setPassword(e.target.value)}}/>
              <button className={styles.submitButton} type="submit">Log In</button>
              <div className={styles.forgotPasswordContainer}>
                <a href=''>Forgot Password?</a>
              </div>
              <p className={styles.orText}>Or</p>
              <a href='/api/auth/login/google' className={styles.googleText}>
                <div className={styles.googleAuthButton}>
                  <svg viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid"><path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"/><path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"/><path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"/><path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"/></svg>
                  <p>Sign in with Google</p>
                </div>
              </a>
              <div className={styles.disclaimerContainer}>
                  <p>By continuing you confirm you have read and accept ProgressX&apos;s <a className={styles.disclaimerLinks} href=''>privacy policy</a> and <a className={styles.disclaimerLinks} href=''>terms & conditions</a></p>
              </div>
          </form>
      </div>)
  );
}
