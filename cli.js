#!/usr/bin/env node
let hydrate = require('.')

/**
 * `arc hydrate`
 *
 * Hydrates functions' dependencies, respecting runtime
 *
 * options
 * (default) .............. hydrates all functions, shared, copies files
 * -s|--shared|shared ..... hydrates and copies shared files only
 * -u|--update|update ..... updates each function's dependencies
 * -v|--verbose|verbose ... prints additional output to console
 */
let isShared = opt => opt === 'shared' || opt === '--shared' || opt === '-s'
let isUpdate = opt => opt === 'update' || opt === '--update' || opt === '-u' ||
                      opt === 'upgrade' || opt === '--upgrade' // jic
let isVerbose = opt => opt === 'verbose' || opt === '--verbose' || opt === '-v'
let isAutoinstall = opt => opt === 'autoinstall' || opt === '--autoinstall'

// eslint-disable-next-line
async function cmd (opts = []) {
  let args = {
    verbose: opts.some(isVerbose),
    autoinstall: opts.some(isAutoinstall),
  }

  if (opts.some(isShared)) {
    return hydrate.shared(args)
  }

  if (opts.some(isUpdate)) {
    return hydrate.update(args)
  }

  return hydrate.install(args)
}

module.exports = cmd

// allow direct invoke
if (require.main === module) {
  (async function () {
    try {
      await cmd(process.argv)
    }
    catch (err) {
      console.log(err)
    }
  })()
}
