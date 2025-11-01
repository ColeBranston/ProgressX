"use client";

import { IsLoadingContext } from "@/app/contexts/isLoading";
import { ChangeEvent, HTMLInputTypeAttribute, useContext, useEffect, useRef, useState } from "react";
import styles from './VideosComponent.module.css'

export default function ProgressPhotosComponent() {

    const videoForm = useRef<HTMLInputElement | null>(null)
    const [ isFormVisible, setIsFormVisible ] = useState(false)
    const [ selectedImage, setSelectedImage ] = useState(null)
    const [ selectedImageURL, setSelectedImageURL ]= useState('')
    const [ isImageSelected, setIsImageSelected] = useState(false)

    const [ toggleImageAdded, setToggleImageAdded ] = useState(false)

    const [ userImages, setUserImages ] = useState(null)

    const { setIsLoading } = useContext(IsLoadingContext)

    useEffect(()=> {
        console.log("Photos Mounted")

        async function getData() {
            const data = await fetch('api/user/userImages/getUserImages',{
                method: "GET",
            })

            if (data.ok){
                const body = await data.json()

                setUserImages(body.images)

                console.log("Incoming data: ", body.images)

            } else {
                console.error("Error fetching images: ", data)
            }


        }
        
        getData()
        
    },[toggleImageAdded])

    function handleVideoChange(e: ChangeEvent<HTMLInputElement>){
          const file: any = e?.target?.files?.[0]

          setSelectedImage(file)
          setSelectedImageURL(file? URL.createObjectURL(file): '')
          setIsFormVisible(false)
          setIsImageSelected(true)

          console.log('Selected image:', file);
          console.log("Form Visibility: ", isFormVisible)

          e.target.value = ''
        };

    async function handleImageSubmit(){

        if (!selectedImage) return

        setIsLoading(true)

        const form_data = new FormData()

        form_data.append("file", selectedImage)

        const data = await fetch('api/user/userImages/uploadUserImages',{
            method: "POST",
            body: form_data
        })

        if (data.ok) {
            console.log("Fetch responded with: ", data)
            
            setSelectedImage(null)
            setSelectedImageURL('')
            setIsFormVisible(false)
            setIsImageSelected(false)

            setToggleImageAdded(!toggleImageAdded)
        }

        setIsLoading(false)
    }

    return (
        <div className={styles.videosContainer}>
            <div className={styles.addVideoButtonContainer}>
                <div className={styles.addVideoButton} onClick={() => {setIsFormVisible(true)}}>
                    <svg width="40" height="40" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
                <p>Add New Photo</p>
            </div>
            {userImages?
                Object.entries(userImages).map(([key, image]) => {
                    return (
                        <div className={styles.addVideoButtonContainer}>
                            <div className={styles.addVideoButton} onClick={() => {

                            }}>
                                <img src={`${image.image_link}`} width={"100px"} height={"100px"}/>
                            </div>
                            <p>{image.created_at}</p>
                        </div>
                    )
                })
            :
            null}
            {isFormVisible?
            <div className={styles.customFormContainer}>
                <div className={styles.customForm} onClick={() => {videoForm?.current ? videoForm.current.click(): null}}>
                    <svg width="80" height="80" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" clipRule="evenodd" d="M21 27.5625C21.7249 27.5625 22.3125 26.9748 22.3125 26.25V7.04802L25.2536 10.4792C25.7252 11.0295 26.5538 11.0933 27.1042 10.6215C27.6546 10.1498 27.7183 9.3212 27.2465 8.77084L21.9965 2.64584C21.7473 2.35492 21.3831 2.1875 21 2.1875C20.6169 2.1875 20.2528 2.35492 20.0036 2.64584L14.7535 8.77084C14.2818 9.3212 14.3455 10.1498 14.8959 10.6215C15.4462 11.0933 16.2748 11.0295 16.7465 10.4792L19.6875 7.04802V26.25C19.6875 26.9748 20.2752 27.5625 21 27.5625Z" fill="#E20000"/>
                        <path d="M28 15.75C26.7712 15.75 26.1567 15.75 25.7154 16.0449C25.5243 16.1726 25.3601 16.3367 25.2325 16.5278C24.9375 16.9692 24.9375 17.5836 24.9375 18.8125V26.25C24.9375 28.4246 23.1747 30.1875 21 30.1875C18.8254 30.1875 17.0626 28.4246 17.0626 26.25V18.8125C17.0626 17.5836 17.0626 16.9691 16.7676 16.5277C16.6399 16.3367 16.4759 16.1726 16.2849 16.045C15.8435 15.75 15.229 15.75 14 15.75C9.05025 15.75 6.57538 15.75 5.03769 17.2877C3.5 18.8255 3.5 21.2999 3.5 26.2496V27.9996C3.5 32.9493 3.5 35.4242 5.03769 36.9619C6.57538 38.4996 9.05025 38.4996 14 38.4996H28C32.9497 38.4996 35.4245 38.4996 36.9623 36.9619C38.5 35.4242 38.5 32.9493 38.5 27.9996V26.2496C38.5 21.2999 38.5 18.8255 36.9623 17.2877C35.4245 15.75 32.9497 15.75 28 15.75Z" fill="#E20000"/>
                    </svg>
                    <p className={styles.customFormSelectHeader}>Select Photo to Upload</p>
                    <p className={styles.customFormSelectBody}>or drag and drop it here</p>
                    <div className={styles.customFormButton}> Select Video </div>
                </div>
                <p className={styles.exitButton} onClick={()=>{setIsFormVisible(false)}}>X</p>
            </div>
            :
            isImageSelected?
            <div className={styles.customFormContainer}>
                <div className={styles.customForm} onClick={() => {videoForm?.current ? videoForm.current.click(): null}}>
                    <img src={selectedImageURL} width={"300px"} height={'300px'}/>
                </div>
                <button className={styles.submitImageButton} onClick={handleImageSubmit}>
                    <svg width="30" height="30" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 3.3125V12.6875M12.6875 8H3.3125" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Add New
                </button>
                <p className={styles.exitButton} onClick={()=>{setIsImageSelected(false)}}>X</p>
            </div>
            :null}

            <form>
                <input type="file"
                        accept="image/*"
                        ref={videoForm}
                        onChange={handleVideoChange}
                        style={{ display: 'none' }}>
                </input>
            </form>
        </div>
    )
}