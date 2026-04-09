/**
 * tests/auth.test.js
 * Unit tests for netlify/functions/auth.js
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  verifyAdminToken,
  handleCors,
  getCorsHeaders,
  jsonResponse,
} = require('../netlify/functions/auth.js');

const CORRECT_PASSWORD = 'SuretyTX!2026';
const ALLOWED_ORIGIN = 'https://stsa-events.netlify.app';

// ── verifyAdminToken ──────────────────────────────────────────────────────────

describe('verifyAdminToken', () => {
  const makeEvent = (token) => ({
    headers: { 'x-admin-token': token },
  });

  beforeEach(() => {
    process.env.ADMIN_PASSWORD = CORRECT_PASSWORD;
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('returns true for correct password', () => {
    expect(verifyAdminToken(makeEvent(CORRECT_PASSWORD))).toBe(true);
  });

  it('returns false for wrong password', () => {
    expect(verifyAdminToken(makeEvent('wrongpassword'))).toBe(false);
  });

  it('returns false for empty token', () => {
    expect(verifyAdminToken(makeEvent(''))).toBe(false);
  });

  it('returns false when token header is missing', () => {
    expect(verifyAdminToken({ headers: {} })).toBe(false);
  });

  it('returns false for empty env password', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminToken(makeEvent(CORRECT_PASSWORD))).toBe(false);
  });

  it('returns false when env password is empty string', () => {
    process.env.ADMIN_PASSWORD = '';
    expect(verifyAdminToken(makeEvent(CORRECT_PASSWORD))).toBe(false);
  });

  it('timing-safe comparison rejects token of different length', () => {
    // If length check leaked timing info it would be a vulnerability;
    // verify that a token shorter than the password still returns false
    const shortToken = CORRECT_PASSWORD.slice(0, 4);
    expect(verifyAdminToken(makeEvent(shortToken))).toBe(false);
    // And a longer token
    const longToken = CORRECT_PASSWORD + CORRECT_PASSWORD;
    expect(verifyAdminToken(makeEvent(longToken))).toBe(false);
  });

  it('accepts X-Admin-Token header (case-insensitive)', () => {
    const event = { headers: { 'X-Admin-Token': CORRECT_PASSWORD } };
    expect(verifyAdminToken(event)).toBe(true);
  });
});

// ── handleCors ────────────────────────────────────────────────────────────────

describe('handleCors', () => {
  it('returns 204 for OPTIONS requests', () => {
    const event = {
      httpMethod: 'OPTIONS',
      headers: { origin: ALLOWED_ORIGIN },
    };
    const result = handleCors(event);
    expect(result).not.toBeNull();
    expect(result.statusCode).toBe(204);
    expect(result.body).toBe('');
  });

  it('returns null for non-OPTIONS requests', () => {
    const event = { httpMethod: 'GET', headers: {} };
    expect(handleCors(event)).toBeNull();
  });

  it('OPTIONS response includes CORS headers', () => {
    const event = {
      httpMethod: 'OPTIONS',
      headers: { origin: ALLOWED_ORIGIN },
    };
    const result = handleCors(event);
    expect(result.headers['Access-Control-Allow-Origin']).toBeTruthy();
    expect(result.headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(result.headers['Access-Control-Allow-Methods']).toContain('POST');
  });
});

// ── getCorsHeaders ────────────────────────────────────────────────────────────

describe('getCorsHeaders', () => {
  it('returns correct origin for allowed origins', () => {
    const event = { headers: { origin: ALLOWED_ORIGIN } };
    const headers = getCorsHeaders(event);
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
  });

  it('returns localhost for localhost origin', () => {
    const event = { headers: { origin: 'http://localhost:8888' } };
    const headers = getCorsHeaders(event);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8888');
  });

  it('falls back to default (stsa-events.netlify.app) for disallowed origins', () => {
    const event = { headers: { origin: 'https://evil.example.com' } };
    const headers = getCorsHeaders(event);
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
  });

  it('falls back to default when origin header is missing', () => {
    const event = { headers: {} };
    const headers = getCorsHeaders(event);
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
  });

  it('includes Vary: Origin header', () => {
    const event = { headers: { origin: ALLOWED_ORIGIN } };
    const headers = getCorsHeaders(event);
    expect(headers['Vary']).toBe('Origin');
  });
});

// ── jsonResponse ──────────────────────────────────────────────────────────────

describe('jsonResponse', () => {
  it('returns the correct status code', () => {
    const res = jsonResponse(200, { ok: true }, { headers: {} });
    expect(res.statusCode).toBe(200);
  });

  it('serializes body to JSON string', () => {
    const res = jsonResponse(400, { error: 'bad' }, { headers: {} });
    expect(JSON.parse(res.body)).toEqual({ error: 'bad' });
  });

  it('sets Content-Type to application/json', () => {
    const res = jsonResponse(200, {}, { headers: {} });
    expect(res.headers['Content-Type']).toBe('application/json');
  });

  it('includes security headers', () => {
    const res = jsonResponse(200, {}, { headers: {} });
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Strict-Transport-Security']).toBeTruthy();
    expect(res.headers['Referrer-Policy']).toBeTruthy();
  });
});
