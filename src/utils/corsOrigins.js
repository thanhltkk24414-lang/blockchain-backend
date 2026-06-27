const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

function parseAllowedOriginPatterns(raw) {
  if (!raw?.trim()) return [...DEFAULT_ORIGINS];
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function getAllowedOriginPatterns() {
  return parseAllowedOriginPatterns(process.env.ALLOWED_ORIGINS);
}

function hostnameMatchesSuffix(hostname, suffix) {
  const normalized = suffix.startsWith('.') ? suffix.slice(1) : suffix;
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

function matchOriginPattern(origin, pattern) {
  if (origin === pattern) return true;
  if (!pattern.includes('*')) return false;

  try {
    const { protocol, hostname } = new URL(origin);
    const trimmed = pattern.trim();

    if (trimmed.startsWith('*.')) {
      return hostnameMatchesSuffix(hostname, trimmed.slice(1));
    }

    const protoMatch = trimmed.match(/^(https?):\/\/(\*\.(.+))$/i);
    if (protoMatch) {
      const expectedProtocol = `${protoMatch[1].toLowerCase()}:`;
      return protocol === expectedProtocol && hostnameMatchesSuffix(hostname, protoMatch[3]);
    }

    return false;
  } catch {
    return false;
  }
}

function isOriginAllowed(origin, patterns = getAllowedOriginPatterns()) {
  if (!origin) return true;
  return patterns.some((pattern) => matchOriginPattern(origin, pattern));
}

function getAllowedOriginCallback() {
  const patterns = getAllowedOriginPatterns();
  return (origin, callback) => {
    if (!origin || isOriginAllowed(origin, patterns)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

module.exports = {
  DEFAULT_ORIGINS,
  parseAllowedOriginPatterns,
  getAllowedOriginPatterns,
  isOriginAllowed,
  matchOriginPattern,
  getAllowedOriginCallback,
};
