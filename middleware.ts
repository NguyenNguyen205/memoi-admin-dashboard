import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    const basicAuth = req.headers.get('authorization');
    const url = req.nextUrl;

    // We only want to require auth for the actual dashboard routes.
    // We bypass standard Next.js assets (_next, favicon, etc) to prevent weird loading bugs.
    if (
        url.pathname.startsWith('/_next') ||
        url.pathname.includes('favicon.ico') ||
        url.pathname.startsWith('/api') // Exclude APIs if external webhooks need to hit them
    ) {
        return NextResponse.next();
    }

    if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        // Decode the base64 string sent by the browser
        const [user, pwd] = atob(authValue).split(':');

        // Check against our environment variables
        const validUser = process.env.ADMIN_USERNAME;
        const validPassword = process.env.ADMIN_PASSWORD;

        if (user === validUser && pwd === validPassword) {
            return NextResponse.next();
        }
    }

    // If no auth header or wrong credentials, trigger the browser's native login prompt
    url.pathname = '/api/auth';
    return new NextResponse('Auth required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Secure Admin OS"',
        },
    });
}

// Ensure the middleware runs on all paths
export const config = {
    matcher: '/:path*',
};