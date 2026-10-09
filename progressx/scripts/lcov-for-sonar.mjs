// Vitest writes coverage paths relative to progressx/; SonarQube reads them relative to the repository
// root (where sonar-project.properties is), so prefix them with progressx/.
import { readFileSync, writeFileSync } from "node:fs"

const file = "coverage/lcov.info"
const lcov = readFileSync(file, "utf8").replace(/^SF:(?!progressx\/|\/)/gm, "SF:progressx/")
writeFileSync(file, lcov)
