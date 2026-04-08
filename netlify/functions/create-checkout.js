const { handleCors, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');
const { Client, Environment } = require('square');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const { name, email, phone, guests } = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!name || !email || !guests || !Array.isArray(guests) || guests.length === 0) {
      return jsonResponse(400, { error: 'name, email, and a non-empty guests array are required' });
    }

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

    // Insert primary registration (first guest)
    const primaryGuest = guests[0];
    const { data: primaryRegistration, error: primaryError } = await supabase
      .from('registrations')
      .insert({
        event_id: activeEvent.id,
        name,
        email,
        phone: phone || null,
        meal_choice: primaryGuest.meal_choice || null,
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
        name: guest.name,
        email,
        phone: phone || null,
        meal_choice: guest.meal_choice || null,
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
      Netlify.env.get('SQUARE_ENVIRONMENT') === 'production'
        ? Environment.Production
        : Environment.Sandbox;

    const squareClient = new Client({
      accessToken: Netlify.env.get('SQUARE_ACCESS_TOKEN'),
      environment: squareEnvironment,
    });

    const guestCount = guests.length;
    const pricePerPerson = activeEvent.price_per_person || 0;
    const totalAmountCents = BigInt(Math.round(pricePerPerson * guestCount * 100));

    const { result: checkoutResult, statusCode } = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: primaryRegistration.id,
      order: {
        locationId: Netlify.env.get('SQUARE_LOCATION_ID'),
        lineItems: [
          {
            name: `${activeEvent.name || 'Event'} — ${guestCount} guest${guestCount !== 1 ? 's' : ''}`,
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
        redirectUrl: `${Netlify.env.get('URL')}/rsvp/confirmation.html?reg=${primaryRegistration.id}`,
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
    return jsonResponse(500, { error: 'Internal server error' });
  }
};
