import JSZip from 'jszip'
import type { Creation } from './types'

function sanitizeForModule(code: string) {
  return code
    .replace(/^\s*import\s+(?:[\s\S]*?\s+from\s+['"][^'"]+['"]\s*;?|['"][^'"]+['"]\s*;?)\s*$/gim, '')
    .replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"]\s*;?\s*$/gim, '')
    .replace(/^\s*export\s+default\s+/gim, '')
    .replace(/^\s*export\s+/gim, '')
    .replace(/ReactDOM\.createRoot\([\s\S]*?\)\.render\s*\([\s\S]*?\);?\s*/gi, '')
    .trim()
}

function appModule(code: string) {
  const sanitized = sanitizeForModule(code)
  const component = sanitized.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1] ?? sanitized.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(/)?.[1] ?? 'AlphaApp'
  return `import React from 'react';\n${sanitized}\n\nexport default ${component};\n`
}

function extractCss(files?: { path: string; code: string }[]) {
  const cssFiles = files?.filter((f) => f.path.toLowerCase().endsWith('.css')) || []
  return cssFiles.map((f) => f.code).join('\n')
}

const appEntitiesMigrationSql = `CREATE TABLE IF NOT EXISTS app_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_slug text NOT NULL,
  entity text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid,
  owner_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_entities_app_entity ON app_entities(app_slug, entity);
`

export async function exportCreationZip(creation: Creation) {
  const zip = new JSZip()
  const slug = (creation.title || 'alphatekx-creation').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'alphatekx-creation'
  const safeTitle = creation.title || 'AlphaTekX Creation'

  const sourceFiles = creation.files && creation.files.length > 1 ? creation.files : [{ path: 'src/App.tsx', code: creation.code }]
  const appFile = sourceFiles.find((f) => /app\.(jsx?|tsx)$/i.test(f.path))?.code ?? creation.code ?? sourceFiles[0]?.code ?? ''
  const generatedCss = extractCss(sourceFiles)

  zip.file('src/App.jsx', appModule(appFile))

  if (creation.files && creation.files.length > 1) {
    const generatedFolder = zip.folder('src/files')
    creation.files.forEach((file) => {
      if (/app\.(jsx?|tsx)$/i.test(file.path)) return
      const rel = file.path.startsWith('src/') ? file.path.slice(4) : file.path
      generatedFolder?.file(rel, file.code)
    })
  }

  zip.file('src/main.jsx', `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nwindow.ALPHA_APP_SLUG = '${slug}';\nwindow.AlphaAPI = window.AlphaAPI || {
  _key(entity) { return 'alphatekx:app:' + window.ALPHA_APP_SLUG + ':' + entity; },
  headers() { return {}; },
  url() { return '#'; },
  async get(entity, id) {
    const all = JSON.parse(localStorage.getItem(this._key(entity)) || '[]');
    if (id) { const record = all.find((r) => String(r.id) === String(id)); return { record }; }
    return { records: all };
  },
  async post(entity, data) {
    const all = JSON.parse(localStorage.getItem(this._key(entity)) || '[]');
    const record = { id: Math.random().toString(36).slice(2), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    all.push(record);
    localStorage.setItem(this._key(entity), JSON.stringify(all));
    return { record, total: all.length };
  },
  async put(entity, id, data) {
    const all = JSON.parse(localStorage.getItem(this._key(entity)) || '[]');
    const index = all.findIndex((r) => String(r.id) === String(id));
    if (index === -1) return { error: 'Not found' };
    all[index] = { ...all[index], ...data, id: all[index].id, updatedAt: new Date().toISOString() };
    localStorage.setItem(this._key(entity), JSON.stringify(all));
    return { record: all[index] };
  },
  async del(entity, id) {
    const all = JSON.parse(localStorage.getItem(this._key(entity)) || '[]');
    const index = all.findIndex((r) => String(r.id) === String(id));
    if (index === -1) return { error: 'Not found' };
    all.splice(index, 1);
    localStorage.setItem(this._key(entity), JSON.stringify(all));
    return { deleted: true, total: all.length };
  }
};\n\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);\n`)

  zip.file('src/index.css', `${generatedCss}\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nhtml, body, #root { min-height: 100%; margin: 0; }\n* { box-sizing: border-box; }\nbody { font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0A0A0A; color: #fff; }\n.liquid-glass { background: rgba(255,255,255,0.1); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.2); border-radius: 1rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }\n.btn-alpha { background: linear-gradient(90deg, #6366F1, #EC4899); border-radius: 9999px; padding: 0.5rem 1rem; font-weight: 600; color: white; }\n.gradient-text { background: linear-gradient(90deg, #6366F1, #EC4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }\n`)

  zip.file('index.html', `<!doctype html>\n<html>\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1"/>\n<title>${safeTitle}</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">\n<script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body>\n<div id="root"></div>\n<script type="module" src="/src/main.jsx"></script>\n</body>\n</html>`)

  zip.file('vite.config.js', `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n`)

  zip.file('tailwind.config.js', `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n  theme: {\n    extend: {\n      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] }\n    }\n  },\n  plugins: []\n};\n`)

  zip.file('postcss.config.js', `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`)

  const deps = new Set<string>(['react', 'react-dom'])
  ;(creation.dependencies || []).forEach((d) => { if (!d.startsWith('@vitejs')) deps.add(d) })

  zip.file('package.json', JSON.stringify({
    name: slug,
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: Object.fromEntries(Array.from(deps).sort().map((d) => [d, 'latest'])),
    devDependencies: {
      '@vitejs/plugin-react': 'latest',
      autoprefixer: 'latest',
      postcss: 'latest',
      tailwindcss: 'latest',
      vite: 'latest'
    }
  }, null, 2))

  zip.file('supabase/migrations/001_app_entities.sql', appEntitiesMigrationSql)
  zip.file('.env.example', '# Add service credentials required by your creation here.\n# Example: VITE_SUPABASE_URL=...\n# Example: VITE_SUPABASE_ANON_KEY=...\n')
  zip.file('vercel.json', JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2))
  zip.file('Dockerfile', 'FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\nFROM nginx:alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\nEXPOSE 80\n')
  zip.file('nginx.conf', 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }\n')

  zip.file('README.md', `# ${safeTitle}\n\nGenerated by AlphaTekX.\n\n## Files\n- \`src/App.jsx\` — combined runnable app (all generated components in one module for preview/engine compatibility).\n- \`src/files/\` — original multi-file breakdown from the builder.\n- \`src/main.jsx\` — Vite entry point.\n- \`supabase/migrations/001_app_entities.sql\` — Supabase schema for moving the local JSON store to a real Postgres backend.\n\n## Run locally\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Build for production\n\n\`\`\`bash\nnpm run build\n\`\`\`\n\n## Data backend\n\nBy default the exported app uses \`window.AlphaAPI\` with localStorage. When deployed from AlphaTekX, the platform injects a real backend client pointing at \`/api/apps/{slug}/{entity}\`. To use Supabase, run \`supabase/migrations/001_app_entities.sql\` and replace \`window.AlphaAPI\` with a Supabase client.\n\n## Deploy\n\n- Vercel: [vercel.com/new](https://vercel.com/new)\n- Render: [dashboard.render.com](https://dashboard.render.com)\n- Docker: \`docker build -t ${slug} . && docker run -p 8080:80 ${slug}\`\n`)

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${slug}.zip`
  anchor.click()
  URL.revokeObjectURL(url)
}
