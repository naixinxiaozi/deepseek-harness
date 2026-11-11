import { describe, expect, it } from 'vitest'
import { renderEnterpriseLoginPage } from '../src/login-page.ts'

describe('enterprise login page', () => {
  it('renders an escaped password form with a one-use nonce and strict headers', () => {
    const page = renderEnterpriseLoginPage({
      productName: 'Northstar <Harness>',
      nonce: 'nonce-1',
      locale: 'zh-CN',
      error: 'invalid-credentials',
    })
    expect(page.html).toContain('Northstar &lt;Harness&gt;')
    expect(page.html).toContain('name="nonce" value="nonce-1"')
    expect(page.html).toContain('type="password"')
    expect(page.html).toContain('method="post"')
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(page.headers['cache-control']).toBe('no-store')
  })
})
