import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SiteHeader from '@/components/SiteHeader';
import TryOn from '@/components/TryOn';

export default async function Home() {
  // Dynamic rendering is required so Next.js can apply the per-request CSP nonce from proxy.ts
  await connection();

  // proxy.ts already redirects signed-out visitors; this covers requests it skips (e.g. prefetches)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const userName = profile?.full_name ?? user.user_metadata.full_name ?? user.email;

  return (
    <>
      <SiteHeader userName={userName} />
      <main className="content">
        <ol className="breadcrumb">
          <li><a href="#">Home</a></li>
          <li><a href="#">Try-On</a></li>
          <li aria-current="page">Generate</li>
        </ol>

        <h1>Virtual Try-On</h1>

        <div className="chips" aria-label="Accepted formats">
          {['JPEG', 'JPG', 'PNG', 'WEBP'].map((format) => (
            <span key={format} className="chip">{format}</span>
          ))}
        </div>

        <TryOn />
      </main>
    </>
  );
}
