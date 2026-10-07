import { loadConfig, CONSENT_VERSION } from './config.mjs'
import { loadRiotConfig, createRiot } from './riot.mjs'
import { createStore } from './store.mjs'
import { createApp } from './app.mjs'

const riot = loadRiotConfig(process.env)
const config = loadConfig(process.env, riot.approved)
const app = createApp(config, createStore(config.databasePath, CONSENT_VERSION), createRiot({ ...config, ...riot }))
app.server.listen(config.port, config.host, () => {
  console.info(`League of Legends profile service listening on ${config.host}:${config.port}; connection ${config.approved ? 'enabled' : 'awaiting approval'}`)
})
app.server.on('error', () => { console.error('Service could not start. Check the configured port and data directory.'); process.exitCode = 1 })
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await app.close()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
