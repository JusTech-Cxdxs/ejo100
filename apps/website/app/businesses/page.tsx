import type { Metadata } from 'next';
import Link from 'next/link';
import { Cover, PageIntro, Section } from '@/components/site/Page';
import { BUSINESSES } from '@/lib/content/group';

export const metadata: Metadata = { title: 'Our businesses', description: 'Six businesses in Nigeria: automotive, agriculture, manufacturing, food, logistics and healthcare.' };

export default function BusinessesPage() {
  return (
    <main>
      <PageIntro kicker="Our businesses" title="Six businesses. One way of working." lede="Each is run by its own team, in its own market, to the same standard: build what the country needs, do it well, and stay." />
      <Section>
        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESSES.map((b, i) => (
            <li key={b.slug} className={i === 0 ? 'sm:col-span-2 lg:col-span-3' : ''}>
              <Link href={`/businesses/${b.slug}`} className="group block">
                <Cover src={b.image} alt="" className={i === 0 ? 'aspect-[21/9]' : 'aspect-[16/10]'}>
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
                  <span className="absolute bottom-5 left-5 right-5 text-white">
                    <span className={`block font-bold leading-tight ${i === 0 ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>{b.name}</span>
                    <span className="mt-1 block text-sm text-white/80">{b.short}</span>
                  </span>
                </Cover>
                <p className={`mt-4 leading-relaxed text-[var(--ejo-text-muted)] ${i === 0 ? 'max-w-3xl text-lg' : 'text-[15px]'}`}>{b.summary}</p>
                <span className="mt-2 inline-block font-semibold text-[var(--ejo-primary)] group-hover:underline">Explore {b.name.toLowerCase()} →</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
