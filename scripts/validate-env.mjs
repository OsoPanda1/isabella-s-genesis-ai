import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const envExamplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(envExamplePath)) {
  console.warn('⚠️ .env.example not found, skipping environment validation.');
  process.exit(0);
}

const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
const expectedVars = envExampleContent
  .split('\n')
  .filter(line => line.trim() && !line.trim().startsWith('#'))
  .map(line => line.split('=')[0].trim())
  .filter(key => key.length > 0);

const missingVars = [];
const emptyVars = [];

// Critical keys that MUST have a value
const criticalKeys = [
  'GEMINI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY'
];

for (const expectedVar of expectedVars) {
  const val = process.env[expectedVar];
  if (val === undefined) {
    missingVars.push(expectedVar);
  } else if (!val) {
    emptyVars.push(expectedVar);
  }
}

let criticalEmpty = false;

// If we are missing critical keys, log them
const missingCritical = missingVars.filter(v => criticalKeys.includes(v));
if (missingCritical.length > 0) {
  console.error('\n❌ The following CRITICAL API keys are missing from the environment:');
  missingCritical.forEach(v => console.error(`   - ${v}`));
  criticalEmpty = true;
}

const emptyCritical = emptyVars.filter(v => criticalKeys.includes(v));
if (emptyCritical.length > 0) {
  console.error('\n❌ The following CRITICAL API keys are empty in the environment:');
  emptyCritical.forEach(v => console.error(`   - ${v}`));
  criticalEmpty = true;
}

if (criticalEmpty) {
  console.error('\n🛑 Server initialization aborted due to missing/empty critical environment variables.');
  process.exit(1);
}

console.log('✅ Critical environment variables validation passed.');
