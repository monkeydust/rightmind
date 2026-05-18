import crypto from "crypto";

const PREFIX = "rm_live_";

/**
 * Generates a new API key.
 * Returns the plain key (to show the user ONCE) and the hashed key (to store in DB).
 */
export function generateApiKey(): { plainKey: string; keyHash: string; prefix: string } {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const plainKey = `${PREFIX}${randomBytes}`;
  const keyHash = hashApiKey(plainKey);
  const prefix = plainKey.slice(0, 16); // e.g. "rm_live_a1b2c3d4"

  return { plainKey, keyHash, prefix };
}

/**
 * Hashes an API key for secure storage and comparison.
 */
export function hashApiKey(plainKey: string): string {
  return crypto.createHash("sha256").update(plainKey).digest("hex");
}
