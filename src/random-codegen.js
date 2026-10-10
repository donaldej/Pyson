'use strict';
const { evaluateArguments } = require('./builtin-arguments');
const procedures = ['random_seed'];
const names = [...procedures, 'randrange', 'randint'];
function emitRandom(node, context, { fail, expression, numeric, literalNumber }, graphics) {
  if (!names.includes(node.name)) return null;
  const count = node.args.length;
  if (node.args.some(arg => arg.type === 'keyword') || (node.name === 'random_seed' ? count !== 1 : node.name === 'randint' ? count !== 2 : count < 1 || count > 2)) fail(node, `${node.name} expects ${node.name === 'random_seed' ? 'one' : node.name === 'randint' ? 'two' : 'one or two'} integer arguments`);
  graphics.random = true;
  const args = node.name === 'randrange' && count === 1 ? [{ type: 'number', value: 0, line: node.line }, node.args[0]] : node.args;
  for (const arg of args) numeric(arg, context);
  if (node.name !== 'random_seed') {
    const low = literalNumber(args[0]), high = literalNumber(args[1]);
    if (low !== null && high !== null && (node.name === 'randint' ? low > high : low >= high)) fail(node, 'Random range must not be empty');
  }
  const code = evaluateArguments(node, args, context, expression);
  for (let i = args.length - 1; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
  return [...code, `    call ${node.name === 'random_seed' ? 'RandomSeed' : node.name === 'randint' ? 'RandomInt' : 'RandomRange'}`, ...(node.name === 'random_seed' ? ['    ld hl, 0'] : [])];
}
module.exports = { names, procedures, emitRandom };
