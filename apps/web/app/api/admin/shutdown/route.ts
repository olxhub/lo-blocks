// src/app/api/admin/shutdown/route.js
function checkAccess(request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Shutdown not allowed in production' }, { status: 403 });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.ip;
  const allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];

  if (ip && !allowedIPs.includes(ip)) {
    console.log('Blocked IP:', ip);
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  return null; // Access allowed
}

export async function GET(request) {
  const accessDenied = checkAccess(request);
  if (accessDenied) {
    return accessDenied;
  }

  setTimeout(() => process.exit(0), 100);
  return Response.json({ message: 'Shutting down server...' });
}
