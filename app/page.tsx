import { connection } from 'next/server';
import SiteHeader from '@/components/SiteHeader';
import TryOn from '@/components/TryOn';

export default async function Home() {
  // Dynamic rendering is required so Next.js can apply the per-request CSP nonce from proxy.ts
  await connection();

  return (
    <>
      <SiteHeader />
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
