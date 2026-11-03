import { defineConfig } from 'vitest/config'
// The phone app (mobile/) has its own dependencies and test run (`cd mobile && npm test`); keep it out of the Mac app's run.
export default defineConfig({ test: { exclude: ['mobile/**', '**/node_modules/**', 'out/**', 'dist/**'] } })
