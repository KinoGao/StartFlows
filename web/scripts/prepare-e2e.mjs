import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await Promise.all([".e2e-data", ".e2e-artifacts", "playwright-report"].map((directory) => rm(path.join(webRoot, directory), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
