// Decrypts one user's stored government ID images to a local folder, for a legal / privacy request or
// a manual review. This is the ONLY way an ID can be read back: the app has no route that does it.
// Run on the server, from progressx/:
//   node --env-file=.env.local scripts/id-decrypt.mjs <user id> <output folder>
// Handle the output like the ID itself: look at it, then delete it (`rm -P` on macOS). Never email it.
import { createDecipheriv } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"

const [ userId, outDir ] = process.argv.slice(2)
if (!/^[0-9a-f-]{36}$/.test(userId ?? "") || !outDir) {
    console.error("Usage: node --env-file=.env.local scripts/id-decrypt.mjs <user id> <output folder>")
    process.exit(1)
}

const env = process.env
const masterKey = (version) => {
    const value = version === Number(env.ID_ENCRYPTION_KEY_VERSION || 1) ? env.ID_ENCRYPTION_KEY : env[`ID_ENCRYPTION_KEY_V${version}`]
    const key = value ? Buffer.from(value, "base64") : null
    if (!key || key.length !== 32) throw new Error(`No encryption key for version ${version}`)
    return key
}
const open = (key, sealed, aad) => {
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12), { authTagLength: 16 })
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(sealed.subarray(12, 28))
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()])
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: row, error } = await supabase.from("id_verifications").select("status, object_keys, wrapped_key, key_version").eq("user_id", userId).maybeSingle()
if (error) throw error
if (!row || row.status !== "verified" || !row.wrapped_key) {
    console.error("No stored ID for that user.")
    process.exit(1)
}

const dataKey = open(masterKey(row.key_version), Buffer.from(row.wrapped_key, "base64"), `progressx-id-key|${userId}|v${row.key_version}`)
const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ID_ACCESS_KEY_ID, secretAccessKey: env.R2_ID_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
})

mkdirSync(outDir, { recursive: true, mode: 0o700 })
for (const key of row.object_keys) {
    const res = await r2.send(new GetObjectCommand({ Bucket: env.R2_ID_BUCKET || "progressx-ids", Key: key }))
    const stored = Buffer.from(await res.Body.transformToByteArray())
    if (stored.subarray(0, 5).toString() !== "PXID1") throw new Error(`${key} isn't an encrypted ID file`)
    const image = open(dataKey, stored.subarray(5), `progressx-id|${userId}|${key}`)
    const file = join(outDir, key.split("/").pop().replace(".bin", ".jpg"))
    writeFileSync(file, image, { mode: 0o600 })
    console.log("Wrote", file)
}
dataKey.fill(0)
console.log("Delete these files when you're done (rm -P).")
