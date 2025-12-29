const fs = require('fs');
const path = require('path');

module.exports = async function (context, req) {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');

  try {
    const content = fs.readFileSync(indexPath);
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      },
      body: content,
      isRaw: true
    };
  } catch (err) {
    context.log.error('Error serving index.html:', err);
    context.res = {
      status: 500,
      body: 'Internal server error'
    };
  }
};
