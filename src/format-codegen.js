'use strict';
const font = require('./font');
function emitFormat(node, context, { fail, numeric, expression, label }, graphics) {
  if (node.name !== 'format_text') return null;
  if (node.args.length < 1 || node.args.length > 5 || node.args[0].type !== 'string') fail(node, 'format_text expects a literal template and up to four integers');
  graphics.format = true;
  const bytes = [], template = node.args[0].value;
  let count = 0;
  for (let i = 0; i < template.length; i++) {
    const char = template[i];
    if (char === '{' && template[i + 1] === '}') { bytes.push(253, count++); i++; continue; }
    if ((char === '{' || char === '}') && template[i + 1] === char) i++;
    else if (char === '{' || char === '}') fail(node, 'Use {} placeholders and doubled braces for literal braces');
    if (char === '\n') bytes.push(254);
    else { if (!font.ids.has(char)) fail(node, 'Unsupported formatted text character'); bytes.push(font.ids.get(char)); }
  }
  if (count !== node.args.length - 1) fail(node, 'format_text placeholder count must match values');
  const descriptor = label('format');
  graphics.textFormats ||= []; graphics.textFormats.push({ label: descriptor, bytes: [...bytes, 255] });
  const code = [];
  for (const arg of node.args.slice(1)) { numeric(arg, context); code.push(...expression(arg, context), '    push hl'); }
  for (let i = count; i >= 1; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
  return [...code, `    ld hl, ${descriptor}`, '    call FormatText'];
}
module.exports = { emitFormat };
