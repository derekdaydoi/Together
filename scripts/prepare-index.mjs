import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(resolve(here, '../index.src.html'), resolve(here, '../index.html'))
