import type { Metadata } from 'next';
import { SITE } from '@/lib/share';
import { AskPlayer } from './AskPlayer';

// Public landing page for a shared "Ask the hosts" episode: https://audexa.app/ask/<id>. No sign-in.
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-radio-backend.fly.dev/api';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Title and description of a finished episode, or null (still being made, missing, or the server is slow). Never throws. */
async function finished(id: string): Promise<{ title: string; description: string } | null> {
  if (!UUID_RE.test(id)) return null;
  try {
    const res = await fetch(`${API_URL}/ask/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const d = (await res.json())?.data;
    return d?.status === 'completed' && typeof d.title === 'string' ? { title: d.title, description: String(d.description ?? '') } : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const ep = await finished(id);
  const title = ep ? `${ep.title} | Audexa` : 'Ask the hosts | Audexa';
  const description = ep
    ? `${ep.description} An AI-generated discussion based on recent headlines.`
    : 'Two AI hosts discuss a news story, based on recent headlines.';
  return {
    metadataBase: new URL(SITE),
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: 'Audexa', title, description, images: ['/favicon.png'] },
    twitter: { card: 'summary', title, description, images: ['/favicon.png'] },
  };
}

export default async function AskEpisodePage({ params }: { params: Params }) {
  const { id } = await params;
  return <AskPlayer id={id} />;
}
