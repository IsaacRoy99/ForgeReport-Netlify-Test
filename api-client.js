// Shared Netlify API client: keeps the Supabase access token out of API URL parameters.
const API_URL = '/api';
(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.startsWith(API_URL + '/') && url !== API_URL) return nativeFetch(input, init);
    const route = url.slice(API_URL.length).toLowerCase();
    if (route === '/auth/login' || route === '/auth/signup' || route === '/auth/departments') return nativeFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const token = sessionStorage.getItem('authToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
})();
