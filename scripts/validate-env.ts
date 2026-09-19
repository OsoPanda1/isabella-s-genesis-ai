import * as fs from "node:fs";
import * as path from "node:path";

function parseEnv(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key) {
      result[key.trim()] = rest.join("=").trim();
    }
  }
  return result;
}

const validateEnv = () => {
  const envExamplePath = path.resolve(process.cwd(), ".env.example");
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envExamplePath)) {
    console.warn("⚠️  .env.example not found. Skipping environment validation.");
    return;
  }

  const exampleEnv = parseEnv(envExamplePath);
  const currentEnv = fs.existsSync(envPath)
    ? parseEnv(envPath)
    : (process.env as Record<string, string>);

  const requiredKeys = Object.keys(exampleEnv);
  const missingKeys: string[] = [];

  for (const key of requiredKeys) {
    // If the example env has no value (just key=), it means it's required
    // If it has a value, it's a default, maybe we still want it defined.
    if (!currentEnv[key] && !process.env[key]) {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    console.error("🛑 [C.R.O.W.N. Config Guard] Critical configuration missing!");
    console.error("The following environment variables are required but missing:");
    missingKeys.forEach((key) => console.error(`  - ${key}`));
    console.error("\nPlease configure them in your .env file.");
    process.exit(1);
  }

  console.log("✅ [C.R.O.W.N. Config Guard] Environment validation passed.");
};

validateEnv();
