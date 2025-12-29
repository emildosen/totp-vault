// Static file serving function for /code/* routes
// Serves the TOTP code display page

const fs = require('fs');
const path = require('path');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
};

module.exports = async function (context, req) {
  // Check authentication for /code/* routes
  const clientPrincipal = req.headers['x-ms-client-principal'];
  if (!clientPrincipal) {
    // Redirect to Entra ID login
    const redirectPath = '/code/' + (context.bindingData.path || '');
    context.res = {
      status: 302,
      headers: {
        'Location': '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(redirectPath),
        ...SECURITY_HEADERS
      }
    };
    return;
  }

  // Serve the code page
  const codePath = path.join(__dirname, '..', 'public', 'code', 'index.html');

  try {
    const content = fs.readFileSync(codePath);
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
    context.log.error('Error serving code page:', err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
      body: 'Internal server error'
    };
  }
};
