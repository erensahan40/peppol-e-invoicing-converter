import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { createMollieClient } from '@mollie/api-client';

const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY || '' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = session.user.id;
    const { type, conversionId } = req.body; // type: 'one_off' | 'subscription', conversionId for one_off

    if (!type || !['one_off', 'subscription'].includes(type)) {
      return res.status(400).json({ error: 'Invalid payment type' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { payments: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (type === 'one_off') {
      // One-off payment: €2 for 1 credit
      const amount = { value: '2.00', currency: 'EUR' };
      const description = '1 Conversie Credit';

      // Create Mollie payment
      const payment = await mollieClient.payments.create({
        amount,
        description,
        redirectUrl: `${process.env.NEXTAUTH_URL}/pricing?payment=success`,
        webhookUrl: `${process.env.NEXTAUTH_URL}/api/payments/webhook`,
        metadata: {
          userId: String(userId),
          type: 'one_off',
          credits: '1',
          conversionId: conversionId || '',
        },
      });

      const checkoutUrl = payment._links?.checkout?.href || '';

      return res.status(200).json({
        checkoutUrl,
        paymentId: payment.id,
      });
    } else if (type === 'subscription') {
      // Subscription: €20/month unlimited
      const amount = { value: '20.00', currency: 'EUR' };
      const description = 'Unlimited Conversies - Maandelijks';

      // Check if user already has a subscription
      const existingPayment = user.payments.find(
        (p: any) => p.type === 'SUBSCRIPTION' && p.isUnlimited
      );

      if (existingPayment) {
        return res.status(400).json({
          error: 'You already have an active subscription',
        });
      }

      // Create Mollie payment (for first month)
      const payment = await mollieClient.payments.create({
        amount,
        description,
        redirectUrl: `${process.env.NEXTAUTH_URL}/pricing?payment=success&subscription=true`,
        webhookUrl: `${process.env.NEXTAUTH_URL}/api/payments/webhook`,
        metadata: {
          userId: String(userId),
          type: 'subscription',
          isUnlimited: 'true',
        },
      });

      const checkoutUrl = payment._links?.checkout?.href || '';

      return res.status(200).json({
        checkoutUrl,
        paymentId: payment.id,
      });
    }
  } catch (error: any) {
    console.error('Checkout error:', error);
    return res.status(500).json({
      error: 'Checkout failed',
      message: error.message,
    });
  }
}

