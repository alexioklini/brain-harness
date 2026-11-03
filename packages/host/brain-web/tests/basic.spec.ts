import { expect, it } from 'vitest'
import { basicCredentials } from '../src/basic.ts'

it('accepts an existing account and keeps colons in its password', () => {
  expect(basicCredentials('Basic ' + Buffer.from('test-a:pass:word').toString('base64')))
    .toEqual({ username: 'test-a', password: 'pass:word' })
  expect(basicCredentials('Bearer worker-token')).toBeUndefined()
})

it('rejects empty identities, missing passwords and malformed header data', () => {
  for (const value of [':password', 'username:', 'username', 'user:pass\nword']) {
    expect(() => basicCredentials('Basic ' + Buffer.from(value).toString('base64'))).toThrow('(401)')
  }
  expect(() => basicCredentials('Basic %invalid')).toThrow('(401)')
})
