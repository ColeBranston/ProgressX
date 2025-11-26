"use client";

import { IsLoadingContext } from "@/app/contexts/isLoading";
import { ChangeEvent, HTMLInputTypeAttribute, useContext, useEffect, useRef, useState } from "react";
import styles from './VideosComponent.module.css'

import dayjs from 'dayjs'
import { useSearchParams } from "next/navigation";
import { useRouter } from "../../../../node_modules/next/navigation";

export default function ProgressPhotosComponent() {

    const videoForm = useRef<HTMLInputElement | null>(null)
    const [ isFormVisible, setIsFormVisible ] = useState(false)
    const [ selectedImage, setSelectedImage ] = useState(null)
    const [ selectedImageURL, setSelectedImageURL ]= useState('')
    const [ isImageSelected, setIsImageSelected] = useState(false)

    const [ toggleImageAdded, setToggleImageAdded ] = useState(false)
    const [ isSynced, setIsSynced ] = useState(false)

    const [ userImages, setUserImages ] = useState<string | null>(null)
    const [ highlightedImage, setHighlightedImage ] = useState(null)

    const [ isMore, setIsMore ] = useState(false)
    const [ confirmDelete, setConfirmDelete ] = useState(false) 

    const { setIsLoading } = useContext(IsLoadingContext)

    useEffect(()=> {
        console.log("Photos Mounted")

        async function getData() {
            console.log(toggleImageAdded, isSynced)
            if (!localStorage.getItem("user_photos")) {
                const data = await fetch('api/user/userImages/getUserImages',{
                    method: "GET",
                })

                if (data.ok){
                    const body = await data.json()

                    setUserImages(body.images)

                    localStorage.setItem("user_photos", JSON.stringify(body.images))

                    console.log("Incoming data: ", body.images)

                } else {
                    console.error("Error fetching images: ", data)
                }

            } else {
                if (toggleImageAdded  != isSynced) {
                    
                    const data = await fetch('api/user/userImages/getUserImages',{
                        method: "GET",
                    })
    
                    if (data.ok){
                        const body = await data.json()
    
                        setUserImages(body.images)
    
                        localStorage.setItem("user_photos", JSON.stringify(body.images))
    
                        console.log("Incoming data: ", body.images)
    
                    } else {
                        console.error("Error fetching images: ", data)
                    }

                    setIsSynced(!isSynced)
                } else{
                    const images = localStorage.getItem("user_photos")
                    setUserImages(JSON.parse(images))

                    console.log("Found images from cache")
                }
            }

            
        }
        
        getData()
        
    },[toggleImageAdded])

    const params = useSearchParams()
    const submit = params.get("photoSubmit")

    const router = useRouter()

    useEffect(() => {
        if (submit) {
            submit === "true"? setIsFormVisible(true) : null
        }


        if (params.get("videoSubmit")) {
            const tempPath = window.location.pathname

            tempPath.replace("videoSubmit=true", "")

            router.replace(tempPath)
        }
    }, [])

    async function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];

        if (!file) return;

        setSelectedImage(file);
        setSelectedImageURL(URL.createObjectURL(file));
        setIsFormVisible(false);
        setIsImageSelected(true);

        e.target.value = "";
    }

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

    async function handleDeleteImage() {

        setIsLoading(true)

        const data = await fetch('api/user/userImages/deleteUserImages',{
            method: "POST",
            body: JSON.stringify({
                imageLink: JSON.stringify(highlightedImage.image_link)
            })
        })

        if (data.ok) {
            console.log("Image has been deleted successfully")

            setHighlightedImage(null)
            setIsMore(false)
            setConfirmDelete(false)

            setToggleImageAdded(!toggleImageAdded)

        } else{
            console.log("Image failed to be deleted")
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
                Object.entries(userImages).reverse().map(([key, image]) => {
                    return (
                        <div className={styles.addVideoButtonContainer}>
                            <div className={styles.addVideoButton} onClick={() => {setHighlightedImage(image)}}>
                                <div className={styles.progressPhotoContainer}>
                                    <img src={`${image.image_link}`} width={'100%'} height={"auto"}/>
                                </div>
                            </div>
                            <p>{dayjs(image.created_at).format("MMMM D, YYYY")}</p>
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
                    <div className={styles.customFormButton}> Select Image </div>
                </div>
                <p className={styles.exitButton} onClick={()=>{setIsFormVisible(false)}}>X</p>
            </div>
            :
            isImageSelected?
            <div className={styles.customFormContainer}>
                <div className={styles.customForm} onClick={() => {videoForm?.current ? videoForm.current.click(): null}}>
                    <img src={selectedImageURL} width={"auto"} height={'100%'}/>
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

            { highlightedImage?

            <div className={styles.highlightedImageContainer}>
                {confirmDelete?
                <div className={styles.confirmDeleteContainer}>
                    <p>Confirm You Want to Delete This Image</p>
                    <div style={{display: "flex", gap: "10px"}}>
                        <button onClick={()=>{setConfirmDelete(false)}}>Cancel</button>
                        <button onClick={handleDeleteImage}>Delete</button>
                    </div>
                </div>
                :
                <img src={highlightedImage.image_link} width={'auto'} height={'400px'}/>
                }
                <p className={styles.highlightedImageCreatedText}>{dayjs(highlightedImage.created_at).format("MMMM D, YYYY")}</p>
                <svg className={isMore? styles.highlightedImageMoreSVG:''} width="60" height="60" viewBox="0 0 24 24"  xmlns="http://www.w3.org/2000/svg" onClick={()=> {setIsMore(!isMore)}}>
                    <path d="M19.6668 7.20837H4.3335" strokeLinecap="round"/>
                    <path d="M19.6668 12H4.3335" strokeLinecap="round"/>
                    <path d="M19.6668 16.7916H4.3335" strokeLinecap="round"/>
                </svg>
                
                {isMore?
                    <div className={styles.moreImageOptions}>
                        <svg width="50" height="50" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" onClick={()=> setConfirmDelete(!confirmDelete)}>
                            <path d="M6.525 21C6.1125 21 5.7594 20.8531 5.46575 20.5592C5.1719 20.2656 5.025 19.9125 5.025 19.5V5.25H4.75C4.5375 5.25 4.35942 5.17765 4.21575 5.033C4.07192 4.8885 4 4.70934 4 4.4955C4 4.28184 4.07192 4.10417 4.21575 3.9625C4.35942 3.82084 4.5375 3.75 4.75 3.75H8.7C8.7 3.53334 8.7719 3.35417 8.91575 3.2125C9.0594 3.07084 9.2375 3 9.45 3H14.55C14.7625 3 14.9407 3.07184 15.0845 3.2155C15.2282 3.35934 15.3 3.5375 15.3 3.75H19.25C19.4625 3.75 19.6407 3.82234 19.7845 3.967C19.9282 4.1115 20 4.29066 20 4.5045C20 4.71816 19.9282 4.89583 19.7845 5.0375C19.6407 5.17915 19.4625 5.25 19.25 5.25H18.975V19.5C18.975 19.9125 18.8282 20.2656 18.5345 20.5592C18.2407 20.8531 17.8875 21 17.475 21H6.525ZM9.9295 17.35C10.1431 17.35 10.3208 17.2781 10.4625 17.1343C10.6041 16.9906 10.675 16.8125 10.675 16.6V8.125C10.675 7.9125 10.6027 7.73435 10.458 7.5905C10.3135 7.44685 10.1343 7.375 9.9205 7.375C9.70685 7.375 9.52915 7.44685 9.3875 7.5905C9.24585 7.73435 9.175 7.9125 9.175 8.125V16.6C9.175 16.8125 9.24735 16.9906 9.392 17.1343C9.5365 17.2781 9.71565 17.35 9.9295 17.35ZM14.0795 17.35C14.2932 17.35 14.4709 17.2781 14.6125 17.1343C14.7542 16.9906 14.825 16.8125 14.825 16.6V8.125C14.825 7.9125 14.7526 7.73435 14.608 7.5905C14.4635 7.44685 14.2844 7.375 14.0705 7.375C13.8569 7.375 13.6792 7.44685 13.5375 7.5905C13.3959 7.73435 13.325 7.9125 13.325 8.125V16.6C13.325 16.8125 13.3973 16.9906 13.542 17.1343C13.6865 17.2781 13.8657 17.35 14.0795 17.35Z" />
                        </svg>
                    </div>
                : null
                }

                <p className={styles.exitButton} onClick={()=>{
                    setHighlightedImage(null)
                    setIsMore(false)
                    setConfirmDelete(false)
                    }}>X</p>
            </div>

            :null

            }

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