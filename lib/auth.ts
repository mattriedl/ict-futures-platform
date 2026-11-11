import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// The owner email is always treated as ADMIN. First login auto-promotes.
export const OWNER_EMAIL = 'mattriedl@hotmail.com';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        // Emails are matched case-insensitively (new accounts are stored lowercase;
        // older rows may not be).
        const email = credentials.email.trim();
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
        if (!user?.password) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        // Auto-promote the owner account to ADMIN on login.
        let role = user.role;
        if (user.email.toLowerCase() === OWNER_EMAIL.toLowerCase() && role !== 'ADMIN') {
          await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
          role = 'ADMIN';
        }

        return { id: user.id, email: user.email, name: user.name, role };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role ?? 'USER';
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role ?? 'USER';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
