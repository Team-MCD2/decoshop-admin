import crypto from 'crypto'

/**
 * Verifies the authenticity of a Shopify webhook request.
 * Uses crypto.timingSafeEqual to prevent timing attacks (Spec §5.2).
 * 
 * @param rawBody The raw request body text
 * @param hmacHeader The value of the 'x-shopify-hmac-sha256' header
 * @returns boolean True if the signature is valid, false otherwise
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader) {
    return false
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret) {
    console.error('CRITICAL: Missing SHOPIFY_WEBHOOK_SECRET environment variable.')
    return false
  }

  // Generate local HMAC-SHA256 hash from raw body
  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64')

  const hashBuffer = Buffer.from(computedHmac)
  const headerBuffer = Buffer.from(hmacHeader)

  // timingSafeEqual requires buffers of identical length
  if (hashBuffer.length !== headerBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(hashBuffer, headerBuffer)
}
