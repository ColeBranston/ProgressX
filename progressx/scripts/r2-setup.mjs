// One-time setup for the R2 video bucket: lets the site's pages upload to it directly (CORS), then
// prints the rules back. Run from progressx/ after filling in the R2_* values in .env.local:
//   node --env-file=.env.local scripts/r2-setup.mjs
// Origins: https://progressx.ca plus the local dev server; add more with R2_CORS_ORIGINS=a,b
import { GetBucketCorsCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3"

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
const Bucket = process.env.R2_VIDEO_BUCKET || "progressx-videos"
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env.local first")
    process.exit(1)
}

const origins = [
    "https://progressx.ca",
    "http://localhost:3001",
    ...(process.env.R2_CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
]

const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
})

await r2.send(new HeadBucketCommand({ Bucket }))
await r2.send(new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
        CORSRules: [{
            AllowedOrigins: origins,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["content-type"],
            ExposeHeaders: ["etag"],
            MaxAgeSeconds: 3600,
        }],
    },
}))
const { CORSRules } = await r2.send(new GetBucketCorsCommand({ Bucket }))
console.log(`CORS on ${Bucket}:`, JSON.stringify(CORSRules, null, 2))
