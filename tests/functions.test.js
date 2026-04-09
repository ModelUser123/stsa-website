/**
 * tests/functions.test.js
 * Unit tests for Netlify function handlers.
 * Uses test seams (__setTestClient, __setTestSquareClient) to avoid real API calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);

// ─── Import all function handlers and the seam helpers ────────────────────────
const supabase          = req('../netlify/functions/supabase.js');
const getEvent          = req('../netlify/functions/get-event.js');
const getRegistrations  = req('../netlify/functions/get-registrations.js');
const saveEvent         = req('../netlify/functions/save-event.js');
const createCheckout    = req('../netlify/functions/create-checkout.js');
const addWalkin         = req('../netlify/functions/add-walkin.js');
const updateReg         = req('../netlify/functions/update-registration.js');
const getHistory        = req('../netlify/functions/get-event-history.js');
const squareWebhook     = req('../netlify/functions/square-webhook.js');

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'SuretyTX!2026';

const ACTIVE_EVENT = {
  id: 'evt-abc',
  event_name: 'May Luncheon',
  price_per_person: 40,
  meal_choice_1: 'NY Strip Steak',
  meal_choice_2: 'Grilled Chicken Breast',
  meal_choice_3: 'Pan-Seared Salmon',
  is_active: true,
  event_date: '2026-05-14',
};

const REGISTRATION = {
  id: 'reg-001',
  event_id: 'evt-abc',
  name: 'Chris Johnson',
  email: 'chris@test.com',
  phone: '210-555-0101',
  meal_choice: 'NY Strip Steak',
  payment_status: 'pending',
  is_walkin: false,
  square_transaction_id: null,
  created_at: new Date().toISOString(),
};

// ─── Mock Supabase chain factory ──────────────────────────────────────────────
function makeChain(result) {
  const c = {};
  ['select', 'eq', 'neq', 'order', 'filter', 'limit'].forEach(m => {
    c[m] = () => c;
  });
  c.single = () => Promise.resolve(result);
  c.insert = () => c;
  c.update = () => c;
  c.delete = () => c;
  // Awaiting chain directly resolves to result
  c.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return c;
}

// ─── Event helpers ────────────────────────────────────────────────────────────
function adminEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    headers: {
      origin: 'https://stsa-events.netlify.app',
      'x-admin-token': ADMIN_PASSWORD,
    },
    body: null,
    ...overrides,
  };
}

function publicEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    headers: { origin: 'https://stsa-events.netlify.app' },
    body: null,
    ...overrides,
  };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-webhook-key';
  process.env.URL = 'https://stsa-events.netlify.app';
  process.env.SQUARE_ACCESS_TOKEN = 'mock-token';
  process.env.SQUARE_LOCATION_ID = 'mock-location';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
});

afterEach(() => {
  supabase.__setTestClient(null);
  if (createCheckout.__setTestSquareClient) {
    createCheckout.__setTestSquareClient(null);
  }
  delete process.env.ADMIN_PASSWORD;
});

// ═══════════════════════════════════════════════════════════════════════════
// get-event
// ═══════════════════════════════════════════════════════════════════════════
describe('get-event', () => {
  it('returns active event when one exists', async () => {
    const mockClient = { from: () => makeChain({ data: ACTIVE_EVENT, error: null }) };
    supabase.__setTestClient(mockClient);

    const res = await getEvent.handler(publicEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).event.id).toBe(ACTIVE_EVENT.id);
  });

  it('returns null when no active event (PGRST116)', async () => {
    const mockClient = { from: () => makeChain({ data: null, error: { code: 'PGRST116' } }) };
    supabase.__setTestClient(mockClient);

    const res = await getEvent.handler(publicEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).event).toBeNull();
  });

  it('returns 405 for non-GET requests', async () => {
    const res = await getEvent.handler(publicEvent({ httpMethod: 'POST' }));
    expect(res.statusCode).toBe(405);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// get-registrations
// ═══════════════════════════════════════════════════════════════════════════
describe('get-registrations', () => {
  it('requires admin auth', async () => {
    const res = await getRegistrations.handler(publicEvent());
    expect(res.statusCode).toBe(401);
  });

  it('returns registrations for active event', async () => {
    let callIdx = 0;
    const mockClient = {
      from: () => {
        callIdx++;
        if (callIdx === 1) {
          // First call → events table (get active event)
          return makeChain({ data: { id: 'evt-abc' }, error: null });
        }
        // Second call → registrations table (returns array, no .single())
        const c = makeChain(null);
        c.then = (resolve) => Promise.resolve({ data: [REGISTRATION], error: null }).then(resolve);
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getRegistrations.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body).registrations)).toBe(true);
  });

  it('returns empty array when no active event', async () => {
    const mockClient = { from: () => makeChain({ data: null, error: { code: 'PGRST116' } }) };
    supabase.__setTestClient(mockClient);

    const res = await getRegistrations.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).registrations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// save-event
// ═══════════════════════════════════════════════════════════════════════════
describe('save-event', () => {
  it('requires admin auth', async () => {
    const res = await saveEvent.handler(publicEvent({ httpMethod: 'POST', body: '{}' }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const res = await saveEvent.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-token': 'wrongpassword' },
      body: '{}',
    });
    expect(res.statusCode).toBe(401);
  });

  it('deactivates old events and creates new event', async () => {
    let deactivateCalled = false;
    let insertCalled = false;

    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.update = () => {
          deactivateCalled = true;
          const eq = makeChain(null);
          eq.then = (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
          return eq;
        };
        c.insert = () => {
          insertCalled = true;
          const sel = makeChain(null);
          sel.single = () => Promise.resolve({ data: { ...ACTIVE_EVENT, id: 'evt-new' }, error: null });
          return sel;
        };
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    await saveEvent.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ event_name: 'New Event' }),
    }));

    expect(deactivateCalled).toBe(true);
    expect(insertCalled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// create-checkout
// ═══════════════════════════════════════════════════════════════════════════
describe('create-checkout', () => {
  it('validates all required inputs (rejects empty body)', async () => {
    const res = await createCheckout.handler(publicEvent({
      httpMethod: 'POST',
      body: '{}',
    }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid email', async () => {
    const res = await createCheckout.handler(publicEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        name: 'Test',
        email: 'bad-email',
        guests: [{ meal_choice: 'NY Strip Steak' }],
      }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  it('creates registration in Supabase and returns checkout URL', async () => {
    let insertCalled = false;

    const mockClient = {
      from: (table) => {
        if (table === 'events') {
          return makeChain({ data: ACTIVE_EVENT, error: null });
        }
        // registrations
        const c = makeChain(null);
        c.insert = () => {
          insertCalled = true;
          const sel = makeChain(null);
          sel.single = () => Promise.resolve({ data: REGISTRATION, error: null });
          return sel;
        };
        c.update = () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        });
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    // Mock Square client
    const mockSquare = {
      checkoutApi: {
        createPaymentLink: () => Promise.resolve({
          result: {
            paymentLink: {
              url: 'https://checkout.square.site/mock',
              orderId: 'sq-order-001',
            },
          },
        }),
      },
    };
    createCheckout.__setTestSquareClient(mockSquare);

    const res = await createCheckout.handler(publicEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        phone: '210-555-0101',
        guests: [{ meal_choice: 'NY Strip Steak' }],
      }),
    }));

    expect(insertCalled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).checkoutUrl).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// add-walkin
// ═══════════════════════════════════════════════════════════════════════════
describe('add-walkin', () => {
  it('requires admin auth', async () => {
    const res = await addWalkin.handler(publicEvent({
      httpMethod: 'POST',
      body: '{}',
    }));
    expect(res.statusCode).toBe(401);
  });

  it('validates required inputs', async () => {
    const res = await addWalkin.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }), // missing name & meal_choice
    }));
    expect(res.statusCode).toBe(400);
  });

  it('creates walk-in registration', async () => {
    let insertCalled = false;
    const walkinReg = { ...REGISTRATION, is_walkin: true, payment_status: 'paid' };

    const mockClient = {
      from: (table) => {
        if (table === 'events') return makeChain({ data: ACTIVE_EVENT, error: null });
        const c = makeChain(null);
        c.insert = () => {
          insertCalled = true;
          const sel = makeChain(null);
          sel.single = () => Promise.resolve({ data: walkinReg, error: null });
          return sel;
        };
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await addWalkin.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        name: 'Walk In Guest',
        email: 'walkin@test.com',
        meal_choice: 'NY Strip Steak',
      }),
    }));

    expect(insertCalled).toBe(true);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).registration.is_walkin).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// update-registration
// ═══════════════════════════════════════════════════════════════════════════
describe('update-registration', () => {
  it('requires admin auth', async () => {
    const res = await updateReg.handler(publicEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ registrationId: 'reg-001', payment_status: 'paid' }),
    }));
    expect(res.statusCode).toBe(401);
  });

  it('updates payment status', async () => {
    let updatePayload;
    const mockClient = {
      from: () => ({
        update: (payload) => {
          updatePayload = payload;
          return {
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { ...REGISTRATION, payment_status: 'paid' },
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
    };
    supabase.__setTestClient(mockClient);

    const res = await updateReg.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ registrationId: 'reg-001', payment_status: 'paid' }),
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    expect(updatePayload.payment_status).toBe('paid');
  });

  it('updates name, email, phone, and meal_choice', async () => {
    let updatePayload;
    const mockClient = {
      from: () => ({
        update: (payload) => {
          updatePayload = payload;
          return {
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { ...REGISTRATION, ...payload },
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
    };
    supabase.__setTestClient(mockClient);

    const res = await updateReg.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        registrationId: 'reg-001',
        name: 'New Name',
        email: 'new@test.com',
        phone: '555-1234',
        meal_choice: 'Grilled Chicken Breast',
      }),
    }));

    expect(res.statusCode).toBe(200);
    expect(updatePayload.name).toBe('New Name');
    expect(updatePayload.email).toBe('new@test.com');
    expect(updatePayload.phone).toBe('555-1234');
    expect(updatePayload.meal_choice).toBe('Grilled Chicken Breast');
  });

  it('requires registrationId', async () => {
    const res = await updateReg.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ payment_status: 'paid' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/registrationId/i);
  });

  it('rejects invalid payment_status value', async () => {
    const res = await updateReg.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ registrationId: 'reg-001', payment_status: 'free' }),
    }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty name', async () => {
    const res = await updateReg.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ registrationId: 'reg-001', name: '' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/name/i);
  });

  it('rejects invalid email in update', async () => {
    const res = await updateReg.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ registrationId: 'reg-001', email: 'notvalid' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// get-event-history
// ═══════════════════════════════════════════════════════════════════════════
describe('get-event-history', () => {
  it('requires admin auth', async () => {
    const res = await getHistory.handler(publicEvent());
    expect(res.statusCode).toBe(401);
  });

  it('returns all events with aggregated stats', async () => {
    const mockClient = {
      from: (table) => {
        const c = makeChain(null);
        c.select = () => c;
        c.order = () => c;
        if (table === 'events') {
          c.then = (resolve) => Promise.resolve({ data: [ACTIVE_EVENT], error: null }).then(resolve);
        } else {
          c.then = (resolve) => Promise.resolve({ data: [REGISTRATION], error: null }).then(resolve);
        }
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getHistory.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0]).toHaveProperty('total_registrations');
    expect(body.events[0]).toHaveProperty('paid_count');
    expect(body.events[0]).toHaveProperty('revenue');
  });

  it('returns empty array when no events exist', async () => {
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.select = () => c;
        c.order = () => c;
        c.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getHistory.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).events).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// square-webhook
// ═══════════════════════════════════════════════════════════════════════════
describe('square-webhook', () => {
  const WEBHOOK_KEY = 'test-webhook-key';
  const WEBHOOK_URL = 'https://stsa-events.netlify.app/.netlify/functions/square-webhook';

  function makeWebhookEvent(body, signatureOverride) {
    const rawBody = JSON.stringify(body);
    const combined = WEBHOOK_URL + rawBody;
    const validSig = crypto.createHmac('sha256', WEBHOOK_KEY).update(combined).digest('base64');
    return {
      httpMethod: 'POST',
      headers: { 'x-square-hmacsha256-signature': signatureOverride ?? validSig },
      body: rawBody,
    };
  }

  it('verifies signature — rejects invalid signature with 403', async () => {
    const res = await squareWebhook.handler(makeWebhookEvent(
      { type: 'payment.updated', data: {} },
      'invalid-signature'
    ));
    expect(res.statusCode).toBe(403);
  });

  it('ignores non-payment events and returns 200 OK', async () => {
    const res = await squareWebhook.handler(makeWebhookEvent({ type: 'order.created', data: {} }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK');
  });

  it('ignores payment.updated with non-COMPLETED status', async () => {
    const res = await squareWebhook.handler(makeWebhookEvent({
      type: 'payment.updated',
      data: { object: { payment: { status: 'PENDING', order_id: 'order-123' } } },
    }));
    expect(res.statusCode).toBe(200);
  });

  it('updates payment status to paid for COMPLETED payment', async () => {
    let updateCalled = false;
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.single = () => Promise.resolve({ data: { id: 'reg-001' }, error: null });
        c.update = () => {
          updateCalled = true;
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        };
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await squareWebhook.handler(makeWebhookEvent({
      type: 'payment.updated',
      data: { object: { payment: { status: 'COMPLETED', order_id: 'order-123' } } },
    }));

    expect(res.statusCode).toBe(200);
    expect(updateCalled).toBe(true);
  });

  it('returns 200 when registration not found (graceful)', async () => {
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.single = () => Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await squareWebhook.handler(makeWebhookEvent({
      type: 'payment.updated',
      data: { object: { payment: { status: 'COMPLETED', order_id: 'unknown-order' } } },
    }));

    expect(res.statusCode).toBe(200);
  });
});
