import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { AdminIntegrationError } from '../../errors'
import type {
  TransportFilePayload,
  TransportPollResult,
  TransportSubmissionResult,
} from '../afi-types'

interface PendingSubmission {
  transactionId: string
  inputFileName: string
  submittedAt: number
  externalRef: string
}

/**
 * Envío real vía SILTRA (modo desatendido en Windows).
 * Escribe el fichero AFI en la carpeta de entrada, opcionalmente ejecuta siltra.exe
 * y recoge el acuse desde la carpeta de salida.
 */
export class SiltraTransportAdapter {
  private pendingDir: string

  constructor(
    private inputDir: string,
    private outputDir: string,
    private executablePath: string,
  ) {
    this.pendingDir = path.join(inputDir, '.vacly-pending')
  }

  private pendingPath(transactionId: string) {
    return path.join(this.pendingDir, `${transactionId}.json`)
  }

  private async ensureDirs() {
    await fs.mkdir(this.inputDir, { recursive: true })
    await fs.mkdir(this.outputDir, { recursive: true })
    await fs.mkdir(this.pendingDir, { recursive: true })
  }

  async submitFile(
    transactionId: string,
    file: TransportFilePayload,
  ): Promise<TransportSubmissionResult> {
    await this.ensureDirs()

    const safeName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const inputFileName = `${transactionId.slice(0, 8)}_${safeName}`
    const inputPath = path.join(this.inputDir, inputFileName)

    await fs.writeFile(inputPath, file.content)

    const externalRef = `SILTRA-${transactionId.slice(0, 8).toUpperCase()}`
    const pending: PendingSubmission = {
      transactionId,
      inputFileName,
      submittedAt: Date.now(),
      externalRef,
    }
    await fs.writeFile(this.pendingPath(transactionId), JSON.stringify(pending), 'utf8')

    if (this.executablePath.trim()) {
      await this.runSiltra(inputPath)
    }

    return { externalRef, status: 'submitted' }
  }

  private runSiltra(inputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executablePath, [inputPath], {
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('error', (err) => {
        reject(new AdminIntegrationError('TRANSPORT_ERROR', 'No se pudo ejecutar SILTRA', err))
      })
      child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(
            new AdminIntegrationError(
              'TRANSPORT_ERROR',
              `SILTRA terminó con código ${code}`,
            ),
          )
          return
        }
        resolve()
      })
    })
  }

  private async readPending(transactionId: string): Promise<PendingSubmission | null> {
    try {
      const raw = await fs.readFile(this.pendingPath(transactionId), 'utf8')
      return JSON.parse(raw) as PendingSubmission
    } catch {
      return null
    }
  }

  private async findResponseFiles(baseName: string, after: number): Promise<string[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.outputDir)
    } catch {
      return []
    }

    const matches: Array<{ path: string; mtime: number }> = []
    for (const name of entries) {
      const full = path.join(this.outputDir, name)
      const stat = await fs.stat(full).catch(() => null)
      if (!stat?.isFile()) continue
      if (stat.mtimeMs < after - 5000) continue

      const lower = name.toLowerCase()
      const matchesName =
        name.includes(baseName) ||
        lower.includes('resp') ||
        lower.includes('acuse') ||
        lower.includes('salida') ||
        lower.endsWith('.out') ||
        lower.endsWith('.res')

      if (matchesName) {
        matches.push({ path: full, mtime: stat.mtimeMs })
      }
    }

    return matches.sort((a, b) => b.mtime - a.mtime).map((m) => m.path)
  }

  async pollResponse(transactionId: string): Promise<TransportPollResult> {
    const pending = await this.readPending(transactionId)
    if (!pending) {
      return { status: 'error' }
    }

    const baseName = path.parse(pending.inputFileName).name
    const candidates = await this.findResponseFiles(baseName, pending.submittedAt)

    if (candidates.length === 0) {
      return { status: 'pending' }
    }

    const content = await fs.readFile(candidates[0])
    return {
      status: 'completed',
      responseContent: content.toString('utf8'),
    }
  }

  async getSubmissionStatus(transactionId: string): Promise<TransportSubmissionResult> {
    const pending = await this.readPending(transactionId)
    if (!pending) {
      return { externalRef: '', status: 'pending' }
    }

    const poll = await this.pollResponse(transactionId)
    if (poll.status === 'completed') {
      return { externalRef: pending.externalRef, status: 'completed' }
    }

    return { externalRef: pending.externalRef, status: 'submitted' }
  }

  async downloadReceipt(transactionId: string): Promise<string> {
    const poll = await this.pollResponse(transactionId)
    if (poll.status !== 'completed' || !poll.responseContent) {
      throw new AdminIntegrationError('TRANSPORT_ERROR', 'Acuse SILTRA no disponible todavía')
    }
    return poll.responseContent
  }
}
