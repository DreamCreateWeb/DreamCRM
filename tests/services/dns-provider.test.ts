import { describe, it, expect } from 'vitest'
import { matchProviderByNameservers } from '@/lib/services/dns-provider'

describe('matchProviderByNameservers', () => {
  const cases: Array<[string, string[], string, boolean]> = [
    ['GoDaddy', ['ns01.domaincontrol.com', 'ns02.domaincontrol.com'], 'godaddy', false],
    ['Namecheap', ['dns1.registrar-servers.com'], 'namecheap', true],
    ['Cloudflare', ['kim.ns.cloudflare.com', 'walt.ns.cloudflare.com'], 'cloudflare', true],
    ['DreamHost', ['ns1.dreamhost.com', 'ns2.dreamhost.com'], 'dreamhost', true],
    ['Route 53', ['ns-1.awsdns-00.org', 'ns-2.awsdns-11.co.uk'], 'route53', true],
    ['Wix', ['ns6.wixdns.net'], 'wix', false],
    ['Squarespace', ['ns1.squarespacedns.com'], 'squarespace', false],
    ['IONOS', ['ns1075.ui-dns.com'], 'ionos', true],
    ['Name.com', ['ns1jkl.name.com'], 'namecom', true],
  ]

  it.each(cases)('detects %s', (_label, ns, id, alias) => {
    const p = matchProviderByNameservers(ns)
    expect(p?.id).toBe(id)
    expect(p?.supportsApexAlias).toBe(alias)
  })

  it('tolerates a trailing dot + uppercase', () => {
    expect(matchProviderByNameservers(['NS01.DomainControl.com.'])?.id).toBe('godaddy')
  })

  it('returns null for an unknown host', () => {
    expect(matchProviderByNameservers(['ns1.some-tiny-registrar.example'])).toBeNull()
  })

  it('returns null for no nameservers', () => {
    expect(matchProviderByNameservers([])).toBeNull()
  })
})
