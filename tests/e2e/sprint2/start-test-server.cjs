/**
 * Starts Next.js dev server on port 3001 with .env.test.local loaded.
 * This ensures the E2E server uses the DEV database + mock LLMs.
 */
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env.test.local"),
});
const { spawn } = require("child_process");

const child = spawn("npx", ["next", "dev", "--port", "3001"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
  cwd: path.resolve(__dirname, "../../.."),
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
