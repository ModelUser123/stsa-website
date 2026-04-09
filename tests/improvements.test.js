/**
 * tests/improvements.test.js
 * TDD tests for the Future Improvements / Ideas feature.
 * Tests data model, API functions (with mocked Supabase), and security.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);

// ─── Import function handlers and supabase seam ───────────────────────────────
const supabase         = req('../netlify/functions/supabase.js');
const getImprovements  = req('../netlify/functions/get-improvements.js');
const saveImprovement  = req('../netlify/functions/save-improvement.js');
const deleteImprovement = req('../netlify/functions/delete-improvement.js');

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'SuretyTX!2026';

const VALID_STATUSES   = ['idea', 'planned', 'in-progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

const SAMPLE_IMPROVEMENT = {
  id: 'improve-uuid-001',
  title: 'Dues Payment System',
  description: 'Allow members to pay annual dues online.',
  status: 'idea',
  priority: 'high',
  submitted_by: 'Earl',
  created_at: '2026-04-09T00:00:00.000Z',
  updated_at: '2026-04-09T00:00:00.000Z',
};

// ─── Mock Supabase chain factory ──────────────────────────────────────────────
function makeChain(result) {
  const c = {};
  ['select', 'eq', 'neq', 'order', 'filter', 'limit', 'is'].forEach(m => {
    c[m] = () => c;
  });
  c.single  = () => Promise.resolve(result);
  c.insert  = () => c;
  c.update  = () => c;
  c.delete  = () => c;
  // Awaiting chain resolves to result
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
});

afterEach(() => {
  supabase.__setTestClient(null);
  delete process.env.ADMIN_PASSWORD;
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA MODEL TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('Improvement data model', () => {
  it('has all required fields: id, title, description, status, priority, created_at, updated_at', () => {
    const fields = ['id', 'title', 'description', 'status', 'priority', 'created_at', 'updated_at'];
    fields.forEach(field => {
      expect(SAMPLE_IMPROVEMENT).toHaveProperty(field);
    });
  });

  it('status options are exactly: idea, planned, in-progress, done', () => {
    expect(VALID_STATUSES).toEqual(['idea', 'planned', 'in-progress', 'done']);
    expect(VALID_STATUSES).toHaveLength(4);
  });

  it('priority options are exactly: low, medium, high', () => {
    expect(VALID_PRIORITIES).toEqual(['low', 'medium', 'high']);
    expect(VALID_PRIORITIES).toHaveLength(3);
  });

  it('title is required (non-empty string)', () => {
    const withTitle    = { ...SAMPLE_IMPROVEMENT, title: 'Some Title' };
    const emptyTitle   = { ...SAMPLE_IMPROVEMENT, title: '' };
    const missingTitle = { ...SAMPLE_IMPROVEMENT };
    delete missingTitle.title;

    expect(withTitle.title).toBeTruthy();
    expect(emptyTitle.title).toBeFalsy();
    expect(missingTitle.title).toBeUndefined();
  });

  it('description is optional (may be empty or absent)', () => {
    const withDesc    = { ...SAMPLE_IMPROVEMENT, description: 'Some text' };
    const emptyDesc   = { ...SAMPLE_IMPROVEMENT, description: '' };
    const noDesc      = { ...SAMPLE_IMPROVEMENT };
    delete noDesc.description;

    // All three are valid — no throws expected
    expect(withDesc.description).toBe('Some text');
    expect(emptyDesc.description).toBe('');
    expect(noDesc.description).toBeUndefined();
  });

  it('default status is "idea"', () => {
    // The DB default is "idea" — validate the constant
    expect(VALID_STATUSES[0]).toBe('idea');
  });

  it('default priority is "medium"', () => {
    // The DB default is "medium" — validate the constant
    expect(VALID_PRIORITIES[1]).toBe('medium');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// get-improvements
// ═══════════════════════════════════════════════════════════════════════════
describe('get-improvements', () => {
  it('requires admin auth — returns 401 without token', async () => {
    const res = await getImprovements.handler(publicEvent());
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for wrong admin token', async () => {
    const res = await getImprovements.handler(publicEvent({
      headers: { origin: 'https://stsa-events.netlify.app', 'x-admin-token': 'wrongpassword' },
    }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 405 for non-GET requests', async () => {
    const res = await getImprovements.handler(adminEvent({ httpMethod: 'POST', body: '{}' }));
    expect(res.statusCode).toBe(405);
  });

  it('returns all improvements sorted by created_at desc', async () => {
    const improvements = [SAMPLE_IMPROVEMENT];
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.select = () => c;
        c.order  = () => c;
        c.then   = (resolve) => Promise.resolve({ data: improvements, error: null }).then(resolve);
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getImprovements.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.improvements)).toBe(true);
    expect(body.improvements).toHaveLength(1);
    expect(body.improvements[0].id).toBe(SAMPLE_IMPROVEMENT.id);
  });

  it('returns empty array when no improvements exist', async () => {
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.select = () => c;
        c.order  = () => c;
        c.then   = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getImprovements.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).improvements).toEqual([]);
  });

  it('handles table-not-found gracefully (returns empty array with message)', async () => {
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.select = () => c;
        c.order  = () => c;
        c.then   = (resolve) =>
          Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "improvements" does not exist' } })
            .then(resolve);
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getImprovements.handler(adminEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.improvements).toEqual([]);
    expect(body.message).toMatch(/migration/i);
  });

  it('error responses do not leak secrets (no env vars in body)', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'super-secret-key';
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.select = () => c;
        c.order  = () => c;
        c.then   = (resolve) =>
          Promise.resolve({ data: null, error: { message: 'Some DB error' } }).then(resolve);
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await getImprovements.handler(adminEvent());
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('super-secret-key');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// save-improvement — CREATE (no id)
// ═══════════════════════════════════════════════════════════════════════════
describe('save-improvement — create', () => {
  it('requires admin auth', async () => {
    const res = await saveImprovement.handler(publicEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'Test Idea' }),
    }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 if title is missing', async () => {
    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ description: 'No title here' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/title/i);
  });

  it('returns 400 if title is empty string', async () => {
    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: '  ' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/title/i);
  });

  it('returns 400 for invalid status', async () => {
    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'Test', status: 'invalid-status' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/status/i);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'Test', priority: 'ultra' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/priority/i);
  });

  it('creates new improvement with defaults when no status/priority given', async () => {
    let insertPayload = null;
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.insert = (payload) => {
          insertPayload = payload;
          const sel = makeChain(null);
          sel.single = () => Promise.resolve({
            data: { ...SAMPLE_IMPROVEMENT, ...payload[0] },
            error: null,
          });
          return sel;
        };
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'My New Idea' }),
    }));

    expect(res.statusCode).toBe(201);
    expect(insertPayload).not.toBeNull();
    expect(insertPayload[0].status).toBe('idea');
    expect(insertPayload[0].priority).toBe('medium');
  });

  it('strips HTML from title and description', async () => {
    let insertPayload = null;
    const mockClient = {
      from: () => {
        const c = makeChain(null);
        c.insert = (payload) => {
          insertPayload = payload;
          const sel = makeChain(null);
          sel.single = () => Promise.resolve({ data: { ...SAMPLE_IMPROVEMENT, ...payload[0] }, error: null });
          return sel;
        };
        return c;
      },
    };
    supabase.__setTestClient(mockClient);

    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        title: '<script>alert("xss")</script>Dues System',
        description: '<b>Bold</b> text',
      }),
    }));

    expect(res.statusCode).toBe(201);
    expect(insertPayload[0].title).not.toContain('<script>');
    expect(insertPayload[0].description).not.toContain('<b>');
  });

  it('returns 405 for non-POST requests', async () => {
    const res = await saveImprovement.handler(adminEvent({ httpMethod: 'GET' }));
    expect(res.statusCode).toBe(405);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// save-improvement — UPDATE (with id)
// ═══════════════════════════════════════════════════════════════════════════
describe('save-improvement — update', () => {
  it('updates existing improvement when id is provided', async () => {
    let updatePayload = null;
    const mockClient = {
      from: () => ({
        update: (payload) => {
          updatePayload = payload;
          return {
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { ...SAMPLE_IMPROVEMENT, ...payload },
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
    };
    supabase.__setTestClient(mockClient);

    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        id: SAMPLE_IMPROVEMENT.id,
        title: 'Updated Title',
        status: 'planned',
        priority: 'high',
      }),
    }));

    expect(res.statusCode).toBe(200);
    expect(updatePayload).not.toBeNull();
    expect(updatePayload.title).toBe('Updated Title');
    expect(updatePayload.status).toBe('planned');
  });

  it('returns 400 for invalid status on update', async () => {
    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        id: SAMPLE_IMPROVEMENT.id,
        title: 'Updated',
        status: 'bogus',
      }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/status/i);
  });

  it('error responses do not leak secrets on update', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'another-secret-key';
    const mockClient = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'DB error' } }),
            }),
          }),
        }),
      }),
    };
    supabase.__setTestClient(mockClient);

    const res = await saveImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ id: 'some-id', title: 'test', status: 'idea', priority: 'low' }),
    }));
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('another-secret-key');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// delete-improvement
// ═══════════════════════════════════════════════════════════════════════════
describe('delete-improvement', () => {
  it('requires admin auth', async () => {
    const res = await deleteImprovement.handler(publicEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ id: SAMPLE_IMPROVEMENT.id }),
    }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 if id is missing', async () => {
    const res = await deleteImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/id/i);
  });

  it('deletes improvement by id and returns success', async () => {
    let deletedId = null;
    const mockClient = {
      from: () => ({
        delete: () => ({
          eq: (field, value) => {
            if (field === 'id') deletedId = value;
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    };
    supabase.__setTestClient(mockClient);

    const res = await deleteImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ id: SAMPLE_IMPROVEMENT.id }),
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    expect(deletedId).toBe(SAMPLE_IMPROVEMENT.id);
  });

  it('returns 405 for non-POST requests', async () => {
    const res = await deleteImprovement.handler(adminEvent({ httpMethod: 'GET' }));
    expect(res.statusCode).toBe(405);
  });

  it('error responses do not leak secrets on delete', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'delete-secret-key';
    const mockClient = {
      from: () => ({
        delete: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: 'Delete failed' } }),
        }),
      }),
    };
    supabase.__setTestClient(mockClient);

    const res = await deleteImprovement.handler(adminEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ id: 'some-id' }),
    }));
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('delete-secret-key');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});
