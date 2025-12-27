import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

/**
 * Get server-side session
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Require authentication (throws if not authenticated)
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session || !session.user) {
    throw new Error('Authentication required');
  }
  return session;
}

