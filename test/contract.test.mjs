import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSnapshot } from '../src/contract.ts'
import { illustration } from '../src/illustration.ts'

test('reference and truthful remote API snapshots are supported', () => {
  const data = illustration()
  assert.ok(parseSnapshot(data))
  Object.assign(data.session, { level: null, kda: null, cs: null, gold: null, items: null })
  data.player.rank.change = null
  assert.ok(parseSnapshot(data))
})
test('unranked, unavailable and uncapped apex LP are distinct', () => {
  const data = illustration()
  data.player.rank = null
  assert.ok(parseSnapshot(data))
  data.player.rank = { tier: 'UNRANKED', division: null, lp: null, change: null, queueId: 420, wins: 0, losses: 0 }
  assert.ok(parseSnapshot(data))
  data.player.rank = { tier: 'MASTER', division: null, lp: 438, change: null, queueId: 420, wins: 1, losses: 1 }
  assert.ok(parseSnapshot(data))
  data.player.rank.division = 'I'
  assert.equal(parseSnapshot(data), null)
})
test('withdrawal cannot retain history or personal snapshot data', () => {
  const data = illustration()
  data.playerOptedIn = false
  assert.equal(parseSnapshot(data), null)
  data.state = 'unlinked'; data.player = null; data.session = null
  assert.equal(parseSnapshot(data), null)
  data.history = []
  assert.ok(parseSnapshot(data))
})
test('rejects custom history, duplicate matches, invalid KDA and fake active presence', () => {
  const data = illustration()
  data.history[0].queueId = 0
  assert.equal(parseSnapshot(data), null)
  const duplicate = illustration()
  duplicate.history[1].id = duplicate.history[0].id
  assert.equal(parseSnapshot(duplicate), null)
  const impossible = illustration()
  impossible.session.kda.kills = -1
  assert.equal(parseSnapshot(impossible), null)
  const presence = illustration()
  presence.player.presence = 'playing'; presence.session = null
  assert.equal(parseSnapshot(presence), null)
})
