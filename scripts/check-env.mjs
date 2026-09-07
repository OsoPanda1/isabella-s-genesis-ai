import fs from "node:fs";
import path from "node:path";

console.log("🔍 Checking environment variables against .env.example...");

const examplePath = path.resolve(process.cwd(), ".env.example");
const envPath = path.resolve(process.cwd(), ".env");

if (!fs.existsSync(examplePath)) {
  console.warn("⚠️  .env.example not found, skipping validation.");
  process.exit(0);
}

const parseEnv = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .reduce((acc, line) => {
      const [key] = line.split("=");
      if (key) acc[key.trim()] = true;
      return acc;
    }, {});
};

const exampleKeys = Object.keys(parseEnv(examplePath));
const envKeys = Object.keys(parseEnv(envPath));
const processEnvKeys = Object.keys(process.env);

const allProvidedKeys = new Set([...envKeys, ...processEnvKeys]);

const missingKeys = exampleKeys.filter((key) => !allProvidedKeys.has(key));

if (missingKeys.length > 0) {
  console.error("\n❌ WARNING: Missing environment variables detected!");
  console.error("The following variables are defined in .env.example but missing from your .env file or environment:");
  missingKeys.forEach((key) => console.error(`  - ${key}`));
  console.error("\n💡 Please review these missing variables to ensure correct application behavior.\n");
  // We exit with 0 to not aggressively block the dev server in a sandboxed environment, but provide the clear feedback.
  process.exit(0); 
}

console.log("✅ All environment variables from .env.example are present.\n");
