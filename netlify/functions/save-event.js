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
    const supabase = getSupabaseClient();

    // Deactivate all existing events
    const { error: deactivateError } = await supabase
      .from('events')
      .update({ is_active: false })
      .neq('id', 0);

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
    return jsonResponse(500, { error: err.message });
  }
};
