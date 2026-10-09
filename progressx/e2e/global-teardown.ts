import { execFileSync } from "node:child_process"
import { deleteTestUsers } from "./support"

export default async function globalTeardown() {
    // Playwright stops the `docker run` client, which doesn't always stop the container itself
    if (process.env.E2E_IMAGE) {
        try { execFileSync("docker", ["rm", "--force", "progressx-e2e"], { stdio: "ignore" }) } catch { /* already gone */ }
    }
    // safety net: removes any zz-e2e-* account a failed run left behind
    if (process.env.E2E_AUTH === "1") await deleteTestUsers()
}
