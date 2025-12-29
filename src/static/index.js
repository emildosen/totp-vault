// Static file serving function
// Serves frontend files from the public directory

const fs = require('fs');
const path = require('path');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
};

module.exports = async function (context, req) {
  let requestPath = context.bindingData.path || '';

  // Skip API routes - they're handled by the totp function
  if (requestPath.startsWith('api/')) {
    context.res = {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' })
    };
    return;
  }

  // Handle /code/{id} routes - serve code/index.html and require auth
  if (requestPath.startsWith('code/') || requestPath === 'code') {
    // Check authentication for /code/* routes
    const clientPrincipal = req.headers['x-ms-client-principal'];
    if (!clientPrincipal) {
      // Redirect to Entra ID login
      context.res = {
        status: 302,
        headers: {
          'Location': '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent('/' + requestPath),
          ...SECURITY_HEADERS
        }
      };
      return;
    }
    // Serve the code page
    requestPath = 'code/index.html';
  }

  // Default to index.html for root
  if (!requestPath || requestPath === '' || requestPath === '/') {
    requestPath = 'index.html';
  }

  // Resolve file path relative to public directory
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const filePath = path.join(publicDir, requestPath);

  // Security: ensure path is within public directory (prevent directory traversal)
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(publicDir)) {
    context.res = {
      status: 403,
      headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
      body: 'Forbidden'
    };
    return;
  }

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // For SPA fallback, serve index.html for unmatched routes
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath);
        context.res = {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...SECURITY_HEADERS
          },
          body: content,
          isRaw: true
        };
        return;
      }

      context.res = {
        status: 404,
        headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
        body: 'Not found'
      };
      return;
    }

    // Read and serve the file
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    context.res = {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
        ...SECURITY_HEADERS
      },
      body: content,
      isRaw: true
    };
  } catch (err) {
    context.log.error('Error serving static file:', err);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
      body: 'Internal server error'
    };
  }
};
