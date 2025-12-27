import { v4 as uuidv4 } from 'uuid';
import { serialize, parse } from 'cookie';
import type { NextApiRequest, NextApiResponse } from 'next';

const ANON_COOKIE_NAME = 'anon_id';
const ANON_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/**
 * Get or create anonymous ID from cookie
 */
export function getOrCreateAnonId(req: NextApiRequest, res: NextApiResponse): string {
  const cookies = parse(req.headers.cookie || '');
  let anonId = cookies[ANON_COOKIE_NAME];

  if (!anonId || !isValidUUID(anonId)) {
    anonId = uuidv4();
    // Set cookie with 1 year expiry
    res.setHeader(
      'Set-Cookie',
      serialize(ANON_COOKIE_NAME, anonId, {
        maxAge: ANON_COOKIE_MAX_AGE,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      })
    );
  }

  return anonId;
}

/**
 * Get anonymous ID from cookie (without creating one)
 */
export function getAnonId(req: NextApiRequest): string | null {
  const cookies = parse(req.headers.cookie || '');
  const anonId = cookies[ANON_COOKIE_NAME];
  return anonId && isValidUUID(anonId) ? anonId : null;
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Hash IP address for rate limiting (one-way hash)
 */
export function hashIP(ip: string): string {
  // Remove IPv6 prefix if present
  const cleanIP = ip.replace(/^::ffff:/, '');
  // Use Node.js built-in crypto
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(cleanIP).digest('hex').substring(0, 32);
}

/**
 * Get client IP from request
 */
export function getClientIP(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (typeof realIP === 'string') {
    return realIP;
  }
  return req.socket.remoteAddress || 'unknown';
}

