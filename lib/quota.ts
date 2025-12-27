import { prisma } from './prisma';
import { hashIP, getClientIP } from './anon-cookie';
import type { NextApiRequest } from 'next';

const FREE_CONVERSION_LIMIT = 3;
const MAX_UPLOADS_PER_DAY = 10;

/**
 * Check if anonymous user has free conversions left
 */
export async function checkAnonQuota(anonId: string, req: NextApiRequest): Promise<{
  hasQuota: boolean;
  freeLeft: number;
  isLimited: boolean;
  rateLimited: boolean;
}> {
  // Get or create anon usage record
  let anonUsage = await prisma.anonUsage.findUnique({
    where: { anonId },
  });

  if (!anonUsage) {
    const ip = getClientIP(req);
    const ipHash = hashIP(ip);
    
    anonUsage = await prisma.anonUsage.create({
      data: {
        anonId,
        ipHash,
        successCount: 0,
        totalCount: 0,
      },
    });
  }

  // Update last seen
  await prisma.anonUsage.update({
    where: { anonId },
    data: { lastSeen: new Date() },
  });

  // Check rate limit (max 10 uploads per day)
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  if (anonUsage.lastSeen > oneDayAgo && anonUsage.totalCount >= MAX_UPLOADS_PER_DAY) {
    return {
      hasQuota: false,
      freeLeft: Math.max(0, FREE_CONVERSION_LIMIT - anonUsage.successCount),
      isLimited: true,
      rateLimited: true,
    };
  }

  // Check free conversion limit
  const freeLeft = Math.max(0, FREE_CONVERSION_LIMIT - anonUsage.successCount);
  const hasQuota = freeLeft > 0;

  return {
    hasQuota,
    freeLeft,
    isLimited: !hasQuota,
    rateLimited: false,
  };
}

/**
 * Increment anonymous usage counters
 */
export async function incrementAnonUsage(
  anonId: string,
  success: boolean,
  req: NextApiRequest
): Promise<void> {
  const ip = getClientIP(req);
  const ipHash = hashIP(ip);

  const existing = await prisma.anonUsage.findUnique({
    where: { anonId },
  });

  if (existing) {
    await prisma.anonUsage.update({
      where: { anonId },
      data: {
        totalCount: { increment: 1 },
        successCount: success ? { increment: 1 } : undefined,
        lastSeen: new Date(),
        ipHash,
      },
    });
  } else {
    await prisma.anonUsage.create({
      data: {
        anonId,
        totalCount: 1,
        successCount: success ? 1 : 0,
        ipHash,
        lastSeen: new Date(),
      },
    });
  }
}

/**
 * Check user quota (for logged-in users)
 */
export async function checkUserQuota(userId: string): Promise<{
  hasQuota: boolean;
  creditsLeft: number;
  isUnlimited: boolean;
}> {
  const payment = await prisma.payment.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!payment) {
    // User has no payment record, no quota
    return {
      hasQuota: false,
      creditsLeft: 0,
      isUnlimited: false,
    };
  }

  if (payment.isUnlimited) {
    return {
      hasQuota: true,
      creditsLeft: Infinity,
      isUnlimited: true,
    };
  }

  return {
    hasQuota: payment.creditsBalance > 0,
    creditsLeft: payment.creditsBalance,
    isUnlimited: false,
  };
}

/**
 * Use a credit for a user (for successful conversion download)
 */
export async function useUserCredit(userId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!payment) {
    return false;
  }

  if (payment.isUnlimited) {
    return true; // Unlimited, no credit needed
  }

  if (payment.creditsBalance <= 0) {
    return false;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      creditsBalance: { decrement: 1 },
    },
  });

  return true;
}

