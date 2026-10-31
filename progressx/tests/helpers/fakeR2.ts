// An in-memory stand-in for Cloudflare R2 (the S3 API), for tests of the video and ID storage: mock
// "@aws-sdk/client-s3" and "@aws-sdk/s3-request-presigner" with the modules below and every bucket
// lives in memory. Only the commands the app sends are modelled; anything else throws.
//
//   vi.mock("@aws-sdk/client-s3", async () => (await import("../helpers/fakeR2")).s3Module)
//   vi.mock("@aws-sdk/s3-request-presigner", async () => (await import("../helpers/fakeR2")).presignerModule)

type Stored = { body: Buffer, contentType?: string }
type Input = Record<string, unknown> & { Bucket: string, Key?: string }

class Command {
    constructor(public input: Input) {}
}
export class PutObjectCommand extends Command {}
export class GetObjectCommand extends Command {}
export class HeadObjectCommand extends Command {}
export class DeleteObjectsCommand extends Command {}
export class ListObjectsV2Command extends Command {}

export class FakeR2 {
    buckets = new Map<string, Map<string, Stored>>()
    sent: Command[] = []
    // a command name -> the error the next such command throws (e.g. a network failure)
    failures = new Map<string, Error>()
    listPageSize = 1000

    bucket(name: string) {
        if (!this.buckets.has(name)) this.buckets.set(name, new Map())
        return this.buckets.get(name)!
    }
    put(bucket: string, key: string, body: Buffer | string) { this.bucket(bucket).set(key, { body: Buffer.from(body) }) }
    keys(bucket: string) { return [...this.bucket(bucket).keys()].sort((a, b) => a.localeCompare(b)) }
    get(bucket: string, key: string) { return this.bucket(bucket).get(key)?.body ?? null }

    async send(command: Command): Promise<unknown> {
        this.sent.push(command)
        const name = command.constructor.name
        const failure = this.failures.get(name)
        if (failure) {
            this.failures.delete(name)
            throw failure
        }
        const { Bucket, Key } = command.input
        const objects = this.bucket(Bucket)
        if (command instanceof PutObjectCommand) {
            objects.set(Key!, { body: Buffer.from(command.input.Body as Buffer), contentType: command.input.ContentType as string })
            return {}
        }
        if (command instanceof HeadObjectCommand || command instanceof GetObjectCommand) {
            const found = objects.get(Key!)
            if (!found) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })
            if (command instanceof HeadObjectCommand) return { ContentLength: found.body.length, ContentType: found.contentType }
            const range = String(command.input.Range ?? "").match(/^bytes=(\d+)-(\d+)$/)
            const body = range ? found.body.subarray(Number(range[1]), Number(range[2]) + 1) : found.body
            return { Body: { transformToByteArray: async () => new Uint8Array(body) } }
        }
        if (command instanceof DeleteObjectsCommand) {
            const { Objects } = command.input.Delete as { Objects: { Key: string }[] }
            for (const { Key: key } of Objects) objects.delete(key)
            return { Errors: [] }
        }
        if (command instanceof ListObjectsV2Command) {
            const all = [...objects.keys()].filter((key) => key.startsWith(String(command.input.Prefix ?? ""))).sort((a, b) => a.localeCompare(b))
            // like S3, a page continues after the last key listed (so deleting between pages skips nothing)
            const after = command.input.ContinuationToken as string | undefined
            const rest = after === undefined ? all : all.filter((key) => key > after)
            const page = rest.slice(0, this.listPageSize)
            const more = rest.length > page.length
            return { Contents: page.map((key) => ({ Key: key })), IsTruncated: more, NextContinuationToken: more ? page[page.length - 1] : undefined }
        }
        throw new Error(`fakeR2: ${name} isn't modelled`)
    }

    reset() { this.buckets.clear(); this.sent = []; this.failures.clear(); this.listPageSize = 1000 }
}

export const fakeR2 = new FakeR2()

export const s3Module = {
    S3Client: class { send(command: Command) { return fakeR2.send(command) } },
    PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectsCommand, ListObjectsV2Command,
}

// signed links aren't real, but say what they're for
export const presignerModule = {
    getSignedUrl: async (_client: unknown, command: Command, options: { expiresIn: number }) =>
        `https://r2.test/${command.input.Bucket}/${command.input.Key}?op=${command.constructor.name}&expires=${options.expiresIn}`,
}
