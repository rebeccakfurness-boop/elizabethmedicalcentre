import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, STAFF_ROLES, type SessionData } from '@/lib/auth';

// First line of defence only: every page and server action re-checks the user and their role
// against the database (src/lib/session.ts).
export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/account/:path*', '/print/:path*', '/api/files/:path*', '/api/invoices/:path*', '/api/referrals/:path*'],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions());

  if (!session.userId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    const login = new URL(pathname.startsWith('/dashboard') ? '/staff/login' : '/login', req.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith('/dashboard') && !STAFF_ROLES.includes(session.role!)) {
    return NextResponse.redirect(new URL('/portal', req.url));
  }
  if (pathname.startsWith('/portal') && session.role !== 'patient') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return res;
}
