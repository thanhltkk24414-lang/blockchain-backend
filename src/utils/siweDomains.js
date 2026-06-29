const DEFAULT_SIWE_DOMAINS = ['localhost'];

function parseAllowedSiweDomains(raw) {
  if (!raw?.trim()) return [...DEFAULT_SIWE_DOMAINS];
  return raw.split(',').map((domain) => domain.trim()).filter(Boolean);
}

function getAllowedSiweDomains() {
  return parseAllowedSiweDomains(process.env.SIWE_DOMAIN);
}

function hostnameMatchesSuffix(hostname, suffix) {
  const normalized = suffix.startsWith('.') ? suffix.slice(1) : suffix;
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

function matchSiweDomainPattern(domain, pattern) {
  const trimmedDomain = domain.trim().toLowerCase();
  const trimmedPattern = pattern.trim().toLowerCase();
  if (trimmedDomain === trimmedPattern) return true;

  // localhost:3000 is valid when allowlist entry is localhost (no port)
  if (!trimmedPattern.includes(':') && !trimmedPattern.includes('*')) {
    const domainHost = trimmedDomain.split(':')[0];
    if (domainHost === trimmedPattern) return true;
  }

  if (!trimmedPattern.includes('*')) return false;

  if (trimmedPattern.startsWith('*.')) {
    return hostnameMatchesSuffix(trimmedDomain, trimmedPattern.slice(1));
  }

  return false;
}

function isAllowedSiweDomain(domain, patterns = getAllowedSiweDomains()) {
  if (!domain?.trim()) return false;
  return patterns.some((pattern) => matchSiweDomainPattern(domain, pattern));
}

/** Host from URL for SIWE URI checks (includes port when non-default). */
function hostFromUrl(urlString) {
  const url = new URL(urlString);
  const defaultPort = url.protocol === 'https:' ? '443' : '80';
  if (!url.port || url.port === defaultPort) return url.hostname;
  return url.host;
}

function isAllowedSiweUri(uri, patterns = getAllowedSiweDomains()) {
  if (!uri?.trim()) return false;
  try {
    return isAllowedSiweDomain(hostFromUrl(uri), patterns);
  } catch {
    return false;
  }
}

/** First non-wildcard domain — used as hint in nonce response (clients should use window.location.host). */
function getPrimarySiweDomain() {
  const domains = getAllowedSiweDomains();
  return domains.find((d) => !d.includes('*')) || domains[0] || DEFAULT_SIWE_DOMAINS[0];
}

module.exports = {
  DEFAULT_SIWE_DOMAINS,
  parseAllowedSiweDomains,
  getAllowedSiweDomains,
  matchSiweDomainPattern,
  isAllowedSiweDomain,
  isAllowedSiweUri,
  hostFromUrl,
  getPrimarySiweDomain,
};
