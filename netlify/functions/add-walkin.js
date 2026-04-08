const { handleCors, verifyAdminToken, unauthorized, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

// ── Input sanitisation helpers ────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

function validateMealChoice(choice, activeEvent) {
  const allowed = [
    activeEvent.meal_choice_1,
    activeEvent.meal_choice_2,
    activeEvent.meal_choice_3,
  ].filter(Boolean);
  return allowed.includes(choice);
}

// ── Handler ──────────────────────────────────────────────────────────────────
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
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const { name, email, meal_choice } = body;

    // Required field check
    if (!name || !meal_choice) {
      return jsonResponse(400, { error: 'name and meal_choice are required' });
    }

    // Sanitize name
    const cleanName = stripHtml(name);
    if (cleanName.length === 0) return jsonResponse(400, { error: 'name cannot be empty' });
    if (cleanName.length > 100) return jsonResponse(400, { error: 'name must be 100 characters or fewer' });

    // Validate email if provided
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) {
      return jsonResponse(400, { error: 'invalid email address' });
    }
    if (cleanEmail && cleanEmail.length > 254) {
      return jsonResponse(400, { error: 'email address too long' });
    }

    const supabase = getSupabaseClient();

    // Get active event (need meal options for validation)
    const { data: activeEvent, error: eventError } = await supabase
      .from('events')
      .select('id, meal_choice_1, meal_choice_2, meal_choice_3')
      .eq('is_active', true)
      .single();

    if (eventError && eventError.code !== 'PGRST116') throw eventError;
    if (!activeEvent) {
      return jsonResponse(404, { error: 'No active event found' });
    }

    // Validate meal_choice against event options
    if (!validateMealChoice(meal_choice, activeEvent)) {
      return jsonResponse(400, { error: 'Invalid meal choice' });
    }

    // Insert walk-in registration
    const { data: registration, error: insertError } = await supabase
      .from('registrations')
      .insert({
        event_id: activeEvent.id,
        name: cleanName,
        email: cleanEmail,
        meal_choice,
        is_walkin: true,
        payment_status: 'paid',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return jsonResponse(201, { registration });
  } catch (err) {
    console.error('add-walkin error:', err);
    return jsonResponse(500, { error: 'Unable to add walk-in. Please try again.' });
  }
};
