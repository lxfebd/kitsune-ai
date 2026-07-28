import type { Lifecycle, ProvidedBy } from 'injeca'
import type * as vscode from 'vscode'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { noop } from 'es-toolkit'
import { injeca, lifecycle } from 'injeca'
import { commands, Range, window, workspace } from 'vscode'

import { Client } from './airi'
import { ContextCollector } from './context-collector'
import type { TaskExecutePayload } from './types'

interface IntervalHandle {
  clearInterval: () => void
  setInterval: (fn: () => void) => NodeJS.Timeout
}

/**
 * Activate the plugin
 */
export async function activate(context: vscode.ExtensionContext) {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  useLogger().log('Kitsune AI (Trae) is activating...')

  const config = workspace.getConfiguration('kitsune-trae')
  const isEnabled = config.get<boolean>('enabled', true)
  const contextLines = config.get<number>('contextLines', 5)
  const sendInterval = config.get<number>('sendInterval', 3000)

  const vscodeContext = injeca.provide('vscode:context', () => context)
  const client = injeca.provide('proj-kitsune:client', () => new Client())
  const contextCollector = injeca.provide('self:context-collector', () => new ContextCollector(contextLines))
  const eventListeners = injeca.provide('self:event-listeners', () => [] as vscode.Disposable[])
  const controlLoopInterval = injeca.provide('self:control-loop:interval:send', () => {
    let intervalTimer: NodeJS.Timeout | null = null

    return {
      clearInterval: () => {
        if (intervalTimer) {
          clearInterval(intervalTimer)
        }
      },
      setInterval: (fn: () => void) => {
        intervalTimer = setInterval(fn, sendInterval)
        return intervalTimer
      },
    } satisfies IntervalHandle
  })

  const extension = injeca.provide('extension', {
    dependsOn: { client, vscodeContext, contextCollector, eventListeners, lifecycle, controlLoopInterval },
    build: ({ dependsOn }) => setup({ ...dependsOn, isEnabled, sendInterval }),
  })

  injeca.invoke({
    dependsOn: { extension },
    callback: noop,
  })

  await injeca.start()
}

async function setup(params: {
  client: Client
  vscodeContext: vscode.ExtensionContext
  contextCollector: ContextCollector
  eventListeners: vscode.Disposable[]
  lifecycle: Lifecycle
  controlLoopInterval: IntervalHandle
  isEnabled: boolean
  sendInterval: number
}) {
  if (params.isEnabled) {
    const connected = await params.client.connect()
    if (connected) {
      window.showInformationMessage('Kitsune AI (Trae) Server Channel connected!')
    }
    else {
      window.showWarningMessage('Kitsune AI (Trae) Server Channel connection failed!')
    }
  }

  params.vscodeContext.subscriptions.push(
    commands.registerCommand('kitsune-trae.enable', async () => {
      params.isEnabled = true
      await params.client.connect()
      await registerListeners({ ...params })
      window.showInformationMessage('Kitsune AI (Trae) enabled!')
    }),

    commands.registerCommand('kitsune-trae.disable', () => {
      params.isEnabled = false
      unregisterListeners({ eventListeners: params.eventListeners, controlLoopInterval: params.controlLoopInterval })
      params.client.disconnect()
      window.showInformationMessage('Kitsune AI (Trae) disabled!')
    }),

    commands.registerCommand('kitsune-trae.status', () => {
      const status = params.isEnabled && params.client ? 'Connected' : 'Disconnected'
      window.showInformationMessage(`Kitsune AI (Trae) Server Channel status: ${status}.`)
    }),
  )

  if (params.isEnabled) {
    await registerListeners({ ...params })
  }

  useLogger().log('Kitsune AI (Trae) activated successfully')
}

