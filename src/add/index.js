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

/**
 * Parse the client principal from the x-ms-client-principal header
 */
function parseClientPrincipal(req) {
  const header = req.headers['x-ms-client-principal'];
  if (!header) {
    return null;
  }

  try {
    const buffer = Buffer.from(header, 'base64');
    const principal = JSON.parse(buffer.toString('utf-8'));
    return principal;
  } catch (error) {
    return null;
  }
}

/**
 * Extract group memberships from the client principal
 */
function getUserGroups(principal) {
  if (!principal || !principal.claims) {
    return [];
  }

  const groupClaims = principal.claims.filter(
    (c) => c.typ === 'groups' ||
           c.typ === 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'
  );
  return groupClaims.map((c) => c.val);
}

/**
 * Check if user is a member of the allowed security group
 */
function isUserAuthorized(groups, allowedGroupId) {
  if (!allowedGroupId) {
    return false;
  }
  return groups.includes(allowedGroupId);
}

module.exports = async function (context, req) {
  // Check authentication for /add route
  const clientPrincipal = parseClientPrincipal(req);
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

  // Check group membership
  const groups = getUserGroups(clientPrincipal);
  const allowedGroupId = process.env.ALLOWED_GROUP_ID;
  if (!isUserAuthorized(groups, allowedGroupId)) {
    // Serve access denied page
    const accessDeniedPath = path.join(__dirname, '..', 'public', 'access-denied.html');
    try {
      const content = fs.readFileSync(accessDeniedPath);
      context.res = {
        status: 403,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...SECURITY_HEADERS
        },
        body: content,
        isRaw: true
      };
    } catch (err) {
      context.log.error('Error serving access denied page:', err);
      context.res = {
        status: 403,
        headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
        body: 'Access Denied'
      };
    }
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
