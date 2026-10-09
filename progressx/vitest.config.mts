import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

// Three suites, each runnable on its own (npm run test:unit / test:integration / test:regression) or
// together with coverage for SonarQube (npm run test:coverage). End-to-end tests are Playwright (e2e/).
export default defineConfig({
    plugins: [tsconfigPaths()],
    esbuild: { jsx: "automatic" },
    test: {
        globals: false,
        restoreMocks: true,
        unstubEnvs: true,
        setupFiles: ["./tests/setup.ts"],
        projects: [
            { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.{ts,tsx}"], environment: "node" } },
            // talks to the throwaway Solr started by ci/test (npm run test:services)
            { extends: true, test: { name: "integration", include: ["tests/integration/**/*.test.{ts,tsx}"], environment: "node", testTimeout: 30_000, fileParallelism: false } },
            { extends: true, test: { name: "regression", include: ["tests/regression/**/*.test.{ts,tsx}"], environment: "node" } },
        ],
        coverage: {
            provider: "v8",
            reporter: ["text-summary", "lcov"],
            reportsDirectory: "coverage",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.d.ts"],
        },
    },
})
