'use strict';

// Exact sizes for the instruction subset emitted by the compiler. RGBDS ASSERTs
// verify this calculation at assembly time so future emitters cannot silently overlap.
function instructionBytes(line) {
  const text = line.split(';')[0].trim().toLowerCase();
  if (!text || text.endsWith(':')) return 0;
  const [op, ...tail] = text.split(/\s+/);
  const args = tail.join(' ').split(',').map(x => x.trim());
  const byteRegister = x => /^(a|b|c|d|e|h|l|\[hl\])$/.test(x);
  const indirect = x => /^\[(bc|de|hl|hli|hld|hl\+|hl-)\]$/.test(x);
  if (op === 'call' || op === 'jp') return op === 'jp' && args[0] === 'hl' ? 1 : 3;
  if (op === 'jr' || op === 'ldh') return 2;
  if (op === 'ld') {
    if (args[0] === 'hl' && /^sp\s*\+/.test(args[1])) return 2;
    if (args.some(x => x.startsWith('[') && !indirect(x))) return 3;
    if (byteRegister(args[1]) || indirect(args[1])) return 1;
    if (indirect(args[0]) && args[1] === 'a') return 1;
    if (/^(bc|de|hl|sp)$/.test(args[0])) return 3;
    return 2;
  }
  if (['push', 'pop', 'inc', 'dec', 'ret', 'cpl', 'nop', 'scf', 'ccf', 'rlca', 'rrca', 'rla', 'rra'].includes(op)) return 1;
  if (['bit', 'res', 'set', 'rl', 'rr', 'sla', 'sra', 'srl', 'swap'].includes(op)) return 2;
  if (['add', 'adc', 'sub', 'sbc', 'and', 'or', 'xor', 'cp'].includes(op)) {
    if (args[0] === 'hl') return 1;
    return byteRegister(args[args.length - 1]) ? 1 : 2;
  }
  throw new Error(`Unknown emitted instruction for bank sizing: ${line}`);
}

function bankFunctions(functions) {
  const wrappers = new Set();
  const objects = functions.map(fn => {
    const code = fn.code.map(line => {
      const match = /^\s+call ([A-Za-z_][A-Za-z0-9_]*)$/.exec(line);
      if (!match || match[1] === 'CallBankedFunction') return line;
      wrappers.add(match[1]);
      return `    call BankedRuntime_${match[1]}`;
    });
    const bytes = code.reduce((total, line) => total + instructionBytes(line), 0);
    if (bytes > 16383) throw new Error(`${fn.filename}: Line ${fn.line}: Function "${fn.name}" exceeds one 16 KB ROM bank; split it into smaller functions`);
    return { ...fn, kind: 'function', bytes, code };
  });
  const runtimeWrappers = [...wrappers].map(name => `BankedRuntime_${name}:\n    call ${name}\n    jp RestoreExecutionBank`).join('\n');
  return { objects, runtimeWrappers };
}

module.exports = { instructionBytes, bankFunctions };
