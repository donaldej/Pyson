'use strict';

// Preserve the original error text for callers, then add source and useful fixes.
function formatError(error, filename, sources) {
  const message = error.message.startsWith(`${filename}:`) ? error.message : `${filename}: ${error.message}`;
  const file = [...sources.keys()].sort((a, b) => b.length - a.length)
    .find(name => error.message.startsWith(`${name}:`)) || filename;
  const match = error.message.match(/\b(?:Line|line) (\d+)/);
  const line = match ? Number(match[1]) : null;
  const sourceLine = line ? sources.get(file)?.split(/\r?\n/)[line - 1] : undefined;
  let hint = error.hint;
  if (!hint) {
    if (/Expected an integer expression|print expects a string or integer/.test(message))
      hint = 'This operation needs a whole number. For a fractional value, use int(value), for example print(int(position), 0, 0). For a list, use an element such as values[0].';
    else if (/before assignment/.test(message))
      hint = 'Give this variable a starting value before using it. If you assign it inside an if statement, make sure every path assigns it.';
    else if (/Undefined variable/.test(message))
      hint = 'Check the spelling and assign a value before using this name. For a variable in an imported module, use module.variable.';
    else if (/Unknown function/.test(message))
      hint = 'Check the function name. Define it with def, or import it from the file that defines it.';
    else if (/read-only constant table/.test(message))
      hint = 'A constant table cannot be changed while the game runs. Use a normal list, such as values = [1, 2, 3], for data you need to update.';
    else if (/array aliases and copies/.test(message))
      hint = 'Create the array with a list, such as values = [1, 2, 3]. To change one item afterward, use values[0] = 4.';
    else if (/Positional arguments must precede keywords/.test(message))
      hint = 'Put unnamed values first, or name every argument: print(value="Hello", x=0, y=0).';
  }
  const result = new Error(message + (sourceLine !== undefined ? `\n  ${line} | ${sourceLine.slice(0, 240)}` : '') + (hint ? `\nHint: ${hint}` : ''));
  result.diagnostic = { filename: file, line, hint: hint || null };
  return result;
}

module.exports = { formatError };
