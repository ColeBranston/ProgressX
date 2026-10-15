import { adsTxt } from "@/app/api/libs/ads";

// GET /ads.txt: the sellers allowed to sell this site's ad space (from ADS_TXT), which ad networks check
// before they pay for it. 404 until ads are set up.
export function GET() {
    const body = adsTxt()
    if (!body) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain" } })
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } })
}
