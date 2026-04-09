const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const isValid = await verifyAdminToken(event);
  if (!isValid) {
    return unauthorized();
  }

  try {
    const raw = JSON.parse(event.body || '{}');

    // Require at least a basic event identifier before touching the DB
    // (prevents accidentally deactivating events with an empty payload)
    if (!raw.event_name && !raw.id) {
      return jsonResponse(400, { error: 'event_name or id is required' });
    }

    // Sanitize: strip empty strings (Supabase rejects '' for time/date/int columns)
    // and convert NaN numbers to undefined (removes them from payload)
    const body = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === '' || value === null || value === undefined) continue;
      if (typeof value === 'number' && isNaN(value)) continue;
      body[key] = value;
    }

    const supabase = getSupabaseClient();

    // Deactivate all existing events
    const { error: deactivateError } = await supabase
      .from('events')
      .update({ is_active: false })
      .eq('is_active', true);

    if (deactivateError) throw deactivateError;

    let savedEvent;

    if (body.id) {
      // Update existing event
      const { data, error } = await supabase
        .from('events')
        .update({ ...body, is_active: true })
        .eq('id', body.id)
        .select()
        .single();

      if (error) throw error;
      savedEvent = data;
    } else {
      // Insert new event
      const { data, error } = await supabase
        .from('events')
        .insert({ ...body, is_active: true })
        .select()
        .single();

      if (error) throw error;
      savedEvent = data;
    }

    return jsonResponse(200, { event: savedEvent }, event);
  } catch (err) {
    console.error('save-event error:', err);
    return jsonResponse(500, { error: err.message || 'Unable to save event. Please try again.' }, event);
  }
};
