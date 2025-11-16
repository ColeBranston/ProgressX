'use client';

import { useRef } from 'react';
import { useRouter } from '../../../../node_modules/next/navigation';
import styles from './upload.module.css';

export default function UploadPage() {
  const videoInputRef = useRef(null);
  const photoInputRef = useRef(null);

  const router = useRouter()

  return (
    <div className="mainWrapper">
      <div className={styles.uploadContainer}>
        <div className={styles.uploadHeaderContainer}>
          <p className={styles.uploadHeader}>
            Upload
            <svg width="30" height="33" viewBox="0 0 19 19" fill='white' xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#clip0_90_34)">
                <path d="M9.5 0L17.8125 8.3125H13.0625V13.0625H5.9375V8.3125H1.1875L9.5 0Z"/>
                <path d="M19 15.4375V19H0V15.4375H19Z"/>
                </g>
                <defs>
                <clipPath id="clip0_90_34">
                <rect width="19" height="19"/>
                </clipPath>
                </defs>
            </svg>
          </p>
          <p className={styles.uploadBodyText}>
            Show your fitness journey - upload progress photos and workout videos to track your transformations.
          </p>
        </div>

        <div className={styles.uploadButtonContainer}>
          <div onClick={() => {router.push('/profile?page=videos&videoSubmit=true')}} style={{ cursor: 'pointer' }}>
            <svg width="130" height="130" viewBox="0 0 52 39" xmlns="http://www.w3.org/2000/svg">
                <path d="M0.520996 14.6755C0.520996 11.5525 3.06015 9.01331 6.18322 9.01331H28.8321C31.9552 9.01331 34.4943 11.5525 34.4943 14.6755V37.3244C34.4943 40.4475 31.9552 42.9866 28.8321 42.9866H6.18322C3.06015 42.9866 0.520996 40.4475 0.520996 37.3244V14.6755ZM49.9858 12.1806C50.9059 12.6761 51.481 13.6316 51.481 14.6755V37.3244C51.481 38.3684 50.9059 39.3239 49.9858 39.8193C49.0657 40.3148 47.951 40.2617 47.0751 39.6778L38.5817 34.0156L37.3254 33.1751V18.8249L38.5817 17.9844L47.0751 12.3222C47.9421 11.7471 49.0569 11.6852 49.9858 12.1806Z"/>
            </svg>
            <p>Videos</p>
          </div>

          <div onClick={() => {router.push('/profile?page=photos&photoSubmit=true')}} style={{ cursor: 'pointer' }}>
            <svg width="130" height="130" viewBox="0 0 37 37" xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#clip0_97_63)">
                <path d="M30.0625 13.875C33.8941 13.875 37 10.769 37 6.9375C37 3.10603 33.8941 0 30.0625 0C26.2309 0 23.125 3.10603 23.125 6.9375C23.125 10.769 26.2309 13.875 30.0625 13.875Z"/>
                <path d="M0 37H37V25.4375L30.0625 18.5L23.125 25.4375L11.5625 13.875L0 25.4375V37Z"/>
                </g>
                <defs>
                <clipPath id="clip0_97_63">
                <rect width="37" height="37" fill="white"/>
                </clipPath>
                </defs>
            </svg>
            <p>Photos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
