/**
 * netlify/functions/get-improvements.js
 * Admin-protected GET — returns all improvements sorted by created_at desc.
 * Gracefully handles missing table (returns empty array + migration hint).
 */
'use strict';

const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' }, event);
  }

  if (!verifyAdminToken(event)) {
    return unauthorized(event);
  }

  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('improvements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Table doesn't exist yet — return empty array with migration hint
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        return jsonResponse(200, {
          improvements: [],
          message: 'Run the migration in supabase/migration-improvements.sql to create the improvements table.',
        }, event);
      }
      // Any other DB error — don't leak details
      console.error('get-improvements DB error:', error.code);
      return jsonResponse(500, { error: 'Failed to fetch improvements' }, event);
    }

    return jsonResponse(200, { improvements: data || [] }, event);
  } catch (err) {
    console.error('get-improvements unexpected error:', err.message);
    return jsonResponse(500, { error: 'Internal server error' }, event);
  }
};
