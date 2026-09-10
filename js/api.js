// Thin wrapper around the Apps Script backend.
// GET requests are used for reads (query string params).
// POST requests are sent with Content-Type: text/plain to avoid a CORS
// preflight (Apps Script web apps don't handle OPTIONS requests) — the
// body is still JSON, just parsed manually server-side.

const Api = (() => {
  const TOKEN_KEY = 'ksa_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function get(action, params = {}) {
    const url = new URL(APP_CONFIG.API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', getToken() || '');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    return res.json();
  }

  async function post(action, payload = {}) {
    const res = await fetch(APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), ...payload })
    });
    return res.json();
  }

  return {
    getToken, setToken, clearToken,
    login: (passcode) => post('login', { passcode }),
    getSchedule: () => get('getSchedule'),
    getAssignments: () => get('getAssignments'),
    addAssignment: (data) => post('addAssignment', data),
    updateAssignment: (data) => post('updateAssignment', data),
    deleteAssignment: (id) => post('deleteAssignment', { id }),
  };
})();
