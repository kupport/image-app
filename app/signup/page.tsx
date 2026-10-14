import { connection } from 'next/server';
import SiteHeader from '@/components/SiteHeader';
import AuthForm from '@/components/AuthForm';

export default async function SignupPage() {
  // Dynamic rendering is required so Next.js can apply the per-request CSP nonce from proxy.ts
  await connection();

  return (
    <>
      <SiteHeader />
      <main className="content auth">
        <h1>Create account</h1>
        <AuthForm mode="signup" />
      </main>
    </>
  );
}
