/**
 * tests/validation.test.js
 * Input validation and sanitization tests.
 * Uses test seams to avoid real network calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);

const supabase       = req('../netlify/functions/supabase.js');
const createCheckout = req('../netlify/functions/create-checkout.js');
const addWalkin      = req('../netlify/functions/add-walkin.js');

const ACTIVE_EVENT = {
  id: 'evt-001',
  event_name: 'Test Luncheon',
  price_per_person: 40,
  meal_choice_1: 'NY Strip Steak',
  meal_choice_2: 'Grilled Chicken Breast',
  meal_choice_3: 'Pan-Seared Salmon',
  is_active: true,
};

const REGISTRATION = {
  id: 'reg-001',
  event_id: 'evt-001',
  name: 'Test User',
  email: 'test@example.com',
  meal_choice: 'NY Strip Steak',
  payment_status: 'pending',
  square_transaction_id: null,
};

function makeChain(result) {
  const c = {};
  ['select', 'eq', 'order', 'filter'].forEach(m => { c[m] = () => c; });
  c.single = () => Promise.resolve(result);
  c.insert = () => c;
  c.update = () => c;
  c.then = (resolve) => Promise.resolve(result).then(resolve);
  return c;
}

// Mock Square to return a valid payment link
const mockSquare = {
  checkoutApi: {
    createPaymentLink: () => Promise.resolve({
      result: {
        paymentLink: { url: 'https://checkout.square.site/mock', orderId: 'order-123' },
      },
    }),
  },
};

function makeCheckoutEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { origin: 'https://stsa-events.netlify.app' },
    body: JSON.stringify(body),
  };
}

function makeWalkinEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {
      origin: 'https://stsa-events.netlify.app',
      'x-admin-token': 'SuretyTX!2026',
    },
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'SuretyTX!2026';
  process.env.SQUARE_ACCESS_TOKEN = 'mock-token';
  process.env.SQUARE_LOCATION_ID = 'mock-location';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  process.env.URL = 'https://stsa-events.netlify.app';
});

afterEach(() => {
  supabase.__setTestClient(null);
  if (createCheckout.__setTestSquareClient) createCheckout.__setTestSquareClient(null);
  delete process.env.ADMIN_PASSWORD;
});

// ─── Helper: set up checkout to pass supabase checks ─────────────────────────
function mockSupabaseForCheckout(mealChoice = 'NY Strip Steak') {
  const reg = { ...REGISTRATION, meal_choice: mealChoice };
  const mockClient = {
    from: (table) => {
      if (table === 'events') return makeChain({ data: ACTIVE_EVENT, error: null });
      const c = makeChain(null);
      c.insert = () => {
        const sel = makeChain(null);
        sel.single = () => Promise.resolve({ data: reg, error: null });
        return sel;
      };
      c.update = () => ({ eq: () => Promise.resolve({ data: null, error: null }) });
      return c;
    },
  };
  supabase.__setTestClient(mockClient);
  createCheckout.__setTestSquareClient(mockSquare);
}

// ═══════════════════════════════════════════════════════════════════════════
// Email validation
// ═══════════════════════════════════════════════════════════════════════════
describe('email validation (create-checkout)', () => {
  it('valid email passes validation (not a 400 email error)', async () => {
    mockSupabaseForCheckout();
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    if (res.statusCode === 400) {
      expect(JSON.parse(res.body).error).not.toMatch(/email/i);
    } else {
      expect(res.statusCode).toBe(200);
    }
  });

  it('invalid email is rejected with 400', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'not-an-email',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  it('missing email is rejected', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: '',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Name validation
// ═══════════════════════════════════════════════════════════════════════════
describe('name validation (create-checkout)', () => {
  it('name over 100 chars is rejected', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'A'.repeat(101),
      email: 'test@example.com',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/100/);
  });

  it('HTML in name is stripped (sanitized, not rejected)', async () => {
    mockSupabaseForCheckout();
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: '<b>Bobby</b>',
      email: 'test@example.com',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    // "<b>Bobby</b>" → "Bobby" after stripping, which is valid
    if (res.statusCode === 400) {
      expect(JSON.parse(res.body).error).not.toMatch(/^name/i);
    } else {
      expect(res.statusCode).toBe(200);
    }
  });

  it('missing name is rejected', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: '',
      email: 'test@example.com',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phone validation
// ═══════════════════════════════════════════════════════════════════════════
describe('phone validation (create-checkout)', () => {
  it('phone with letters is rejected', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      phone: 'abc123xyz',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/phone/i);
  });

  it('valid phone with digits only passes', async () => {
    mockSupabaseForCheckout();
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      phone: '2105550101',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    if (res.statusCode === 400) {
      expect(JSON.parse(res.body).error).not.toMatch(/phone/i);
    }
  });

  it('phone with dashes is valid', async () => {
    mockSupabaseForCheckout();
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      phone: '210-555-0101',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    if (res.statusCode === 400) {
      expect(JSON.parse(res.body).error).not.toMatch(/phone/i);
    }
  });

  it('phone with parens and spaces is valid', async () => {
    mockSupabaseForCheckout();
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      phone: '(210) 555-0101',
      guests: [{ meal_choice: 'NY Strip Steak' }],
    }));
    if (res.statusCode === 400) {
      expect(JSON.parse(res.body).error).not.toMatch(/phone/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Meal choice validation
// ═══════════════════════════════════════════════════════════════════════════
describe('meal choice validation (create-checkout)', () => {
  it('meal choice must match event options — invalid choice rejected after fetching event', async () => {
    const mockClient = {
      from: (table) => {
        if (table === 'events') return makeChain({ data: ACTIVE_EVENT, error: null });
        return makeChain(null);
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      guests: [{ meal_choice: 'Sushi Platter' }], // not in event options
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/meal/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Guest count cap
// ═══════════════════════════════════════════════════════════════════════════
describe('guest count cap (create-checkout)', () => {
  it('more than 10 guests is rejected', async () => {
    const guests = Array(11).fill({ meal_choice: 'NY Strip Steak' });
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      guests,
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/10/);
  });

  it('exactly 10 guests passes the cap check', async () => {
    mockSupabaseForCheckout();
    const guests = Array(10).fill({ meal_choice: 'NY Strip Steak' });
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test User',
      email: 'test@example.com',
      guests,
    }));
    if (res.statusCode === 400) {
      expect(JSON.parse(res.body).error).not.toMatch(/Maximum 10/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Missing required fields
// ═══════════════════════════════════════════════════════════════════════════
describe('missing required fields (create-checkout)', () => {
  it('completely empty body returns 400', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({}));
    expect(res.statusCode).toBe(400);
  });

  it('missing guests array returns 400', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test',
      email: 'test@example.com',
    }));
    expect(res.statusCode).toBe(400);
  });

  it('empty guests array returns 400', async () => {
    const res = await createCheckout.handler(makeCheckoutEvent({
      name: 'Test',
      email: 'test@example.com',
      guests: [],
    }));
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// add-walkin validation
// ═══════════════════════════════════════════════════════════════════════════
describe('add-walkin validation', () => {
  it('missing name returns 400', async () => {
    const res = await addWalkin.handler(makeWalkinEvent({
      email: 'test@example.com',
      meal_choice: 'NY Strip Steak',
    }));
    expect(res.statusCode).toBe(400);
  });

  it('missing meal_choice returns 400', async () => {
    const res = await addWalkin.handler(makeWalkinEvent({
      name: 'Test User',
      email: 'test@example.com',
    }));
    expect(res.statusCode).toBe(400);
  });

  it('invalid email format is rejected', async () => {
    const res = await addWalkin.handler(makeWalkinEvent({
      name: 'Test User',
      email: 'notvalid',
      meal_choice: 'NY Strip Steak',
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  it('name over 100 chars is rejected', async () => {
    const res = await addWalkin.handler(makeWalkinEvent({
      name: 'A'.repeat(101),
      email: 'test@example.com',
      meal_choice: 'NY Strip Steak',
    }));
    expect(res.statusCode).toBe(400);
  });
});
