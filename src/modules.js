'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('./parser');

const fail = (node, message) => { throw new Error(`${node.filename}: Line ${node.line}: ${message}`); };
function annotate(value, filename) {
  if (!value || typeof value !== 'object') return;
  if (value.type) Object.defineProperty(value, 'filename', { value: filename, enumerable: false });
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => annotate(item, filename));
    else if (child && typeof child === 'object') annotate(child, filename);
  }
}
function walk(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    if (node.type === 'if') {
      node.branches.forEach(branch => walk(branch.body, visit));
      walk(node.otherwise, visit);
    } else if (node.body && node.type !== 'function') walk(node.body, visit);
  }
}

// Resolve modules before code generation. Internal names preserve namespaces;
// runtime modules all share the same ROM and WRAM allocation.
function loadModules(source, filename, sources = new Map()) {
  const root = filename === '<source>' ? process.cwd() : path.dirname(path.resolve(filename));
  const modules = new Map();
  const ordered = [];
  function load(name, text, file, origin) {
    if (modules.has(name)) {
      const existing = modules.get(name);
      if (existing.loading) fail(origin, `Circular import involving "${name}"`);
      return existing;
    }
    sources.set(file, text);
    let ast;
    try { ast = parse(text); } catch (error) { throw new Error(`${file}: ${error.message}`); }
    annotate(ast, file);
    const module = { name, file, ast, loading: true, exports: new Map(), bindings: new Map() };
    modules.set(name, module);
    const internal = local => name === '$main' ? local : `${name}.${local}`;
    walk(ast, node => {
      if (node.type === 'assign' || node.type === 'for' || node.type === 'function') {
        if (node.name.includes('.')) return;
        const previous = module.exports.get(node.name);
        const kind = node.type === 'function' ? 'function' : 'variable';
        if (previous && (previous.kind !== kind || kind === 'function')) fail(node, `Duplicate name "${node.name}"`);
        module.exports.set(node.name, { name: internal(node.name), kind });
      }
    });
    for (const node of ast) {
      if (name !== '$main' && !['function', 'assign', 'import', 'from', 'pass'].includes(node.type)) {
        fail(node, 'Imported modules may contain functions, imports, and initialization assignments; headers and screen loops belong in the main file or functions');
      }
      if (!['import', 'from'].includes(node.type)) continue;
      const moduleFile = path.join(root, ...node.module.split('.')) + '.pysn';
      let child;
      if (modules.has(node.module)) child = load(node.module, null, moduleFile, node);
      else {
        let content;
        try { content = fs.readFileSync(moduleFile, 'utf8'); }
        catch (error) { fail(node, `Cannot import "${node.module}" (${moduleFile}): ${error.message}`); }
        child = load(node.module, content, moduleFile, node);
      }
      const bind = (local, binding) => {
        const previous = module.bindings.get(local);
        if (module.exports.has(local) || (previous && (previous.module !== binding.module || previous.name !== binding.name))) fail(node, `Import name "${local}" conflicts with another binding`);
        module.bindings.set(local, binding);
      };
      if (node.type === 'import') bind(node.alias || node.module, { module: child });
      else for (const item of node.items) {
        const exported = child.exports.get(item.name);
        if (!exported) fail(node, `Module "${node.module}" has no export "${item.name}"`);
        if (exported.kind !== 'function') fail(node, 'from imports currently support functions; use import module and module.variable for shared state or assets');
        bind(item.alias || item.name, { module: child, name: exported.name });
      }
    }
    module.loading = false;
    ordered.push(module);
    return module;
  }
  const main = load('$main', source, filename, { filename, line: 1 });
  function transform(module, nodes, scope = null) {
    const locals = new Set(scope?.params || []);
    const globals = new Set();
    const used = new Set();
    if (scope) {
      const analyze = body => { for (const node of body) {
        if (node.type === 'function') fail(node, 'Nested function definitions are not supported');
        if (node.type === 'global') {
          for (const name of node.names) {
            if (locals.has(name) && scope.params.includes(name)) fail(node, `Parameter "${name}" cannot be global`);
            if (used.has(name)) fail(node, `global "${name}" must precede its use or assignment`);
            globals.add(name);
          }
          continue;
        }
        const inspect = value => {
          if (!value || typeof value !== 'object') return;
          if (value.type === 'name' || value.type === 'call') used.add(value.name);
          for (const [key, child] of Object.entries(value)) if (!['body', 'branches', 'otherwise', 'names'].includes(key)) {
            if (Array.isArray(child)) child.forEach(inspect); else if (typeof child === 'object') inspect(child);
          }
        };
        inspect(node);
        if (node.type === 'assign' || node.type === 'for') {
          used.add(node.name);
          if (!node.name.includes('.')) locals.add(node.name);
        }
        if (node.type === 'if') {
          for (const branch of node.branches) { inspect(branch.condition); analyze(branch.body); }
          analyze(node.otherwise);
        } else if (node.body) analyze(node.body);
      } };
      analyze(nodes);
      for (const name of globals) locals.delete(name);
    }
    const resolve = (name, node, writing = false) => {
      if (locals.has(name)) return name;
      if (name.includes('.') && locals.has(name.split('.')[0])) fail(node, `Cannot access module members through local variable "${name.split('.')[0]}"`);
      const binding = module.bindings.get(name);
      if (binding) {
        if (!binding.name) fail(node, `Module "${name}" requires a member name`);
        if (writing) fail(node, `Cannot assign to imported function "${name}"`);
        return binding.name;
      }
      for (const [alias, imported] of module.bindings) {
        if (!imported.name && name.startsWith(alias + '.')) {
          const member = name.slice(alias.length + 1);
          const exported = imported.module.exports.get(member);
          if (!exported) fail(node, `Module "${imported.module.name}" has no export "${member}"`);
          if (writing && exported.kind !== 'variable') fail(node, `Cannot assign to function "${name}"`);
          return exported.name;
        }
      }
      if (name.includes('.')) fail(node, `Unknown module member "${name}"`);
      const own = module.exports.get(name);
      if (own) return own.name;
      // Main-owned state is available through explicit global declarations.
      if (globals.has(name) && main.exports.get(name)?.kind === 'variable') return name;
      if (globals.has(name)) fail(node, `Global "${name}" must be initialized at module level or in main`);
      return name;
    };
    const fieldTarget = node => {
      const dot = node.name.lastIndexOf('.');
      if (dot < 0) return null;
      const base = node.name.slice(0, dot);
      // Module member names remain qualified; an extra member is a record field.
      if (locals.has(base) || module.exports.get(base)?.kind === 'variable' || globals.has(base)) {
        return { type: 'field', object: { type: 'name', name: base, line: node.line }, field: node.name.slice(dot + 1), line: node.line };
      }
      for (const [alias, imported] of module.bindings) {
        if (!imported.name && base.startsWith(alias + '.') && imported.module.exports.get(base.slice(alias.length + 1))?.kind === 'variable') {
          return { type: 'field', object: { type: 'name', name: base, line: node.line }, field: node.name.slice(dot + 1), line: node.line };
        }
      }
      return null;
    };
    const expression = node => {
      if (node.type === 'name') {
        const field = fieldTarget(node);
        if (field) { annotate(field, node.filename); Object.assign(node, field); delete node.name; expression(node.object); return; }
      }
      if (node.type === 'name' || node.type === 'call') node.name = resolve(node.name, node);
      for (const key of ['left', 'right', 'expression', 'first']) if (node[key]) expression(node[key]);
      if (node.args) node.args.forEach(expression);
      if (node.items) node.items.forEach(expression);
      if (node.array) expression(node.array);
      if (node.index) expression(node.index);
      if (node.object) expression(node.object);
      if (node.rest) node.rest.forEach(item => expression(item.expression));
    };
    const rewrite = body => body.filter(node => !['import', 'from'].includes(node.type)).map(node => {
      if (node.type === 'global') { node.names = node.names.map(name => resolve(name, node, true)); return node; }
      if (node.type === 'function') {
        if (scope) fail(node, 'Nested function definitions are not supported');
        const localName = node.name;
        if (node.defaults) node.defaults.forEach(value => { if (value) expression(value); });
        node.body = transform(module, node.body, node);
        node.name = module.exports.get(localName).name;
        return node;
      }
      if (node.type === 'assign') {
        const target = fieldTarget(node);
        if (target) {
          annotate(target, node.filename);
          const augmented = Boolean(node.op);
          node.type = 'field_assign'; node.target = target; node.op = augmented ? node.expression.op : null;
          if (augmented) node.expression = node.expression.right;
          delete node.name;
        }
      }
      if (node.type === 'assign' || node.type === 'for') node.name = resolve(node.name, node, true);
      if (node.expression) expression(node.expression);
      if (node.target) expression(node.target);
      if (node.iterable) expression(node.iterable);
      if (node.condition) expression(node.condition);
      if (node.args) node.args.forEach(expression);
      if (node.type === 'if') {
        node.branches.forEach(branch => { expression(branch.condition); branch.body = rewrite(branch.body); });
        node.otherwise = rewrite(node.otherwise);
      } else if (node.body) node.body = rewrite(node.body);
      return node;
    });
    // Nested imports cannot be discarded silently.
    walk(nodes, node => {
      if (['import', 'from'].includes(node.type) && !module.ast.includes(node)) fail(node, 'Imports must be at the top level');
    });
    return rewrite(nodes);
  }
  const rootHeaders = main.ast.filter(node => node.type === 'header');
  // Check main header ordering before dependency initializers are prepended.
  let executable = false;
  for (const node of main.ast) {
    if (node.type === 'header' && executable) fail(node, 'Header configuration must appear before executable statements');
    if (!['header', 'function', 'import', 'from'].includes(node.type)) executable = true;
  }
  const combined = ordered.flatMap(module => transform(module, module.ast).filter(node => node.type !== 'header'));
  return { ast: [...rootHeaders, ...combined], modules: ordered.map(module => module.file) };
}

module.exports = { loadModules };
