import { verifyAccessToken } from "@/app/api/libs/session";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/supabaseClient/client";
import { LEGAL_MINIMUM_AGE } from "@/app/internal_components/legal/legalInfo";

export async function POST(req: NextRequest) {
    const json = await req.json()
    const { username, name, height, weight, age, gender, activity} = json

    // ProgressX is 18+ only (Terms of Service); the age entered here is the one used everywhere else
    const ageNumber = Number(age)
    if (!Number.isInteger(ageNumber) || ageNumber < LEGAL_MINIMUM_AGE || ageNumber > 120) {
        return NextResponse.json({ message: `You must be ${LEGAL_MINIMUM_AGE} or older to use ProgressX` }, { status: 400 })
    }


    const token = req.cookies?.get('token')?.value

    try {
        if (token) {
            const id = (await verifyAccessToken(token)).sub
            console.log("id: ", id)

            if (id) {
                const { error: onboardingError } = await supabase.from("profiles").update({
                    display_username: username,
                    isOnboarded: true,
                    display_name: name,
                    height_cm: height,
                    weight_lbs: weight,
                    age: ageNumber,
                    gender,
                    activity_level: activity
                }).eq('id', id)

                if (!onboardingError) {
                    return NextResponse.json({message: "onboarding information updated sucessfully"},{status: 201})
                }

                return NextResponse.json({message: "Error updating onboarded status"}, {status: 505})

            }
        } else {
            throw new Error("token missing")
        }

    } catch(e) {
        console.log("Error adding user onboarding details: ", e)
        return NextResponse.json({message: "Error validating user"})
    }
}