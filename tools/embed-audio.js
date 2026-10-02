#!/usr/bin/env node
/*
 * Embeds a cannon recording into audio/cannon.js so the page can decode and boost it
 * (browsers block that for loose local files). Usage:
 *   node tools/embed-audio.js [path/to/cannon.mp3]
 * With no argument it uses the first mp3 in audio/ whose name contains "cannon".
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'audio');
let src = process.argv[2];
if (!src) {
  const f = fs.readdirSync(dir).find((n) => /cannon/i.test(n) && /\.(mp3|wav|ogg|m4a)$/i.test(n));
  if (!f) { console.error('No cannon audio found in audio/. Pass a file path.'); process.exit(1); }
  src = path.join(dir, f);
}
const ext = path.extname(src).slice(1).toLowerCase();
const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' }[ext] || 'audio/mpeg';
const b64 = fs.readFileSync(src).toString('base64');
fs.writeFileSync(path.join(dir, 'cannon.js'), `window.BPG_CANNON = 'data:${mime};base64,${b64}';\n`);
console.log(`Embedded ${path.basename(src)} (${Math.round(b64.length / 1024)} KB) into audio/cannon.js`);
