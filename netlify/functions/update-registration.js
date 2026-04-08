const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

const ALLOWED_STATUSES = ['pending', 'paid'];

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' }, event);
  }

  const isValid = verifyAdminToken(event);
  if (!isValid) {
    return unauthorized(event);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' }, event);
  }

  const { registrationId, payment_status } = body;

  if (!registrationId) {
    return jsonResponse(400, { error: 'Missing registrationId' }, event);
  }

  if (!payment_status || !ALLOWED_STATUSES.includes(payment_status)) {
    return jsonResponse(400, { error: `payment_status must be one of: ${ALLOWED_STATUSES.join(', ')}` }, event);
  }

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('registrations')
      .update({ payment_status })
      .eq('id', registrationId)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return jsonResponse(500, { error: 'Failed to update registration' }, event);
    }

    if (!data) {
      return jsonResponse(404, { error: 'Registration not found' }, event);
    }

    return jsonResponse(200, { success: true, registration: data }, event);
  } catch (err) {
    console.error('Unexpected error:', err);
    return jsonResponse(500, { error: 'Internal server error' }, event);
  }
};
