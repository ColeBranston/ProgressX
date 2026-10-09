import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv, parse } from "dotenv"
import { existsSync, readFileSync } from "node:fs"

// End-to-end tests against a production build of the app (next build + next start on port 3100),
// wired to the throwaway Solr / search backend from ci/test (npm run test:services), never the live ones.
// The signed-in journey also needs Supabase: it reads E2E_ENV_FILE (default .env.local) and only runs
// with E2E_AUTH=1, creating zz-e2e-*@example.com accounts that it deletes again.
const ENV_FILE = process.env.E2E_ENV_FILE ?? ".env.local"
loadEnv({ path: ENV_FILE, quiet: true })

const PORT = Number(process.env.E2E_PORT ?? 3100)
// localhost, not 127.0.0.1: Next builds redirects from the server hostname, and the session cookie must follow
export const BASE_URL = `http://localhost:${PORT}`

const SEARCH_BACKEND_URL = process.env.SEARCH_BACKEND_TEST_URL ?? "http://127.0.0.1:8001"
const FOODS_SOLR_URL = `${(process.env.SOLR_TEST_URL ?? "http://127.0.0.1:8984/solr").replace(/\/$/, "")}/foods`

// E2E_IMAGE=<app image>: test the Docker image that will be deployed (CI does this), instead of a local
// build. The container reaches the test services through host.docker.internal, and gets the env
// file's variables by name only (values come from this process's environment, never the command line).
function serverCommand() {
    const image = process.env.E2E_IMAGE
    if (!image) return `${process.env.E2E_SKIP_BUILD ? "" : "npx next build && "}node scripts/standalone-server.mjs`
    const passThrough = existsSync(ENV_FILE) ? Object.keys(parse(readFileSync(ENV_FILE))) : []
    const toHost = (url: string) => url.replace(/\/\/(127\.0\.0\.1|localhost)\b/, "//host.docker.internal")
    // a container left by an interrupted run would hold the name and port
    return "docker rm --force progressx-e2e >/dev/null 2>&1; exec " + [
        "docker run --rm --name progressx-e2e",
        `--publish 127.0.0.1:${PORT}:8080`,
        ...passThrough.map((name) => `--env ${name}`),
        `--env APP_URL=${BASE_URL}`,
        `--env SEARCH_BACKEND_URL=${toHost(SEARCH_BACKEND_URL)}`,
        `--env FOODS_SOLR_URL=${toHost(FOODS_SOLR_URL)}`,
        "--env OLLAMA_URL=http://127.0.0.1:9",
        image,
    ].join(" ")
}

export default defineConfig({
    testDir: "./e2e",
    outputDir: "./test-results/playwright",
    timeout: 60_000,
    expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["list"], ["junit", { outputFile: "test-results/e2e-junit.xml" }], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
    globalTeardown: "./e2e/global-teardown.ts",
    use: {
        baseURL: BASE_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        reducedMotion: "reduce",
        timezoneId: "America/Toronto",
        locale: "en-CA",
    },
    projects: [
        { name: "e2e", testIgnore: /visual\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
        { name: "e2e-mobile", testMatch: /public\.spec\.ts/, use: { ...devices["Pixel 7"] } },
        // visual regression: screenshots of the public pages compared with the committed baselines
        { name: "regression", testMatch: /visual\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    ],
    webServer: {
        // the Docker image itself, or the same standalone server it runs (see dockerfile)
        command: serverCommand(),
        url: `${BASE_URL}/login`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: {
            NEXT_TELEMETRY_DISABLED: "1",
            PORT: String(PORT),
            HOSTNAME: "localhost",
            APP_URL: BASE_URL,
            SEARCH_BACKEND_URL,
            FOODS_SOLR_URL,
            // the diet assistant's model isn't part of these tests
            OLLAMA_URL: "http://127.0.0.1:9",
        },
    },
})
