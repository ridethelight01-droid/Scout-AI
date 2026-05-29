const fetch = require('node-fetch');

async function getJson(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(function() { return null; });
    if (!response.ok) {
      return { ok: false, status: response.status, data };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error.message };
  }
}

module.exports = { getJson };
