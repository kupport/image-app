'use client';

import { useEffect, useState } from 'react';
import { ACCEPT, validateImageFile } from '@/lib/images';
import { HeartIcon, SortIcon } from './Icons';

// Same-origin API route; it holds the webhook URL server-side and proxies to n8n
const GENERATE_ENDPOINT = '/api/generate';
const TIMEOUT_MS = 130000;

async function generateImage(file1: File, file2: File): Promise<string> {
  const formData = new FormData();
  formData.append('image1', file1);
  formData.append('image2', file2);

  try {
    // Content-Type is left unset so the browser adds the multipart boundary
    const response = await fetch(GENERATE_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 401) {
      // Session expired: send the user back to log in
      window.location.assign('/login');
      throw new Error('Please log in again.');
    }
    if (response.status === 402) {
      // Subscription ended: send the user to the paywall to renew
      window.location.assign('/pay');
      throw new Error('An active subscription is required.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (status ${response.status}).`);
    }

    const imageBlob = await response.blob();
    if (!imageBlob.type.startsWith('image/')) {
      throw new Error('The server did not return an image.');
    }
    return URL.createObjectURL(imageBlob);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('The request timed out. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Network error. Please check your connection and try again.');
    }
    throw error;
  }
}

/** Holds a file plus an object URL for previewing it, revoking stale URLs. */
function useImageFile() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return { file, setFile, previewUrl };
}

type UploadCardProps = {
  title: string;
  emptyLabel: string;
  file: File | null;
  previewUrl: string | null;
  disabled: boolean;
  onSelect: (file: File) => void;
};

function UploadCard({ title, emptyLabel, file, previewUrl, disabled, onSelect }: UploadCardProps) {
  return (
    <div className="card-wrap">
      <label className="card">
        <input
          type="file"
          accept={ACCEPT}
          disabled={disabled}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) onSelect(selected);
            e.target.value = '';
          }}
        />
        <span className="card-heart"><HeartIcon /></span>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URLs can't go through next/image
          <img className="card-img" src={previewUrl} alt={`${title} preview`} />
        ) : (
          <span className="card-empty">
            <span className="plus">+</span>
            <span>{emptyLabel}</span>
          </span>
        )}
      </label>
      <p className="card-title">{title}</p>
      <p className="card-sub">{file ? file.name : 'No file selected'}</p>
    </div>
  );
}

export default function TryOn() {
  const image1 = useImageFile();
  const image2 = useImageFile();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputImageUrl, setOutputImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!outputImageUrl) return;
    return () => URL.revokeObjectURL(outputImageUrl);
  }, [outputImageUrl]);

  const selectFile = (setFile: (file: File) => void) => (file: File) => {
    const problem = validateImageFile(file);
    if (problem) {
      setError(`"${file.name}": ${problem}`);
      return;
    }
    setError(null);
    setFile(file);
  };

  const count = (image1.file ? 1 : 0) + (image2.file ? 1 : 0);
  const canSubmit = count === 2 && !isLoading;

  async function handleSubmit() {
    if (!image1.file || !image2.file || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      setOutputImageUrl(await generateImage(image1.file, image2.file));
    } catch (err) {
      console.error('Generation failed:', err);
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  let status: React.ReactNode;
  if (isLoading) status = <><span className="spinner" />Loading…</>;
  else if (outputImageUrl) status = 'Done';
  else status = count < 2 ? 'Add images' : 'Ready';

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-controls">
          <button type="button" className="btn-generate" disabled={!canSubmit} onClick={handleSubmit}>
            <span>{isLoading ? 'Loading…' : 'Generate'}</span>
            {isLoading ? <span className="spinner spinner-light" /> : <SortIcon />}
          </button>
          <div className="status" aria-live="polite">{status}</div>
        </div>
        <span className="count">{count}/2 images</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="grid">
        <UploadCard
          title="Image 1 — Person"
          emptyLabel="Upload person"
          file={image1.file}
          previewUrl={image1.previewUrl}
          disabled={isLoading}
          onSelect={selectFile(image1.setFile)}
        />
        <UploadCard
          title="Image 2 — Clothing"
          emptyLabel="Upload clothing"
          file={image2.file}
          previewUrl={image2.previewUrl}
          disabled={isLoading}
          onSelect={selectFile(image2.setFile)}
        />

        <div className="card-wrap">
          <div className="card card-result">
            <span className="card-heart"><HeartIcon /></span>
            {outputImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URLs can't go through next/image
              <img className="card-img" src={outputImageUrl} alt="Generated result" />
            ) : (
              !isLoading && <span className="card-empty">Your generated image will appear here</span>
            )}
            {isLoading && (
              <span className="card-loading">
                <span className="spinner" />
                <span>Loading…</span>
              </span>
            )}
          </div>
          <p className="card-title">Result</p>
          <p className="card-sub">
            {outputImageUrl ? (
              <a href={outputImageUrl} download="try-on-result">Download</a>
            ) : isLoading ? (
              'Generating — this can take 10–30 seconds'
            ) : (
              'Not generated yet'
            )}
          </p>
        </div>
      </section>
    </>
  );
}
