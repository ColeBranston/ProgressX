import { v2 as cloudinary } from 'cloudinary'

export default class CloudinaryService {
    private static _instance: any;

    private constructor(){}

    public static getInstance() {
        if (!CloudinaryService._instance){
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            })

            CloudinaryService._instance = cloudinary
        }

        return CloudinaryService._instance
    }
}