// netlify/functions/get-event-history.js
// Admin-protected endpoint — returns all events with registration stats
// GET /api/get-event-history

const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  const isValid = verifyAdminToken(event);
  if (!isValid) {
    return unauthorized(event);
  }

  try {
    const supabase = getSupabaseClient();

    // Get ALL events, sorted by event_date descending
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      return jsonResponse(200, { events: [] });
    }

    // Get all registrations (just the fields we need for aggregation)
    const { data: registrations, error: regError } = await supabase
      .from('registrations')
      .select('event_id, id, payment_status, is_walkin, meal_choice');

    if (regError) throw regError;

    // Group registrations by event_id
    const regsByEvent = {};
    (registrations || []).forEach(r => {
      if (!regsByEvent[r.event_id]) {
        regsByEvent[r.event_id] = { total: 0, paid: 0, walkins: 0, meals: {} };
      }
      const eg = regsByEvent[r.event_id];
      eg.total += 1;
      if (r.payment_status === 'paid') eg.paid += 1;
      if (r.is_walkin) eg.walkins += 1;
      if (r.meal_choice) {
        eg.meals[r.meal_choice] = (eg.meals[r.meal_choice] || 0) + 1;
      }
    });

    // Combine events with their registration stats
    const result = events.map(ev => {
      const stats = regsByEvent[ev.id] || { total: 0, paid: 0, walkins: 0, meals: {} };
      const revenue = stats.paid * (ev.price_per_person || 0);
      return {
        id: ev.id,
        event_name: ev.event_name,
        event_date: ev.event_date,
        venue_name: ev.venue_name,
        venue_address: ev.venue_address,
        price_per_person: ev.price_per_person,
        is_active: ev.is_active,
        created_at: ev.created_at,
        speaker_name: ev.speaker_name,
        topic: ev.topic,
        meal_choice_1: ev.meal_choice_1,
        meal_choice_2: ev.meal_choice_2,
        meal_choice_3: ev.meal_choice_3,
        total_registrations: stats.total,
        paid_count: stats.paid,
        walkin_count: stats.walkins,
        meal_breakdown: stats.meals,
        revenue,
      };
    });

    return jsonResponse(200, { events: result }, event);
  } catch (err) {
    console.error('get-event-history error:', err);
    return jsonResponse(500, { error: 'Unable to load event history. Please try again.' }, event);
  }
};
