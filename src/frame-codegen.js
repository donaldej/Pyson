'use strict';
const procedures = ['wait_frames'];
const names = ['frame_count', 'elapsed_frames', ...procedures];
function emitFrame(node, context, helpers, graphics) {
  if (!names.includes(node.name)) return null;
  const { fail, numeric, expression, literalNumber } = helpers;
  const count = node.name === 'frame_count' ? 0 : 1;
  if (node.args.length !== count) fail(node, `${node.name} expects ${count ? 'one argument' : 'no arguments'}`);
  graphics.frameClock = true;
  const code = [];
  if (count) {
    numeric(node.args[0], context);
    const value = literalNumber(node.args[0]);
    if (value !== null && (value < 0 || value > 32767)) fail(node, `${node.name} expects an integer 0..32767`);
    code.push(...expression(node.args[0], context));
  }
  code.push(`    call ${{ frame_count: 'ReadFrameCount', elapsed_frames: 'ElapsedFrames', wait_frames: 'WaitFrames' }[node.name]}`);
  if (node.name === 'wait_frames') code.push('    call PollButtons', '    ld hl, 0');
  return code;
}
module.exports = { names, procedures, emitFrame };
