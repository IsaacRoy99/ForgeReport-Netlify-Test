// Shared Netlify API client: adds the signed-in session token to API requests.
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


// Attachment links need the same Authorization header as fetch requests.
document.addEventListener('click', async (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/reports/') || !url.pathname.endsWith('/attachment/download')) return;
  event.preventDefault();
  const token = sessionStorage.getItem('authToken');
  if (!token) { window.location.href = 'login.html'; return; }
  try {
    const response = await fetch(url.pathname, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      let message = 'Could not download the attachment.';
      try { message = (await response.json()).message || message; } catch {}
      if (window.Swal) Swal.fire({ title: 'Attachment Unavailable', text: message, icon: 'error' });
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = objectUrl;
    download.download = link.dataset.filename || decodeURIComponent(response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'attachment');
    document.body.appendChild(download);
    download.click();
    download.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error('Attachment download failed:', error);
    if (window.Swal) Swal.fire({ title: 'Connection Error', text: 'Could not download the attachment.', icon: 'error' });
  }
});
