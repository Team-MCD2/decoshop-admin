const crypto = require('crypto');

// Require the logic under test
function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) {
    return false;
  }
  if (!secret) {
    console.error('CRITICAL: Missing secret key.');
    return false;
  }

  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const hashBuffer = Buffer.from(computedHmac);
  const headerBuffer = Buffer.from(hmacHeader);

  if (hashBuffer.length !== headerBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, headerBuffer);
}

function runWebhookTests() {
  console.log('🧪 Running Shopify Webhook Verification Tests...');
  const secret = 'hush-its-a-secret';
  const rawBody = JSON.stringify({ id: 123456, total_price: '42.00', email: 'test@decoshop.com' });

  // Generate valid HMAC
  const validHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  let passed = 0;
  let failed = 0;

  const assert = (name, condition) => {
    if (condition) {
      console.log(`  ✅ Passed: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ Failed: ${name}`);
      failed++;
    }
  };

  // Test 1: Valid signature
  assert(
    'Verify valid signature with correct payload & secret',
    verifyShopifyWebhook(rawBody, validHmac, secret) === true
  );

  // Test 2: Invalid signature (different payload)
  assert(
    'Verify invalid signature due to payload alteration',
    verifyShopifyWebhook(rawBody + 'altered', validHmac, secret) === false
  );

  // Test 3: Invalid signature (different secret)
  assert(
    'Verify invalid signature due to wrong secret key',
    verifyShopifyWebhook(rawBody, validHmac, 'wrong-secret') === false
  );

  // Test 4: Empty HMAC header
  assert(
    'Verify rejection of empty HMAC header',
    verifyShopifyWebhook(rawBody, null, secret) === false
  );

  // Test 5: Length mismatch handling
  assert(
    'Verify timingSafeEqual length mismatch handling',
    verifyShopifyWebhook(rawBody, 'short_hmac', secret) === false
  );

  console.log(`\n📊 Webhook Tests Summary: ${passed} Passed, ${failed} Failed\n`);
  return failed === 0;
}

module.exports = { runWebhookTests };
if (require.main === module) {
  runWebhookTests();
}