async function registerListeners(params: {
  contextCollector: ContextCollector
  lifecycle: Lifecycle
  eventListeners: vscode.Disposable[]
  client: Client
  controlLoopInterval: IntervalHandle
  isEnabled: boolean
  sendInterval: number
}) {
  unregisterListeners({ eventListeners: params.eventListeners, controlLoopInterval: params.controlLoopInterval })

  // Reverse push: execute tasks dispatched from the core client
  const taskUnsubscribe = params.client.onTaskExecute((payload) => {
    const { taskId } = payload
    return executeTask(payload).then(
      () => params.client.sendTaskResult({ taskId, success: true }),
      (err: unknown) => params.client.sendTaskResult({ taskId, success: false, error: errorMessageFrom(err) ?? 'Unknown error' }),
    )
  })
  params.eventListeners.push({ dispose: taskUnsubscribe })

  params.eventListeners.push(
    workspace.onDidSaveTextDocument(async (document) => {
      const editor = window.activeTextEditor
      if (editor && editor.document === document) {
        const ctx = await params.contextCollector.collect(editor)
        if (!ctx)
          return

        params.client.replaceContext(''
          + `User saved the file: ${ctx.file.fileName} (located at ${ctx.file.path}). Here is the context around the cursor after saving:\n`
          + '\n'
          + `${ctx.context.before.join('\n')}\n`
          + `${ctx.currentLine.text}\n`
          + `${ctx.context.after.join('\n')}`,
        )
      }
    }),
  )

  params.eventListeners.push(
    window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) {
        return
      }

      const ctx = await params.contextCollector.collect(editor)
      if (!ctx) {
        return
      }

      params.client.replaceContext(''
        + `User switched to file: ${ctx.file.fileName} (located at ${ctx.file.path}). Here is the context around the cursor after switching:\n`
        + '\n'
        + `${ctx.context.before.join('\n')}\n`
        + `${ctx.currentLine.text}\n`
        + `${ctx.context.after.join('\n')}`,
      )
    }),
  )

  if (params.sendInterval > 0) {
    startMonitoring({ ...params })
  }
}

function unregisterListeners(params: { eventListeners: vscode.Disposable[], controlLoopInterval: IntervalHandle }) {
  params.eventListeners.forEach(listener => listener.dispose())
  params.eventListeners = []
  stopMonitoring({ controlLoopInterval: params.controlLoopInterval })
}

function startMonitoring(params: {
  contextCollector: ContextCollector
  lifecycle: Lifecycle
  client: Client
  controlLoopInterval: IntervalHandle
  isEnabled: boolean
  sendInterval: number
}) {
  stopMonitoring({ controlLoopInterval: params.controlLoopInterval })

  params.controlLoopInterval.setInterval(async () => {
    if (!params.isEnabled)
      return

    const editor = window.activeTextEditor
    if (!editor)
      return

    const ctx = await params.contextCollector.collect(editor)
    if (!ctx)
      return

    params.client.replaceContext(''
      + `User opened file is: ${ctx.file.fileName} (located at ${ctx.file.path}), and current cursor is at line ${ctx.cursor.line + 1}, character ${ctx.cursor.character + 1}.\n`
      + '\n'
      + `Here is the context around the cursor:\n`
      + `\n`
      + `${ctx.context.before.join('\n')}\n`
      + `${ctx.currentLine.text}\n`
      + `${ctx.context.after.join('\n')}`,
    )
  })
}

function stopMonitoring(params: { controlLoopInterval: IntervalHandle }) {
  params.controlLoopInterval.clearInterval()
}

async function executeTask(payload: TaskExecutePayload): Promise<void> {
  switch (payload.type) {
    case 'open_file': {
      const document = await workspace.openTextDocument(payload.path)
      const options: vscode.TextDocumentShowOptions = {}
      if (payload.line !== undefined) {
        const character = payload.column ?? 0
        options.selection = new Range(payload.line, character, payload.line, character)
      }
      await window.showTextDocument(document, options)
      return
    }
    case 'insert_code': {
      const editor = window.activeTextEditor
      if (!editor) {
        throw new Error('No active text editor')
      }
      const position = payload.position === 'end'
        ? editor.document.lineAt(editor.document.lineCount - 1).range.end
        : editor.selection.active
      await editor.edit(builder => builder.insert(position, payload.code))
      return
    }
    case 'run_command': {
      const terminal = window.activeTerminal ?? window.createTerminal()
      terminal.show()
      const fullCommand = payload.args?.length
        ? `${payload.command} ${payload.args.join(' ')}`
        : payload.command
      terminal.sendText(fullCommand)
      return
    }
  }
}

/**
 * Deactivate the plugin
 */
export async function deactivate() {
  const { client } = await injeca.resolve({ client: { key: 'proj-kitsune:client' } as unknown as ProvidedBy<Client> })
  const { eventListeners } = await injeca.resolve({ eventListeners: { key: 'self:event-listeners' } as unknown as ProvidedBy<vscode.Disposable[]> })
  const { controlLoopInterval } = await injeca.resolve({ controlLoopInterval: { key: 'self:control-loop:interval:send' } as unknown as ProvidedBy<IntervalHandle> })

  unregisterListeners({ eventListeners, controlLoopInterval })
  client?.disconnect()
  useLogger().log('Kitsune AI (Trae) deactivated!')
}
