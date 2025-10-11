import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { encoder } from "../../auth/login/google/route";
import { supabase } from "@/app/supabaseClient/client";

export async function POST(req: NextRequest) {
    const json = await req.json()
    const { name, height, weight, age, gender} = json

    console.log(name, height, weight, age, gender)

    const token = req.cookies?.get('token')?.value

    try {
        if (token) {
            const id = (await jwtVerify(token, encoder.encode(process.env.SUPABASE_JWT_SECRET)))?.payload?.sub
            console.log("id: ", id)

            if (id) {
                const { error: onboardingError } = await supabase.from("profiles").update({
                    display_name: name,
                    height_cm: height,
                    weight_lbs: weight,
                    age,
                    gender
                }).eq('id', id)

                if (!onboardingError) {
                    const { error: clearOnboardingError } = await supabase.from('profiles').update({
                        isOnboarded: true
                    }).eq('id', id)

                    if (!clearOnboardingError) {
                        return NextResponse.json({message: "onboarding information updated sucessfully"},{status: 201})
                    }
                }

                return NextResponse.json({message: "Error updating onboarded status"}, {status: 505})

            }
        } else {
            throw new Error("token missing")
        }

    } catch(e) {
        console.log("Error adding user onboarding details: ", e)
        return NextResponse.redirect("/login")
    }
}