import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/'],
      },
    ],
    sitemap: 'https://policyengine.org/us/oregon-kicker-refund/sitemap.xml',
    host: 'https://policyengine.org',
  };
}
