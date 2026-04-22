import { describe, it, expect } from 'vitest'
import { dashboardFallbackPort } from './port.js'

describe('dashboardFallbackPort', () => {
  it('is deterministic for the same input', () => {
    const p1 = dashboardFallbackPort('/home/user/project')
    const p2 = dashboardFallbackPort('/home/user/project')
    expect(p1).toBe(p2)
  })

  it('returns different ports for different paths', () => {
    const p1 = dashboardFallbackPort('/home/user/projectA')
    const p2 = dashboardFallbackPort('/home/user/projectB')
    expect(p1).not.toBe(p2)
  })

  it('always falls within [3334, 4332]', () => {
    const paths = [
      '/home/user/project',
      '/var/www/html',
      '/Users/dev/myapp',
      '',
      'a',
      '/'.repeat(200),
    ]
    for (const p of paths) {
      const port = dashboardFallbackPort(p)
      expect(port).toBeGreaterThanOrEqual(3334)
      expect(port).toBeLessThanOrEqual(4332)
    }
  })

  it('returns 3334 for an empty string (hash stays 0)', () => {
    expect(dashboardFallbackPort('')).toBe(3334)
  })
})
