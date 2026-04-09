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
    const body = JSON.parse(event.body || '{}');

    // Require at least a basic event identifier before touching the DB
    // (prevents accidentally deactivating events with an empty payload)
    if (!body.event_name && !body.id) {
      return jsonResponse(400, { error: 'event_name or id is required' });
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

    return jsonResponse(200, { event: savedEvent });
  } catch (err) {
    console.error('save-event error:', err);
    return jsonResponse(500, { error: 'Unable to save event. Please try again.' });
  }
};
