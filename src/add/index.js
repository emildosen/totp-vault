// Static file serving function for /add route
// Serves the add TOTP secret page

const fs = require('fs');
const path = require('path');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
};

module.exports = async function (context, req) {
  // Check authentication for /add route
  const clientPrincipal = req.headers['x-ms-client-principal'];
  if (!clientPrincipal) {
    // Redirect to Entra ID login
    context.res = {
      status: 302,
      headers: {
        'Location': '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent('/add'),
        ...SECURITY_HEADERS
      }
    };
    return;
  }

  // Serve the add page
  const addPath = path.join(__dirname, '..', 'public', 'add', 'index.html');

  try {
    const content = fs.readFileSync(addPath);
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...SECURITY_HEADERS
      },
      body: content,
      isRaw: true
    };
  } catch (err) {
    context.log.error('Error serving add page:', err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
      body: 'Internal server error'
    };
  }
};
