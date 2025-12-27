import NextAuth, { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

// Validate SMTP configuration
const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_PASSWORD;

if (!smtpHost || !smtpUser || !smtpPassword) {
  console.error('⚠️  SMTP configuration missing! Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in your .env file');
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: smtpHost && smtpUser && smtpPassword ? {
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
        secure: Number(process.env.SMTP_PORT) === 465,
      } : undefined,
      from: process.env.SMTP_FROM || smtpUser,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
  },
  callbacks: {
    async session({ session, user }: any) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  session: {
    strategy: 'database',
  },
};

export default NextAuth(authOptions);

