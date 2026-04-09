/**
 * netlify/functions/delete-improvement.js
 * Admin-protected POST — deletes an improvement by id.
 */
'use strict';

const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' }, event);
  }

  if (!verifyAdminToken(event)) {
    return unauthorized(event);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' }, event);
  }

  const { id } = body;
  if (!id) {
    return jsonResponse(400, { error: 'id is required' }, event);
  }

  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('improvements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('delete-improvement error:', error.code);
      return jsonResponse(500, { error: 'Failed to delete improvement' }, event);
    }

    return jsonResponse(200, { success: true }, event);

  } catch (err) {
    console.error('delete-improvement unexpected error:', err.message);
    return jsonResponse(500, { error: 'Internal server error' }, event);
  }
};
