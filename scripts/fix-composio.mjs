import { writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = join('node_modules', '@composio', 'client');

// Fix core/ subdirectory
const coreDir = join(base, 'core');
if (existsSync(coreDir)) {
  const jsFiles = readdirSync(coreDir).filter(f => f.endsWith('.js') && !f.endsWith('.d.ts'));
  let created = 0;
  for (const f of jsFiles) {
    const mjs = join(coreDir, f.replace('.js', '.mjs'));
    if (!existsSync(mjs)) {
      writeFileSync(mjs, `export * from './${f}';\nexport { default } from './${f}';\n`);
      created++;
    }
  }
  console.log(`Core dir: ${jsFiles.length} .js files, created ${created} .mjs wrappers`);
}

// Fix resources/ subdirectory
const resDir = join(base, 'resources');
if (existsSync(resDir)) {
  const jsFiles = readdirSync(resDir).filter(f => f.endsWith('.js') && !f.endsWith('.d.ts'));
  let created = 0;
  for (const f of jsFiles) {
    const mjs = join(resDir, f.replace('.js', '.mjs'));
    if (!existsSync(mjs)) {
      writeFileSync(mjs, `export * from './${f}';\nexport { default } from './${f}';\n`);
      created++;
    }
  }
  console.log(`Resources dir: ${jsFiles.length} .js files, created ${created} .mjs wrappers`);
}
