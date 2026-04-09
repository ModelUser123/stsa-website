/**
 * netlify/functions/save-improvement.js
 * Admin-protected POST — creates or updates an improvement.
 * If body contains `id`, performs an UPDATE; otherwise, INSERT.
 * Validates inputs, strips HTML, enforces enum constraints.
 */
'use strict';

const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

const VALID_STATUSES   = ['idea', 'planned', 'in-progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/** Strip HTML tags from a string */
function stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, '').trim();
}

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

  const { id, title, description, status, priority, submitted_by } = body;

  // Validate title
  const cleanTitle = stripHtml(title);
  if (!cleanTitle) {
    return jsonResponse(400, { error: 'title is required and must be a non-empty string' }, event);
  }

  // Validate status (if provided)
  const resolvedStatus = status || 'idea';
  if (!VALID_STATUSES.includes(resolvedStatus)) {
    return jsonResponse(400, {
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    }, event);
  }

  // Validate priority (if provided)
  const resolvedPriority = priority || 'medium';
  if (!VALID_PRIORITIES.includes(resolvedPriority)) {
    return jsonResponse(400, {
      error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
    }, event);
  }

  const cleanDescription = stripHtml(description);
  const cleanSubmittedBy = stripHtml(submitted_by);

  try {
    const client = getSupabaseClient();

    if (id) {
      // ── UPDATE ──────────────────────────────────────────────────────────────
      const payload = {
        title: cleanTitle,
        description: cleanDescription,
        status: resolvedStatus,
        priority: resolvedPriority,
        submitted_by: cleanSubmittedBy,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('improvements')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') { return jsonResponse(503, { error: 'The improvements table has not been set up yet. Contact Chris to run the database migration.' }, event); } console.error('save-improvement update error:', error.code);
        return jsonResponse(500, { error: 'Failed to update improvement' }, event);
      }

      return jsonResponse(200, { improvement: data }, event);

    } else {
      // ── INSERT ──────────────────────────────────────────────────────────────
      const payload = {
        title: cleanTitle,
        description: cleanDescription,
        status: resolvedStatus,
        priority: resolvedPriority,
        submitted_by: cleanSubmittedBy,
      };

      const { data, error } = await client
        .from('improvements')
        .insert([payload])
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') { return jsonResponse(503, { error: 'The improvements table has not been set up yet. Contact Chris to run the database migration.' }, event); } console.error('save-improvement insert error:', error.code);
        return jsonResponse(500, { error: 'Failed to create improvement' }, event);
      }

      return jsonResponse(201, { improvement: data }, event);
    }

  } catch (err) {
    console.error('save-improvement unexpected error:', err.message);
    return jsonResponse(500, { error: 'Internal server error' }, event);
  }
};
