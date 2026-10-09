// Starts the production build the way the Docker image does (.next/standalone/server.js with the static
// files and public/ copied next to it). Used by the end-to-end tests.
import { cpSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"

const standalone = ".next/standalone"
if (!existsSync(`${standalone}/server.js`)) {
    console.error("No standalone build: run `npx next build` first")
    process.exit(1)
}
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true })
cpSync("public", `${standalone}/public`, { recursive: true })

const server = spawn(process.execPath, ["server.js"], { cwd: standalone, stdio: "inherit", env: process.env })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal))
server.on("exit", (code) => process.exit(code ?? 0))
