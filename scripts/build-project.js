'use strict';

// Generic helper for building a Pyson project from a project directory or direct file path.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
// npm runs package scripts from the repo root, so INIT_CWD preserves the user's original launch directory.
const launchedFrom = process.env.INIT_CWD || process.cwd();

function findNearestProject(startDir) {
  // If the user is inside a project folder, prefer that project's main.pysn instead of scanning the whole repo.
  let current = path.resolve(startDir);
  const stopAt = path.parse(current).root;

  while (true) {
    const candidate = path.join(current, 'main.pysn');
    if (fs.existsSync(candidate)) {
      return { input: candidate, name: path.basename(current) };
    }

    const parent = path.dirname(current);
    if (parent === current || current === stopAt) break;
    current = parent;
  }

  return null;
}

function collectProjectFiles(startDir, maxDepth = 4) {
  // Fall back to a shallow project scan when no explicit path is provided.
  const results = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build' || entry.name === 'binary') continue;
        walk(full, depth + 1);
        continue;
      }

      if (entry.isFile() && /\.pysn$/i.test(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(startDir, 0);

  return results;
}

function resolveProjectInput(input) {
  const candidates = [];

  // This is the key behavior that makes the shortcut work from any project directory.
  const fromLaunch = findNearestProject(launchedFrom);
  if (fromLaunch) {
    return fromLaunch;
  }

  if (input) {
    candidates.push(path.resolve(launchedFrom, input));
    candidates.push(path.resolve(process.cwd(), input));
    candidates.push(path.resolve(root, input));
    candidates.push(path.resolve(input));
  }

  const cwdMain = path.resolve(process.cwd(), 'main.pysn');
  const rootMain = path.resolve(root, 'main.pysn');
  candidates.push(cwdMain, rootMain);

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        const mainFile = path.join(candidate, 'main.pysn');
        if (fs.existsSync(mainFile)) return { input: mainFile, name: path.basename(candidate) };

        const projectFiles = fs.readdirSync(candidate).filter(name => /\.pysn$/i.test(name));
        if (projectFiles.length === 1) {
          return { input: path.join(candidate, projectFiles[0]), name: path.basename(candidate) };
        }
      }

      if (stat.isFile()) {
        const basename = path.basename(candidate);
        const name = basename.toLowerCase() === 'main.pysn'
          ? path.basename(path.dirname(candidate))
          : path.basename(candidate, path.extname(candidate));
        return { input: candidate, name };
      }
    }
  }

  // If we still could not determine the target, see if there is exactly one project file to build.
  const projectFiles = collectProjectFiles(launchedFrom);
  if (projectFiles.length === 1) {
    const file = projectFiles[0];
    return {
      input: file,
      name: path.basename(path.dirname(file))
    };
  }

  if (projectFiles.length > 1) {
    const examples = projectFiles.map(file => path.relative(root, file)).join(', ');
    throw new Error(`Multiple project files found. Pass a specific path: npm run build:project -- [project-path-or-file] [output-name]. Found: ${examples}`);
  }

  throw new Error('Usage: npm run build:project -- [project-path-or-file] [output-name]');
}

function validateName(name) {
  // The CLI accepts only a simple output name, matching the repo's build conventions.
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid output name: ${name}. Use letters, numbers, underscore, or hyphen.`);
  }
}

const { input, name: defaultName } = resolveProjectInput(args[0]);
const name = args[1] || defaultName;
validateName(name);

// Delegate the actual compilation to the existing CLI so all build behavior stays centralized.
const result = spawnSync(process.execPath, [path.join(root, 'src', 'cli.js'), input, name], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
