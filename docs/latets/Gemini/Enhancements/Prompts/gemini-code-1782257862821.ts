// tests/unit/cdn-shield-detector.test.ts
import { describe, it, expect } from 'vitest';
import { CdnShieldDetector } from '@/lib/crawler/cdn-shield-detector';

describe('Cloudflare Shield Wall Interception Engine', () => {
  it('should flag an infrastructure block if a security server returns a 403 header configuration', async () => {
    const headers = { 'server': 'cloudflare', 'cf-ray': '89327429837492a' };
    const diagnostic = await CdnShieldDetector.analyzeHeaders(403, headers);
    
    expect(diagnostic.isBlockedByCDN).toBe(true);
    expect(diagnostic.detectedFirewall).toBe('Cloudflare');
    expect(diagnostic.remediationSnippet).toContain('User-Agents');
  });

  it('should pass cleanly if headers do not match blocking parameters', async () => {
    const headers = { 'server': 'nginx' };
    const diagnostic = await CdnShieldDetector.analyzeHeaders(200, headers);
    
    expect(diagnostic.isBlockedByCDN).toBe(false);
    expect(diagnostic.detectedFirewall).toBe('None');
  });
});