const crypto = require('crypto');

const ALLOWED_ORIGINS = [
  'https://stsa-events.netlify.app',
  'http://localhost:8888',
  'http://localhost:3000',
];

function getCorsHeaders(event) {
  const origin = (event.headers && (event.headers['origin'] || event.headers['Origin'])) || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Keep a static CORS_HEADERS export for backwards compat (non-origin-sensitive uses)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://stsa-events.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};

function unauthorized(event) {
  const headers = event ? getCorsHeaders(event) : CORS_HEADERS;
  return {
    statusCode: 401,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

function verifyAdminToken(event) {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  const password = process.env.ADMIN_PASSWORD;
  if (!token || !password) {
    return false;
  }
  // Timing-safe comparison to prevent timing attacks
  try {
    const tokenBuf = Buffer.from(token);
    const passwordBuf = Buffer.from(password);
    if (tokenBuf.length !== passwordBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(tokenBuf, passwordBuf);
  } catch {
    return false;
  }
}

function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: getCorsHeaders(event),
      body: '',
    };
  }
  return null;
}

function jsonResponse(statusCode, data, event) {
  const headers = event ? getCorsHeaders(event) : CORS_HEADERS;
  return {
    statusCode,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

module.exports = { CORS_HEADERS, getCorsHeaders, unauthorized, verifyAdminToken, handleCors, jsonResponse };
