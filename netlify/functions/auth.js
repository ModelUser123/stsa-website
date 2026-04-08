const bcrypt = require('bcryptjs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function unauthorized() {
  return {
    statusCode: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

async function verifyAdminToken(event) {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!token || !hash) {
    return false;
  }
  return bcrypt.compare(token, hash);
}

function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }
  return null;
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

module.exports = { CORS_HEADERS, unauthorized, verifyAdminToken, handleCors, jsonResponse };
