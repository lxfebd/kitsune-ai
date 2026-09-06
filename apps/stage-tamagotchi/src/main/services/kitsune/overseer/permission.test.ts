import { describe, expect, it } from 'vitest'

import { PermissionModel } from './permission'

describe('PermissionModel.isHighRisk', () => {
  const model = new PermissionModel()

  it('detects rm -rf /', () => {
    expect(model.isHighRisk({ prompt: 'rm -rf /var/log' })).toBe(true)
    expect(model.isHighRisk({ prompt: 'sudo rm -rf /' })).toBe(true)
  })

  it('detects rm -rf *', () => {
    expect(model.isHighRisk({ prompt: 'rm -rf *' })).toBe(true)
    expect(model.isHighRisk({ prompt: 'rm -rf .' })).toBe(true)
  })

  it('detects git push --force', () => {
    expect(model.isHighRisk({ prompt: 'git push --force origin main' })).toBe(true)
    expect(model.isHighRisk({ prompt: 'git push -f' })).toBe(true)
  })

  it('detects git reset --hard', () => {
    expect(model.isHighRisk({ prompt: 'git reset --hard HEAD~1' })).toBe(true)
  })

  it('detects SQL DROP TABLE', () => {
    expect(model.isHighRisk({ prompt: 'DROP TABLE users' })).toBe(true)
  })

  it('detects DELETE FROM without WHERE', () => {
    expect(model.isHighRisk({ prompt: 'DELETE FROM users' })).toBe(true)
    // 有 WHERE 的不触发
    expect(model.isHighRisk({ prompt: 'DELETE FROM users WHERE id = 1' })).toBe(false)
  })

  it('detects TRUNCATE TABLE', () => {
    expect(model.isHighRisk({ prompt: 'TRUNCATE TABLE logs' })).toBe(true)
  })

  it('detects format drive', () => {
    expect(model.isHighRisk({ prompt: 'format D:' })).toBe(true)
  })

  it('detects mkfs', () => {
    expect(model.isHighRisk({ prompt: 'mkfs.ext4 /dev/sda1' })).toBe(true)
  })

  it('detects shutdown/reboot', () => {
    expect(model.isHighRisk({ prompt: 'shutdown -h now' })).toBe(true)
    expect(model.isHighRisk({ prompt: 'reboot' })).toBe(true)
  })

  it('returns false for safe commands', () => {
    expect(model.isHighRisk({ prompt: 'npm run build' })).toBe(false)
    expect(model.isHighRisk({ prompt: 'git commit -m "fix"' })).toBe(false)
    expect(model.isHighRisk({ command: 'ls -la' })).toBe(false)
  })

  it('scans both prompt and command fields', () => {
    expect(model.isHighRisk({ prompt: '', command: 'rm -rf /' })).toBe(true)
    expect(model.isHighRisk({ prompt: '', command: 'git push --force' })).toBe(true)
  })

  it('scans assertionType field as well', () => {
    // assertionType 本身不含危险模式，但拼接后不会误判
    expect(model.isHighRisk({ prompt: 'npm build', assertionType: 'compile_success' })).toBe(false)
  })
})