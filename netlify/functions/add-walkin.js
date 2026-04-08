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
    const { name, email, meal_choice } = JSON.parse(event.body || '{}');
    const supabase = getSupabaseClient();

    // Get active event
    const { data: activeEvent, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('is_active', true)
      .single();

    if (eventError && eventError.code !== 'PGRST116') throw eventError;
    if (!activeEvent) {
      return jsonResponse(404, { error: 'No active event found' });
    }

    // Insert walk-in registration
    const { data: registration, error: insertError } = await supabase
      .from('registrations')
      .insert({
        event_id: activeEvent.id,
        name,
        email,
        meal_choice,
        is_walkin: true,
        payment_status: 'paid',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return jsonResponse(201, { registration });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
