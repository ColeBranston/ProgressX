import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "../../libs/helpers";
import { collectUserData } from "../../libs/accountData";

// GET /api/user/export
// Downloads everything ProgressX stores about the signed-in user as a JSON file (the right to access
// your personal information, and data portability).
export async function GET(req: NextRequest) {
    const userId = await getUserIdFromRequest(req)

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    try {
        const data = await collectUserData(userId)
        const filename = `progressx-data-${new Date().toISOString().slice(0, 10)}.json`
        return new NextResponse(JSON.stringify(data, null, 2), {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        })
    } catch (e) {
        console.log("Error exporting user data: ", e)
        return NextResponse.json({ message: "Couldn't prepare your data, please try again" }, { status: 500 })
    }
}
