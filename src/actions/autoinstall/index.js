let { writeFileSync } = require('fs')
let { join } = require('path')
let { sync: glob } = require('glob')
let rm = require('rimraf').sync
let { ignoreDeps } = require('../../lib')
let getDeps = require('./get-root-deps')
let getRequires = require('./get-requires')

module.exports = function autoinstaller (params) {
  let { dirs, inventory, update, verbose } = params
  if (!dirs.length) return []

  let installing = [] // Generated manifests to be hydrated later (if there are no parsing failures)
  let failures = []   // Userland files that could not be parsed

  // Get package[-lock] dependencies
  let allDeps = getDeps(inventory)

  update.start('Finding dependencies')
  // Stats
  let start = Date.now()
  let projectDirs = 0
  let projectFiles = 0
  let totalDeps = 0

  dirs.forEach(dir => {
    projectDirs++
    let lambda = inventory.inv.lambdasBySrcDir[dir]
    if (Array.isArray(lambda)) lambda = lambda[0] // Handle multitenant Lambdae

    // Autoinstall is currently Node.js only - exit early if it's another runtime
    if (!lambda.config.runtime.startsWith('nodejs')) return
    try {
      // Clean everything out bebefore we get going jic
      rm(join(dir, 'node_modules'))

      // Collection of all dependencies from all files in this directory
      let dirDeps = []

      // Gather ye business logic while ye may
      let files = glob('**/*.js', { cwd: dir }).filter(ignoreDeps)
      files.forEach(f => {
        projectFiles++
        try {
          let deps = getRequires({ dir, file: join(dir, f), update })
          if (deps) dirDeps = dirDeps.concat(deps)
        }
        catch (error) {
          failures.push({ file: join(dir, f), error })
        }
      })

      // Tidy up the dependencies
      dirDeps = [ ...new Set(dirDeps.sort()) ] // Dedupe
      dirDeps = dirDeps.filter(d => d !== 'aws-sdk') // Already present at runtime

      // Exit now if there are no deps to write
      if (!dirDeps.length) return
      totalDeps += dirDeps.length

      // Build the manifest
      let dependencies = {}
      dirDeps.forEach(dep => dependencies[dep] = allDeps[dep] || 'latest')
      let lambdaPackage = {
        _arc: 'autoinstall',
        _module: 'hydrate',
        _date: new Date().toISOString(),
        _parsed: files,
        description: `This file was generated by Architect, and placed in node_modules to aid in debugging; if you found file in your function directory, you can safely remove it (and package-lock.json)`,
        dependencies,
      }
      installing.push({
        dir,
        file: 'package.json',
        remove: [ 'package.json', 'package-lock.json' ], // Identify files for later removal
        data: JSON.stringify(lambdaPackage, null, 2)
      })
    }
    catch (err) {
      update.error(`Error autoinstalling dependencies in ${dir}`)
      throw err
    }
  })

  // Halt hydration (and deployment) if there are dependency determination issues
  if (failures.length) {
    update.error('JS parsing error(s), could not automatically determine dependencies')
    failures.forEach(({ file, error }) => {
      console.log('File:', file)
      console.log(error)
    })
    process.exit(1)
  }

  // Write everything at the end in case there were any parsing errors
  installing.forEach(({ dir, file, data }) => {
    let manifest = join(dir, file)
    writeFileSync(manifest, data)
  })

  if (verbose) {
    let stats = [
      `Scanned ${projectDirs} project dirs`,
      `Inspected ${projectFiles} project files`,
      `Found a total of ${totalDeps} dependencies to install`
    ]
    update.status('Dependency analysis', ...stats)
    update.done(`Completed in ${Date.now() - start}ms`)
  }
  else update.cancel()

  return installing
}
