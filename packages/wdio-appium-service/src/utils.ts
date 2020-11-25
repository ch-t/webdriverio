import { basename, join, resolve } from 'path'
import { paramCase } from 'param-case'

const FILE_EXTENSION_REGEX = /\.[0-9a-z]+$/i

/**
 * Resolves the given path into a absolute path and appends the default filename as fallback when the provided path is a directory.
 * @param  {String} filePath         relative file or directory path
 * @param  {String} defaultFilename default file name when filePath is a directory
 * @return {String}                 absolute file path
 */
export function getFilePath (filePath: string, defaultFilename: string): string {
    let absolutePath = resolve(filePath)

    // test if we already have a file (e.g. selenium.txt, .log, log.txt, etc.)
    // NOTE: path.extname doesn't work to detect a file, cause dotfiles are reported by node to have no extension
    if (!FILE_EXTENSION_REGEX.test(basename(absolutePath))) {
        absolutePath = join(absolutePath, defaultFilename)
    }

    return absolutePath
}

export function cliArgsFromKeyValue (keyValueArgs: KeyValueArgs): string[] {
    const cliArgs = []
    for (const key in keyValueArgs) {
        let value:  ArgValue | ArgValue[] = keyValueArgs[key]
        // If the value is false or null the argument is discarded
        if ((typeof value === 'boolean' && !value) || value === null) {
            continue
        }

        cliArgs.push(`--${paramCase(key)}`)
        cliArgs.push(sanitizeCliOptionValue(value))
    }
    return cliArgs
}

export function cliArgsFromArray (args: ArgValue[]): string[] {
    return args.map(arg => sanitizeCliOptionValue(arg))
}

export function sanitizeCliOptionValue (value: ArgValue) {
    const valueString = String(value)
    // Encapsulate the value string in single quotes if it contains a white space
    return /\s/.test(valueString) ? `'${valueString}'` : valueString
}

export function isWindows(): boolean {
    return process.platform === 'win32'
}
