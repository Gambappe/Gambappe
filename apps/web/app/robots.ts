/**
 * `/robots.txt` (Next.js App Router file convention, WS8-T5). Not otherwise spec'd by the design
 * doc; added because Lighthouse's SEO category scores a `robots-txt` audit (malformed/missing
 * directives) and disallowing admin/API surfaces from crawling is standard hygiene alongside the
 * `/q` archive + structured data this task otherwise adds.
 */
import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // §10.5's share/OG surface lives under /api/ (og images, oEmbed discovery) and must stay
      // crawlable for link unfurlers (Twitterbot, etc.) and image indexing — the more specific
      // `allow` wins over the broader `/api/` disallow per the robots.txt spec's
      // longest-matching-rule precedence, regardless of listed order.
      allow: ['/', '/api/og/', '/api/oembed'],
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
