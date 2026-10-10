'use strict';
const { evaluateArguments } = require('./builtin-arguments');
function emitRectangle(node, context, { fail, numeric, expression }, state) {
  if (node.name !== 'rect_overlap') return null;
  if (node.args.length !== 8 || node.args.some(arg => arg.type === 'keyword')) fail(node, 'rect_overlap expects (ax, ay, aw, ah, bx, by, bw, bh), eight integer arguments');
  state.enabled = true;
  // Complete evaluation before storing scratch: nested queries remain safe.
  for (const arg of node.args) {
    numeric(arg, context);
  }
  const code = evaluateArguments(node, node.args, context, expression);
  for (let i = 7; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wRectArgs + ${i * 2}], a`, '    ld a, h', `    ld [wRectArgs + ${i * 2 + 1}], a`);
  return [...code, '    call RectOverlap'];
}
module.exports = { emitRectangle };
