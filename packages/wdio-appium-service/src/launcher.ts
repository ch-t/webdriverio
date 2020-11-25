import logger from '@wdio/logger'
import { ChildProcessByStdio, spawn } from 'child_process'
import { createWriteStream, ensureFileSync } from 'fs-extra'
import { promisify } from 'util'
import {
    getFilePath,
    cliArgsFromKeyValue,
    cliArgsFromArray,
    isWindows
} from './utils'
import { Readable } from 'stream'
import { isCloudCapability } from '@wdio/config'

const log = logger('@wdio/appium-service')
const DEFAULT_LOG_FILENAME = 'wdio-appium.log'

const DEFAULT_CONNECTION = {
    protocol: 'http',
    hostname: 'localhost',
    port: 4723,
    path: '/'
}

export default class AppiumLauncher implements WebdriverIO.ServiceInstance {
    private readonly _logPath?: string
    private readonly _basePath: string = '/'
    private readonly _appiumCliArgs: Array<string> = []
    private readonly _capabilities: Array<WebDriver.DesiredCapabilities>
    private readonly _args: AppiumServerArguments | Array<string>
    private _command: string
    private _process?: ChildProcessByStdio<null, Readable, Readable>

    constructor(
        private _options: AppiumServiceConfig,
        capabilities:  Array<WebDriver.DesiredCapabilities> | WebDriver.DesiredCapabilities = {},
        public _config?: Config
    ) {
        /**
         * Convert capability object to Array of capabilities
         */
        this._capabilities = Array.isArray(capabilities)
            ? capabilities
            : Object.values(capabilities)

        this._args = {
            basePath: this._basePath,
            ...(this._options.args || {})
        }
        this._logPath = _options.logPath || _config?.outputDir
        this._command = this._getCommand(_options.command)
    }

    private _getCommand(command?: string) {
        /**
         * Explicitly set node as command and appium
         * module path as it's first argument if it's not defined
         */
        if (!command) {
            command = 'node'
            this._appiumCliArgs.push(AppiumLauncher._getAppiumCommand())
        }

        /**
         * Windows needs to be started through `cmd` and the command needs to be an arg
         */
        if (isWindows()) {
            this._appiumCliArgs.unshift('/c', command)
            command = 'cmd'
        }

        return command
    }

    /**
     * update capability connection options to connect
     * to Appium server
     */
    private _setCapabilities() {
        this._capabilities.forEach(
            (cap) => !isCloudCapability(cap) && Object.assign(
                cap,
                DEFAULT_CONNECTION,
                'port' in this._args ? { port: this._args.port } : {},
                { path: this._basePath },
                { ...cap }
            ))
    }

    async onPrepare() {
        /**
         * Append remaining arguments
         */
        if (Array.isArray(this._args)) {
            this._appiumCliArgs.push(...cliArgsFromArray(this._args))
        } else {
            this._appiumCliArgs.push(...cliArgsFromKeyValue(this._args))
        }

        this._setCapabilities()

        /**
         * start Appium
         */
        this._process = await promisify(this._startAppium)(this._command, this._appiumCliArgs)

        if (this._logPath) {
            this._redirectLogStream(this._logPath)
        }
    }

    onComplete() {
        if (this._process) {
            log.debug(`Appium (pid: ${this._process.pid}) killed`)
            this._process.kill()
        }
    }

    private _startAppium(command: string, args: Array<string>, callback: (err: any, result: any) => void): void {
        log.debug(`Will spawn Appium process: ${command} ${args.join(' ')}`)
        let process: ChildProcessByStdio<null, Readable, Readable> = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let error: Error | undefined

        process.stdout.on('data', (data) => {
            if (data.includes('Appium REST http interface listener started')) {
                log.debug(`Appium started with ID: ${process.pid}`)
                callback(null, process)
            }
        })

        /**
         * only capture first error to print it in case Appium failed to start.
         */
        process.stderr.once('data', err => { error = err })

        process.once('exit', (exitCode) => {
            let errorMessage = `Appium exited before timeout (exit code: ${exitCode})`
            if (exitCode == 2) {
                errorMessage += '\n' + (error || 'Check that you don\'t already have a running Appium service.')
                log.error(errorMessage)
            }
            callback(new Error(errorMessage), null)
        })
    }

    private _redirectLogStream(logPath: string) {
        if (!this._process){
            throw Error('No Appium process to redirect log stream')
        }
        const logFile = getFilePath(logPath, DEFAULT_LOG_FILENAME)

        // ensure file & directory exists
        ensureFileSync(logFile)

        log.debug(`Appium logs written to: ${logFile}`)
        const logStream = createWriteStream(logFile, { flags: 'w' })
        this._process.stdout.pipe(logStream)
        this._process.stderr.pipe(logStream)
    }

    private static _getAppiumCommand (moduleName = 'appium') {
        try {
            return require.resolve(moduleName)
        } catch (err) {
            log.error(
                'Appium is not installed locally.\n' +
                'If you use globally installed appium please add\n' +
                "appium: { command: 'appium' }\n" +
                'to your wdio.conf.js!'
            )
            throw err
        }
    }
}