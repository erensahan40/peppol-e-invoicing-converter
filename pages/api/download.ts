import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { checkUserQuota, useUserCredit } from '@/lib/quota';
import { getAnonId } from '@/lib/anon-cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { conversionId } = req.body;

    if (!conversionId) {
      return res.status(400).json({ error: 'conversionId is required' });
    }

    // Get conversion
    const conversion = await prisma.conversion.findUnique({
      where: { id: conversionId },
    });

    if (!conversion) {
      return res.status(404).json({ error: 'Conversion not found' });
    }

    // Check if user is authenticated
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return res.status(401).json({
        error: 'Authentication required',
        needsLogin: true,
      });
    }

    const userId = session.user.id;

    // Verify ownership or allow claiming anonymous conversions
    const isOwner = 
      (conversion.ownerType === 'USER' && conversion.ownerId === userId) ||
      (conversion.ownerType === 'ANON' && conversion.ownerId === getAnonId(req));

    if (!isOwner) {
      // Try to claim anonymous conversion if user logged in with matching anon ID
      const anonId = getAnonId(req);
      if (conversion.ownerType === 'ANON' && conversion.ownerId === anonId) {
        // Claim the conversion for the user
        await prisma.conversion.update({
          where: { id: conversionId },
          data: {
            ownerType: 'USER',
            ownerId: userId,
          },
        });
      } else {
        return res.status(403).json({ error: 'Not authorized to download this conversion' });
      }
    } else if (conversion.ownerType === 'ANON') {
      // Claim anonymous conversion for logged-in user
      await prisma.conversion.update({
        where: { id: conversionId },
        data: {
          ownerType: 'USER',
          ownerId: userId,
        },
      });
    }

    // Check user quota/payment status
    const quota = await checkUserQuota(userId);

    if (!quota.hasQuota && !quota.isUnlimited) {
      // User needs to purchase credits or subscription
      return res.status(402).json({
        error: 'Payment required',
        needsPayment: true,
        conversionId,
      });
    }

    // Check if conversion was successful
    if (!conversion.success) {
      return res.status(400).json({
        error: 'Conversion was not successful',
        message: 'You can only download successful conversions',
      });
    }

    // Use a credit if not unlimited (pay on success)
    if (!quota.isUnlimited) {
      const creditUsed = await useUserCredit(userId);
      if (!creditUsed) {
        return res.status(402).json({
          error: 'Insufficient credits',
          needsPayment: true,
        });
      }
    }

    // Create download token (valid for 1 hour)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const downloadToken = await prisma.downloadToken.create({
      data: {
        conversionId: conversion.id,
        ownerType: 'USER',
        ownerId: userId,
        expiresAt,
      },
    });

    // Mark conversion as downloaded
    await prisma.conversion.update({
      where: { id: conversionId },
      data: {
        downloaded: true,
        downloadedAt: new Date(),
      },
    });

    // Return download URL (or file data)
    if (!conversion.fullXml) {
      return res.status(500).json({ error: 'Full XML not available' });
    }

    return res.status(200).json({
      success: true,
      downloadToken: downloadToken.id,
      xml: conversion.fullXml,
      filename: `${conversion.originalFileName.replace(/\.[^/.]+$/, '')}.xml`,
    });
  } catch (error: any) {
    console.error('Download error:', error);
    return res.status(500).json({
      error: 'Download failed',
      message: error.message,
    });
  }
}

