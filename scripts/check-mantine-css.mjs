// Mantine components carry static m_xxxxxxxx class names. Any name in the built JS
// that no built CSS defines means src/mantine.css is missing that component's import.
import fs from 'node:fs';
import path from 'node:path';

const assets = process.argv[2] ?? 'dist/assets';
const read = (ext) => fs.readdirSync(assets).filter((file) => file.endsWith(ext)).map((file) => fs.readFileSync(path.join(assets, file), 'utf8')).join('\n');
const classNames = (text) => new Set(text.match(/\bm_[0-9a-f]{7,8}\b/g) ?? []);

const defined = classNames(read('.css'));
const used = classNames(read('.js'));
const missing = [...used].filter((name) => !defined.has(name));

if (missing.length) {
  console.error(`Mantine classes used without CSS: ${missing.join(', ')}`);
  console.error('Find the owning file with: grep -l <class> node_modules/@mantine/core/styles/*.css, then add it to src/mantine.css.');
  process.exit(1);
}
console.log(`Mantine CSS covers all ${used.size} classes the bundle uses.`);
