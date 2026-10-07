import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'

export const randomToken = () => randomBytes(32).toString('base64url')
export const digest = value => createHash('sha256').update(value).digest('hex')
const SESSION_MS = 7 * 86400000
export function createStore(path, consentVersion) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, subject TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
      details TEXT NOT NULL, consent_version TEXT NOT NULL, consented_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS consent_events (
      id INTEGER PRIMARY KEY, profile_id TEXT NOT NULL, event TEXT NOT NULL,
      consent_version TEXT NOT NULL, at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS session_expiration ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS consent_age ON consent_events(at);`)
  const sql = {
    session: db.prepare('SELECT * FROM sessions WHERE hash = ? AND expires_at > ?'),
    insertSession: db.prepare('INSERT INTO sessions(hash, profile_id, csrf, expires_at) VALUES(?, ?, ?, ?)'),
    dropSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    profile: db.prepare('SELECT * FROM profiles WHERE id = ? AND consent_version = ?'),
    ownedProfile: db.prepare('SELECT * FROM profiles WHERE id = ?'),
    subject: db.prepare('SELECT * FROM profiles WHERE subject = ?'),
    upsert: db.prepare(`INSERT INTO profiles VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject) DO UPDATE SET display_name=excluded.display_name,
      details=excluded.details, consent_version=excluded.consent_version, consented_at=excluded.consented_at`),
    event: db.prepare('INSERT INTO consent_events(profile_id, event, consent_version, at) VALUES(?, ?, ?, ?)'),
    remove: db.prepare('DELETE FROM profiles WHERE id = ?'),
  }
  return {
    session(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(token) ? sql.session.get(digest(token), Date.now()) : undefined },
    newSession(profileId = null) {
      if (Number(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count) >= 10000) throw new Error('capacity')
      const token = randomToken(), csrf = randomToken()
      sql.insertSession.run(digest(token), profileId, csrf, Date.now() + SESSION_MS)
      return { token, csrf, profile_id: profileId }
    },
    dropSession(token) { if (token) sql.dropSession.run(digest(token)) },
    profile(id) {
      const row = sql.profile.get(id, consentVersion)
      return row && { ...row, details: JSON.parse(row.details) }
    },
    ownedProfile(id) { return sql.ownedProfile.get(id) },
    profileCount() { return Number(db.prepare('SELECT COUNT(*) AS count FROM profiles').get().count) },
    grant(account, maxProfiles) {
      const previous = sql.subject.get(account.subject)
      if (!previous && this.profileCount() >= maxProfiles) throw new Error('capacity')
      const id = previous?.id || randomBytes(18).toString('base64url')
      db.exec('BEGIN IMMEDIATE')
      try {
        sql.upsert.run(id, account.subject, account.displayName, JSON.stringify(account.details), consentVersion, Date.now())
        sql.event.run(id, 'granted', consentVersion, Date.now())
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      return id
    },
    revoke(id) {
      const profile = this.ownedProfile(id)
      if (!profile) return
      db.exec('BEGIN IMMEDIATE')
      try {
        sql.event.run(id, 'withdrawn', profile.consent_version, Date.now())
        // Delete identity as well as data. Re-linking creates a new public URL.
        sql.remove.run(id)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    sweep() {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
      // Receipts use only random profile IDs, without name, PUUID or IP.
      db.prepare('DELETE FROM consent_events WHERE at < ? AND profile_id NOT IN (SELECT id FROM profiles)').run(Date.now() - 30 * 86400000)
    },
    close() { db.close() },
  }
}
