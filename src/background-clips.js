'use strict';

// Each frame is a contiguous bank object: count, local patterns, then layout.
// Two disjoint VRAM ranges keep pattern uploads off the currently visible frame.
function prepareClips(assets, residentTiles) {
  const clips = assets.filter(asset => asset.kind === 'clip');
  const objects = [];
  let span = 0;
  for (const clip of clips) {
    clip.clipFrames = clip.maps.map((map, index) => {
      const ids = [...new Set(map)];
      if (ids.length > 255) throw new Error(`${clip.file}: background clip frame ${index} has more than 255 patterns`);
      const remap = new Map(ids.map((id, i) => [id, i]));
      span = Math.max(span, ids.length);
      const data = [ids.length, ...ids.flatMap(id => clip.tiles[id]), ...map.map(id => remap.get(id))];
      const label = `${clip.label}Frame${index}`;
      objects.push({ label, kind: 'background-frame', bytes: data.length,
        body: `${label}:\n    db ${data.join(', ')}\n` });
      return { label, tiles: ids.length };
    });
    objects.push({ label: clip.label, kind: 'background-index', bytes: clip.frames * 4, asset: clip,
      body: `${clip.label}:\n` + clip.clipFrames.map(frame => `    dw ${frame.label}, BANK(${frame.label})`).join('\n') });
    clip.clip = { residentBase: residentTiles, patternsPerBuffer: 0,
      peakFramePatterns: Math.max(...clip.clipFrames.map(frame => frame.tiles)) };
  }
  if (clips.length && residentTiles + span * 2 > 256) {
    throw new Error(`Background clips need two buffers of ${span} patterns plus ${residentTiles} resident tiles; reduce each frame to at most ${Math.floor((256 - residentTiles) / 2)} unique patterns`);
  }
  for (const clip of clips) clip.clip.patternsPerBuffer = span;
  return { objects, enabled: Boolean(clips.length), base: residentTiles, span };
}
module.exports = { prepareClips };
