const { runWebhookTests } = require('./verify-webhook.test');
const { runRlsTests } = require('./rls-policies.test');

async function main() {
  console.log('🏁 Starting Unified Test Suite for DecoShop Admin...\n');
  
  const webhookSuccess = runWebhookTests();
  const rlsSuccess = await runRlsTests();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (webhookSuccess && rlsSuccess) {
    console.log('🏆 ALL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('💥 SOME TESTS FAILED. CHECK DETAILS ABOVE.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(2);
});
