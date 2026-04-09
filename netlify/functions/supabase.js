const { createClient } = require('@supabase/supabase-js');

// Test seam: allows test suites to inject a mock client without real network calls.
// In production this is always null (unused).
let _testClient = null;

function getSupabaseClient() {
  if (_testClient) return _testClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

function getPublicClient() {
  if (_testClient) return _testClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createClient(url, key);
}

/** For testing only — inject a mock client. Pass null to reset. */
function __setTestClient(client) {
  _testClient = client;
}

module.exports = { getSupabaseClient, getPublicClient, __setTestClient };
