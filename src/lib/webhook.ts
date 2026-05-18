import crypto from "crypto";

export async function sendJobWebhook(
  url: string,
  secret: string | null,
  payload: any
) {
  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secret) {
      // Create HMAC signature using SHA-256
      const signature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      headers["x-rightmind-signature"] = signature;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      console.error(`[Webhook] Failed to deliver to ${url}. Status: ${response.status}`);
    } else {
      console.log(`[Webhook] Successfully delivered to ${url}`);
    }
  } catch (error) {
    console.error(`[Webhook] Error delivering to ${url}:`, error);
  }
}
