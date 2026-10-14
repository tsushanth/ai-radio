import type { Metadata } from 'next';
import { RADIO_STATUS_URL } from '@/lib/radio';
import { SITE, liveMeta, parseLang, readUtm, topicFromStatus } from '@/lib/share';
import { LivePlayer } from './LivePlayer';

// Landing page for shared "what's playing" links: https://audexa.app/live?lang=en&utm_source=...
// Plays the live stream in the browser and offers the Android app. Public: no sign-in.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** What the radio says is on air right now, or null (radio slow/unreachable, or it did not report a topic). */
async function currentTopic(lang: string): Promise<string | null> {
  try {
    const res = await fetch(`${RADIO_STATUS_URL}?lang=${lang}`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return topicFromStatus(await res.json());
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = parseLang((await searchParams).lang);
  const { title, description } = liveMeta(await currentTopic(lang));
  return {
    metadataBase: new URL(SITE),
    title,
    description,
    alternates: { canonical: '/live' },
    openGraph: { type: 'website', url: '/live', siteName: 'Audexa', title, description, images: ['/favicon.png'] },
    twitter: { card: 'summary', title, description, images: ['/favicon.png'] },
  };
}

export default async function LivePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const lang = parseLang(params.lang);
  const utm = readUtm(params);
  const topic = await currentTopic(lang);
  return <LivePlayer lang={lang} utm={utm} initialTopic={topic} />;
}
