import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { getAnonId } from '@/lib/anon-cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid conversion ID' });
    }

    // Get conversion
    const conversion = await prisma.conversion.findUnique({
      where: { id },
    });

    if (!conversion) {
      return res.status(404).json({ error: 'Conversion not found' });
    }

    // Check access (owner only)
    const session = await getServerSession(req, res, authOptions);
    const anonId = getAnonId(req);

    const hasAccess =
      (session?.user && conversion.ownerType === 'USER' && conversion.ownerId === session.user.id) ||
      (conversion.ownerType === 'ANON' && conversion.ownerId === anonId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Return conversion data (without full XML for security)
    return res.status(200).json({
      id: conversion.id,
      status: conversion.status,
      success: conversion.success,
      createdAt: conversion.createdAt,
      filename: conversion.filename,
      inputType: conversion.inputType,
      previewXml: conversion.previewXml,
      validationJson: conversion.validationJson,
      mappingJson: conversion.mappingJson,
      normalizedInvoiceJson: conversion.normalizedInvoiceJson,
      downloaded: conversion.downloaded,
      canDownloadFull: session?.user ? true : false, // Only logged-in users can download
    });
  } catch (error: any) {
    console.error('Get conversion error:', error);
    return res.status(500).json({
      error: 'Failed to get conversion',
      message: error.message,
    });
  }
}

