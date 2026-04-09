const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

const ALLOWED_STATUSES = ['pending', 'paid'];

// Sanitize a plain-text string — strip HTML tags, trim, limit length
function sanitizeText(val, maxLen = 200) {
  if (typeof val !== 'string') return null;
  return val.replace(/<[^>]*>/g, '').trim().slice(0, maxLen) || null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[\d\s()\-+.]{7,20}$/.test(phone);
}

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

  const { registrationId, payment_status, name, email, phone, meal_choice } = body;

  if (!registrationId) {
    return jsonResponse(400, { error: 'Missing registrationId' }, event);
  }

  // Build update object from whatever fields are provided
  const updates = {};

  if (payment_status !== undefined) {
    if (!ALLOWED_STATUSES.includes(payment_status)) {
      return jsonResponse(400, { error: `payment_status must be one of: ${ALLOWED_STATUSES.join(', ')}` }, event);
    }
    updates.payment_status = payment_status;
  }

  if (name !== undefined) {
    const cleanName = sanitizeText(name, 100);
    if (!cleanName) {
      return jsonResponse(400, { error: 'Name is required and cannot be empty' }, event);
    }
    updates.name = cleanName;
  }

  if (email !== undefined) {
    const cleanEmail = sanitizeText(email, 254);
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return jsonResponse(400, { error: 'Invalid email address' }, event);
    }
    updates.email = cleanEmail || null;
  }

  if (phone !== undefined) {
    const cleanPhone = sanitizeText(phone, 20);
    if (cleanPhone && !isValidPhone(cleanPhone)) {
      return jsonResponse(400, { error: 'Invalid phone number' }, event);
    }
    updates.phone = cleanPhone || null;
  }

  if (meal_choice !== undefined) {
    const cleanMeal = sanitizeText(meal_choice, 100);
    updates.meal_choice = cleanMeal || null;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse(400, { error: 'No fields to update' }, event);
  }

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('registrations')
      .update(updates)
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
