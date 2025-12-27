import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { createMollieClient } from '@mollie/api-client';

const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY || '' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Payment ID required' });
    }

    // Get payment status from Mollie
    const payment = await mollieClient.payments.get(id);

    if (payment.status === 'paid') {
      const metadata = payment.metadata as any;
      const userId = metadata?.userId;

      if (!userId) {
        console.error('No userId in payment metadata');
        return res.status(400).json({ error: 'Invalid payment metadata' });
      }

      // Find or create payment record
      let paymentRecord = await prisma.payment.findFirst({
        where: {
          userId,
          type: metadata.type === 'subscription' ? 'SUBSCRIPTION' : 'ONE_OFF',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (metadata.type === 'one_off') {
        // Add credits
        const credits = metadata.credits || 1;

        if (paymentRecord) {
          await prisma.payment.update({
            where: { id: paymentRecord.id },
            data: {
              creditsBalance: { increment: credits },
              molliePaymentId: payment.id,
              updatedAt: new Date(),
            },
          });
        } else {
          await prisma.payment.create({
            data: {
              userId,
              type: 'ONE_OFF',
              creditsBalance: credits,
              molliePaymentId: payment.id,
            },
          });
        }
      } else if (metadata.type === 'subscription') {
        // Set unlimited
        if (paymentRecord) {
          await prisma.payment.update({
            where: { id: paymentRecord.id },
            data: {
              isUnlimited: true,
              mollieSubscriptionId: payment.id,
              updatedAt: new Date(),
            },
          });
        } else {
          await prisma.payment.create({
            data: {
              userId,
              type: 'SUBSCRIPTION',
              isUnlimited: true,
              mollieSubscriptionId: payment.id,
            },
          });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
}

