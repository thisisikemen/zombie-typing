export const DEFAULT_SITE_URL = 'https://thisisikemen.github.io/zombie-typing/';

export function siteUrl(value = DEFAULT_SITE_URL) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('SITE_URL must be an HTTPS URL without credentials, query or fragment');
  }
  return url.href.replace(/\/*$/, '/');
}

export function measurementId(value = '') {
  if (value && !/^G-[A-Z0-9]+$/.test(value)) throw new Error('Invalid GA4 measurement ID');
  return value;
}

export function publisherId(value = '') {
  if (value && !/^ca-pub-\d{16}$/.test(value)) throw new Error('Invalid AdSense publisher ID');
  return value;
}
