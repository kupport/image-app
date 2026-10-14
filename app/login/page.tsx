import { connection } from 'next/server';
import SiteHeader from '@/components/SiteHeader';
import AuthForm from '@/components/AuthForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Dynamic rendering is required so Next.js can apply the per-request CSP nonce from proxy.ts
  await connection();
  const { error } = await searchParams;

  return (
    <>
      <SiteHeader />
      <main className="content auth">
        <h1>Log in</h1>
        <AuthForm
          mode="login"
          initialError={error === 'confirm' ? 'That confirmation link is invalid or has expired.' : undefined}
        />
      </main>
    </>
  );
}
