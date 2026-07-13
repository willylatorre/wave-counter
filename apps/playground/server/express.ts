import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { WaveCounter } from '@waves-counter/node'
import { createWaveRouter } from '@waves-counter/node/express'
import express from 'express'

const port = Number(process.env.PORT ?? 18082)
const databasePath = join(tmpdir(), `wave-counter-express-${process.pid}.sqlite3`)
const counter = new WaveCounter({ databasePath })
const app = express()

app.use(express.json())
app.use('/api/waves', createWaveRouter(counter))
app.get('/health', (_request, response) => response.json({ status: 'ok' }))

app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Wave Counter Express playground listening on ${port}\n`)
})

