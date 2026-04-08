const { handleCors, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');
const { Client, Environment } = require('square');

// ── Input sanitisation helpers ───────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s\-\(\)\+\.]{0,20}$/;

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

function validateInputs(name, email, phone) {
  if (!name || typeof name !== 'string') return 'name is required';
  const cleanName = stripHtml(name);
  if (cleanName.length === 0) return 'name cannot be empty';
  if (cleanName.length > 100) return 'name must be 100 characters or fewer';

  if (!email || typeof email !== 'string') return 'email is required';
  if (!EMAIL_RE.test(email.trim())) return 'invalid email address';
  if (email.length > 254) return 'email address too long';

  if (phone && !PHONE_RE.test(phone)) return 'invalid phone number format';

  return null; // valid
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

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const { name, email, phone, guests } = body;

    // Validate required fields
    if (!name || !email || !guests || !Array.isArray(guests) || guests.length === 0) {
      return jsonResponse(400, { error: 'name, email, and a non-empty guests array are required' });
    }

    const inputError = validateInputs(name, email, phone);
    if (inputError) return jsonResponse(400, { error: inputError });

    const cleanName = stripHtml(name);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : null;

    const supabase = getSupabaseClient();

    // Get active event
    const { data: activeEvent, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('is_active', true)
      .single();

    if (eventError && eventError.code !== 'PGRST116') throw eventError;
    if (!activeEvent) {
      return jsonResponse(404, { error: 'No active event found' });
    }

    // Validate guest count (cap at 10 to prevent abuse)
    if (guests.length > 10) {
      return jsonResponse(400, { error: 'Maximum 10 guests per registration' });
    }

    // Validate each guest's meal_choice
    for (let i = 0; i < guests.length; i++) {
      const guest = guests[i];
      if (!guest.meal_choice) {
        return jsonResponse(400, { error: `Guest ${i + 1} is missing meal_choice` });
      }
      if (!validateMealChoice(guest.meal_choice, activeEvent)) {
        return jsonResponse(400, { error: `Invalid meal choice for guest ${i + 1}` });
      }
      // Sanitize additional guest names
      if (i > 0 && guest.name) {
        const cleanGuestName = stripHtml(guest.name);
        if (cleanGuestName.length === 0 || cleanGuestName.length > 100) {
          return jsonResponse(400, { error: `Invalid name for guest ${i + 1}` });
        }
        guest.name = cleanGuestName;
      }
    }

    // Square sandbox warning
    if (process.env.SQUARE_ENVIRONMENT !== 'production') {
      console.warn('⚠️  Square is running in SANDBOX mode — no real payments will be processed.');
    }

    // Insert primary registration (first guest)
    const { data: primaryRegistration, error: primaryError } = await supabase
      .from('registrations')
      .insert({
        event_id: activeEvent.id,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        meal_choice: guests[0].meal_choice,
        is_additional_guest: false,
        payment_status: 'pending',
      })
      .select()
      .single();

    if (primaryError) throw primaryError;

    // Insert additional guests (guests[1+])
    if (guests.length > 1) {
      const additionalGuests = guests.slice(1).map((guest) => ({
        event_id: activeEvent.id,
        name: guest.name || cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        meal_choice: guest.meal_choice,
        is_additional_guest: true,
        primary_registration_id: primaryRegistration.id,
        payment_status: 'pending',
      }));

      const { error: additionalError } = await supabase
        .from('registrations')
        .insert(additionalGuests);

      if (additionalError) throw additionalError;
    }

    // Create Square payment link
    const squareEnvironment =
      process.env.SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox;

    const squareClient = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: squareEnvironment,
    });

    const guestCount = guests.length;
    const pricePerPerson = activeEvent.price_per_person || 0;
    const totalAmountCents = BigInt(Math.round(pricePerPerson * guestCount * 100));

    const { result: checkoutResult } = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: primaryRegistration.id,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `${activeEvent.event_name || 'STSA Event'} — ${guestCount} guest${guestCount !== 1 ? 's' : ''}`,
            quantity: '1',
            basePriceMoney: {
              amount: totalAmountCents,
              currency: 'USD',
            },
          },
        ],
        metadata: {
          registration_id: primaryRegistration.id,
        },
      },
      checkoutOptions: {
        redirectUrl: `${process.env.URL}/rsvp/confirmation.html?reg=${primaryRegistration.id}`,
      },
    });

    if (!checkoutResult || !checkoutResult.paymentLink) {
      throw new Error('Square did not return a payment link');
    }

    const orderId = checkoutResult.paymentLink.orderId;
    const checkoutUrl = checkoutResult.paymentLink.url;

    // Store orderId on the primary registration
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ square_transaction_id: orderId })
      .eq('id', primaryRegistration.id);

    if (updateError) throw updateError;

    return jsonResponse(200, {
      checkoutUrl,
      registrationId: primaryRegistration.id,
    });
  } catch (err) {
    console.error('create-checkout error:', err);
    return jsonResponse(500, { error: 'Unable to process registration. Please try again or contact the organizer.' });
  }
};
