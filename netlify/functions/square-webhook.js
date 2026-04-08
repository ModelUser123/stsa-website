const crypto = require('crypto');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const rawBody = event.body || '';
    const signature = event.headers['x-square-hmacsha256-signature'];
    const notificationUrl = `${process.env.URL}/.netlify/functions/square-webhook`;

    // Verify Square webhook signature
    const combined = notificationUrl + rawBody;
    const expected = crypto
      .createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
      .update(combined)
      .digest('base64');

    if (signature !== expected) {
      console.warn('square-webhook: invalid signature');
      return { statusCode: 403, body: 'Forbidden' };
    }

    const body = JSON.parse(rawBody);

    // Only process payment.updated events where status is COMPLETED
    if (body.type !== 'payment.updated') {
      return { statusCode: 200, body: 'OK' };
    }

    const payment = body?.data?.object?.payment;
    if (!payment || payment.status !== 'COMPLETED') {
      return { statusCode: 200, body: 'OK' };
    }

    const orderId = payment.order_id;
    if (!orderId) {
      console.warn('square-webhook: no order_id in payment.updated event');
      return { statusCode: 200, body: 'OK' };
    }

    const supabase = getSupabaseClient();

    // Find primary registration by square_transaction_id
    const { data: primaryRegistration, error: findError } = await supabase
      .from('registrations')
      .select('id')
      .eq('square_transaction_id', orderId)
      .single();

    if (findError && findError.code !== 'PGRST116') throw findError;
    if (!primaryRegistration) {
      console.warn(`square-webhook: no registration found for orderId ${orderId}`);
      return { statusCode: 200, body: 'OK' };
    }

    // Update primary registration to paid
    const { error: primaryUpdateError } = await supabase
      .from('registrations')
      .update({ payment_status: 'paid' })
      .eq('id', primaryRegistration.id);

    if (primaryUpdateError) throw primaryUpdateError;

    // Update all linked additional guests to paid
    const { error: additionalUpdateError } = await supabase
      .from('registrations')
      .update({ payment_status: 'paid' })
      .eq('primary_registration_id', primaryRegistration.id);

    if (additionalUpdateError) throw additionalUpdateError;

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('square-webhook error:', err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
