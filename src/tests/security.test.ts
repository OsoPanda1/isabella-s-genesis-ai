import { identityHasPermission } from "../lib/rbac";
import { redact } from "../lib/secret-redactor";
import { SovereignDB } from "../lib/sovereign-engine";

export interface SecurityTestResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface SecurityTestSuiteReport {
  success: boolean;
  results: SecurityTestResult[];
}

/**
 * Runs a suite of real-time security validation checks on the system core.
 * Executed by the secure administrative DB endpoint.
 * Zero-dependency on test runners (vitest) so it is safe to run in production.
 */
export function runSecurityTestSuite(): SecurityTestSuiteReport {
  const results: SecurityTestResult[] = [];

  // Test 1: RBAC guest prevention
  try {
    const adminAllowedForGuest = identityHasPermission({ role: "Guest" }, "system:admin");
    results.push({
      name: "RBAC Guest Prevented from Admin",
      success: !adminAllowedForGuest,
      ...(adminAllowedForGuest ? { error: "Guest has administrative access" } : {}),
    });
  } catch (e) {
    results.push({
      name: "RBAC Guest Prevented from Admin",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Test 2: Secret redaction check
  try {
    const testSecret = "my-super-secret-key-123456";
    // Temporarily add a secret value pattern check
    const rawText = `The secret is api_key = "${testSecret}"`;
    const redacted = redact(rawText);
    const success = redacted.includes("[REDACTED]") && !redacted.includes(testSecret);
    results.push({
      name: "Automated Secret Redaction Validation",
      success,
      ...(!success ? { error: `Secret was not redacted: ${redacted}` } : {}),
    });
  } catch (e) {
    results.push({
      name: "Automated Secret Redaction Validation",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Test 3: Sandbox/Ledger integrity check
  try {
    const result = SovereignDB.verifyLedgerIntegrity();
    results.push({
      name: "Ledger Cryptographic Integrity Validation",
      success: result.success,
      ...(!result.success ? { error: result.error } : {}),
    });
  } catch (e) {
    results.push({
      name: "Ledger Cryptographic Integrity Validation",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Test 4: Audit chain verification
  try {
    const result = SovereignDB.verifyAuditChain();
    results.push({
      name: "Audit Log Chain Integrity Check",
      success: result.success,
      ...(!result.success ? { error: result.error } : {}),
    });
  } catch (e) {
    results.push({
      name: "Audit Log Chain Integrity Check",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const allSuccess = results.every((r) => r.success);

  return {
    success: allSuccess,
    results,
  };
}
