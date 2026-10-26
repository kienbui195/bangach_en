import type { Response } from 'express';
import type { HubEnv } from '../config/env.js';

/** BR44: tiền tố __Host- khi chạy HTTPS (cần Secure, Path=/, không Domain). */
export const sessionCookieName = (env: HubEnv) => (env.cookieSecure ? '__Host-hub_session' : 'hub_session');

export function setSessionCookie(res: Response, env: HubEnv, raw: string) {
  res.cookie(sessionCookieName(env), raw, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: env.sessionMaxMs,
  });
}

export function clearSessionCookie(res: Response, env: HubEnv) {
  res.clearCookie(sessionCookieName(env), { httpOnly: true, secure: env.cookieSecure, sameSite: 'strict', path: '/' });
}
