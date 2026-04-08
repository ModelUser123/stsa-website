const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const isValid = await verifyAdminToken(event);
  if (!isValid) {
    return unauthorized();
  }

  try {
    const supabase = getSupabaseClient();

    // Get active event
    const { data: activeEvent, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single();

    if (eventError && eventError.code !== 'PGRST116') throw eventError;
    if (!activeEvent) {
      return jsonResponse(200, { registrations: [] });
    }

    // Get registrations for active event
    const { data: registrations, error: regError } = await supabase
      .from('registrations')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('created_at', { ascending: true });

    if (regError) throw regError;

    return jsonResponse(200, { registrations: registrations || [] });
  } catch (err) {
    console.error('get-registrations error:', err);
    return jsonResponse(500, { error: 'Unable to load registrations. Please try again.' });
  }
};
