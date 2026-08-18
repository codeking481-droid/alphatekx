import { randomUUID } from "node:crypto";
import { supabaseServiceHeaders } from "./supabaseHeaders.mjs";

export const BUILDER_COST = 0;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const missingTable = (message) =>
  /(?:relation\s+["']?(?:public\.)?builder_projects["']?\s+does not exist|could not find the table\s+["']?public\.builder_projects|schema cache.*builder_projects)/i.test(
    String(message || ""),
  );
const missingColumn = (message) =>
  /(?:column\s+(?:builder_projects\.)?["']?[a-z_]+["']?\s+does not exist|could not find the\s+["']?[a-z_]+["']?\s+column.*builder_projects)/i.test(
    String(message || ""),
  );
const headers = (config) => supabaseServiceHeaders(config.service);

async function request(config, path, init = {}) {
  if (!config.url || !config.service)
    throw new Error("Builder database is not configured on the server.");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(config), ...(init.headers || {}) },
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `Builder database returned HTTP ${response.status}.`;
    if (missingTable(message))
      throw Object.assign(
        new Error(
          "Builder storage is not installed in production. Apply supabase/elite-builder.sql to the connected Supabase project.",
        ),
        { code: "BUILDER_SCHEMA_MISSING" },
      );
    if (missingColumn(message))
      throw Object.assign(
        new Error(
          "Builder storage is outdated. Apply the latest supabase/elite-builder.sql migration to add the required columns.",
        ),
        { code: "BUILDER_SCHEMA_OUTDATED" },
      );
    throw new Error(String(message));
  }
  return payload;
}

const isBuilderSchemaError = (error) =>
  ["BUILDER_SCHEMA_MISSING", "BUILDER_SCHEMA_OUTDATED"].includes(error?.code);
const isBuilderTableMissing = (error) => error?.code === "BUILDER_SCHEMA_MISSING";
const isBuilderSchemaOutdated = (error) => error?.code === "BUILDER_SCHEMA_OUTDATED";
const isMissingLegacyTable = (error) =>
  /(?:could not find the table\s+["']?public\.(?:creations|missions)|relation\s+["']?(?:public\.)?(?:creations|missions)["']?\s+does not exist|schema cache.*(?:creations|missions))/i.test(
    String(error?.message || error || ""),
  );

const missingMissionColumn = (error, column) =>
  new RegExp(
    `(?:could not find the\\s+["']?${column}["']?\\s+column\\s+of\\s+["']?missions|column\\s+(?:missions\\.)?["']?${column}["']?\\s+does not exist)`,
    "i",
  ).test(String(error?.message || error || ""));

function legacyProject(row = {}) {
  return {
    ...row,
    prompt: row.prompt || row.title || "Builder project",
    provider: row.provider || "alpha-compatible-storage",
    public_url: row.public_url || row.deployment_url || null,
    published: row.published === true,
    charged: true,
    views: Number(row.views || 0),
    versions: Array.isArray(row.versions) ? row.versions : [],
  };
}

async function saveLegacyProject(config, user, input) {
  const id = input.id || randomUUID();
  const title = String(input.title || "Untitled build")
    .trim()
    .slice(0, 120);
  const description = String(input.prompt || title).slice(0, 6000);
  const mission = {
    id,
    user_id: user.id,
    title,
    goal: description,
    status: "active",
    progress: 100,
  };
  try {
    await request(config, "missions", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(mission),
    });
  } catch (error) {
    if (!missingMissionColumn(error, "goal")) throw error;
    // Newer AlphaTekx installations use `description`; older ones require
    // `goal`. Retry only the rejected insert so no duplicate mission is made.
    const { goal: _legacyGoal, ...compatibleMission } = mission;
    await request(config, "missions", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...compatibleMission, description }),
    });
  }
  const rows = await request(config, "creations", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id,
      mission_id: id,
      user_id: user.id,
      owner_id: user.id,
      title,
      code: String(input.code || ""),
      type: "builder-v3",
      status: "ready",
      files: [],
      versions: [],
      published: false,
    }),
  });
  return legacyProject(rows?.[0] || { id, title, code: input.code, prompt: input.prompt });
}

export function normalizeBuilderCode(value) {
  let code = String(value || "").trim();
  const fence = code.match(/```(?:jsx|tsx|javascript|js)?\s*([\s\S]*?)```/i);
  if (fence) code = fence[1].trim();
  const iconBindings = [];
  const importPattern = /\bimport\s+(?:type\s+)?([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g;
  for (const match of code.matchAll(importPattern)) {
    if (match[3] !== "lucide-react") continue;
    const named = match[1].match(/\{([\s\S]*?)\}/)?.[1] || "";
    for (const entry of named.split(",")) {
      const parts = entry.trim().split(/\s+as\s+/i);
      const binding = parts[1] || parts[0];
      if (/^[A-Za-z_$][\w$]*$/.test(binding)) iconBindings.push(binding);
    }
  }
  code = code
    .replace(importPattern, "\n")
    .replace(/\bimport\s+(?:type\s+)?(['"])[^'"]+\1\s*;?/g, "\n")
    .replace(/\bexport\s+default\s+function\s+App\b/, "function App")
    .replace(/\bexport\s+default\s+App\s*;?/g, "")
    .replace(/\bexport\s+default\s+(?=(?:function|class)\s+App\b)/g, "")
    .replace(/\bexport\s+default\s+(?=(?:const|let|var)\s+App\b)/g, "")
    .replace(/\bexport\s+(?=(?:const|function|class)\s+)/g, "")
    .replace(/(?<!React\.)\b(useState|useEffect|useMemo|useReducer|useRef|useCallback|useContext)\s*\(/g, "React.$1(")
    .trim();
  if (iconBindings.length) {
    const definitions = Array.from(new Set(iconBindings))
      .map(name => `const ${name} = (props = {}) => React.createElement("span", { ...props, "aria-hidden": true });`)
      .join("\n");
    code = `${definitions}\n${code}`;
  }
  return code;
}

export function validateBuilderCode(value) {
  const raw = String(value || "");
  const code = normalizeBuilderCode(value);
  const errors = [];
  if (code.length < 300) errors.push("The generated application was incomplete.");
  if (!/(?:function|const)\s+App\b/.test(code))
    errors.push("The generated application did not define App.");
  if (!/\breturn\s*\(?\s*</.test(code))
    errors.push("The generated application did not render interface markup.");
  if (/\b(?:eval|Function)\s*\(/.test(code))
    errors.push("The generated application contained unsafe dynamic execution.");
  if (/<script\b/i.test(code))
    errors.push("The generated component contained an embedded script tag.");
  const unsupportedImports = Array.from(raw.matchAll(/\bimport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g))
    .map(match => match[1])
    .filter(moduleName => !["react", "lucide-react"].includes(moduleName));
  if (unsupportedImports.length)
    errors.push("The generated application depended on unavailable imports.");
  if (/\bimport\s+/.test(code))
    errors.push("The generated application contained an unhandled import.");
  if (/\b(?:ReactDOM\.)?createRoot\s*\(/.test(code))
    errors.push("The generated application attempted to mount itself.");
  if (/(?<!React\.)\b(?:useState|useEffect|useMemo|useReducer|useRef|useCallback|useContext)\s*\(/.test(code))
    errors.push("The generated application used an unavailable bare React hook.");
  for (const collection of ["products", "items", "features"]) {
    const used = new RegExp(`(?<![.\\w])${collection}\\s*\\.(?:map|filter|reduce|find)\\s*\\(`).test(code);
    const declared = new RegExp(`\\b(?:const|let|var)\\s+${collection}\\b`).test(code);
    if (used && !declared)
      errors.push(`The generated application referenced undeclared ${collection} data.`);
  }
  return { code, errors };
}

export function contextualFallbackBuilderCode(prompt) {
  const request = String(prompt || "").trim();
  if (/\b(?:e-?commerce|online store|shop|thrift|gown|fashion store|product grid)\b/i.test(request)) {
    return `function App() {
  const products = [
    { id: 1, name: 'Midnight Silk Gown', category: 'Evening', price: 48000, color: 'from-violet-700 to-fuchsia-400', image: 'https://gen.pollinations.ai/image/luxury%20midnight%20silk%20gown%20fashion%20editorial?model=flux&width=1200&height=628&enhance=true&nologo=true' },
    { id: 2, name: 'Lagos Linen Set', category: 'Everyday', price: 32000, color: 'from-amber-500 to-orange-300', image: 'https://gen.pollinations.ai/image/premium%20Lagos%20linen%20fashion%20set%20editorial?model=flux&width=1200&height=628&enhance=true&nologo=true' },
    { id: 3, name: 'Emerald Aso-Ebi', category: 'Occasion', price: 65000, color: 'from-emerald-700 to-teal-300', image: 'https://gen.pollinations.ai/image/elegant%20emerald%20aso-ebi%20gown%20studio%20fashion?model=flux&width=1200&height=628&enhance=true&nologo=true' },
    { id: 4, name: 'Rose Draped Dress', category: 'Evening', price: 42000, color: 'from-rose-700 to-pink-300', image: 'https://gen.pollinations.ai/image/rose%20draped%20evening%20dress%20luxury%20editorial?model=flux&width=1200&height=628&enhance=true&nologo=true' },
    { id: 5, name: 'Indigo Two-Piece', category: 'Everyday', price: 29000, color: 'from-indigo-800 to-blue-400', image: 'https://gen.pollinations.ai/image/indigo%20two-piece%20African%20fashion%20editorial?model=flux&width=1200&height=628&enhance=true&nologo=true' },
    { id: 6, name: 'Golden Ceremony Gown', category: 'Occasion', price: 72000, color: 'from-yellow-600 to-amber-200', image: 'https://gen.pollinations.ai/image/golden%20ceremony%20gown%20African%20luxury%20fashion?model=flux&width=1200&height=628&enhance=true&nologo=true' }
  ];
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('All');
  const [cart, setCart] = React.useState(() => { try { return JSON.parse(localStorage.getItem('alpha-thrift-cart') || '[]'); } catch { return []; } });
  const [cartOpen, setCartOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [ordered, setOrdered] = React.useState(false);
  React.useEffect(() => { localStorage.setItem('alpha-thrift-cart', JSON.stringify(cart)); }, [cart]);
  const visible = products.filter(item => (category === 'All' || item.category === category) && item.name.toLowerCase().includes(query.toLowerCase()));
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const add = product => { setCart(current => [...current, product]); setCartOpen(true); };
  const remove = index => setCart(current => current.filter((_, itemIndex) => itemIndex !== index));
  return <main className="min-h-screen bg-[#F7F4EF] text-[#191714]">
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#F7F4EF]/95 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><button onClick={() => setMenuOpen(!menuOpen)} className="grid size-11 place-items-center rounded-full border border-black/15 text-xl lg:hidden" aria-label="Toggle menu">{menuOpen ? '×' : '☰'}</button><strong className="text-xl font-black tracking-[-.04em] sm:text-2xl">SECOND STORY</strong><nav className="hidden gap-7 text-sm font-bold lg:flex">{['New in','Dresses','Sets','Our story'].map(item => <button key={item} className="hover:text-violet-700">{item}</button>)}</nav><button onClick={() => setCartOpen(true)} className="rounded-full bg-[#191714] px-5 py-3 text-sm font-black text-white">Bag · {cart.length}</button></div>{menuOpen && <nav className="grid gap-2 border-t border-black/10 p-5 lg:hidden">{['New in','Dresses','Sets','Our story'].map(item => <button key={item} className="rounded-xl p-3 text-left font-bold hover:bg-black/5">{item}</button>)}</nav>}</header>
    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-24"><div><p className="text-xs font-black uppercase tracking-[.24em] text-violet-700">Curated in Lagos · Worldwide delivery</p><h1 className="mt-5 text-5xl font-black leading-[.92] tracking-[-.06em] sm:text-7xl">Beautiful clothes deserve a second story.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-black/60">Shop verified pre-loved gowns and limited fashion pieces selected for quality, fit and character.</p><button onClick={() => document.getElementById('shop')?.scrollIntoView({behavior:'smooth'})} className="mt-8 rounded-full bg-violet-700 px-7 py-4 font-black text-white shadow-xl shadow-violet-700/20 transition hover:-translate-y-1">Shop the collection</button></div><div className="grid aspect-[4/3] grid-cols-2 gap-3 rounded-[2rem] bg-[#211C2D] p-3 shadow-2xl"><div className="rounded-[1.5rem] bg-gradient-to-br from-violet-600 to-fuchsia-300"/><div className="grid gap-3"><div className="rounded-[1.5rem] bg-gradient-to-br from-amber-400 to-orange-200"/><div className="rounded-[1.5rem] bg-gradient-to-br from-emerald-700 to-teal-300"/></div></div></section>
    <section id="shop" className="mx-auto max-w-7xl px-5 pb-24"><div className="flex flex-col justify-between gap-5 border-b border-black/10 pb-6 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-violet-700">Freshly listed</p><h2 className="mt-2 text-4xl font-black">Shop all pieces</h2></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the collection" className="w-full rounded-full border border-black/15 bg-white px-5 py-3 outline-none focus:border-violet-600 md:max-w-xs"/></div><div className="my-6 flex gap-2 overflow-auto pb-2">{['All','Evening','Everyday','Occasion'].map(item => <button key={item} onClick={() => setCategory(item)} className={'shrink-0 rounded-full px-5 py-2.5 text-sm font-black ' + (category === item ? 'bg-violet-700 text-white' : 'border border-black/15 bg-white')}>{item}</button>)}</div>{visible.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible.map(product => <article key={product.id} className="group overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className={'relative aspect-[4/3] overflow-hidden bg-gradient-to-br ' + product.color}><img src={product.image} alt={product.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"/></div><div className="p-5"><p className="text-xs font-black uppercase tracking-wider text-black/45">{product.category}</p><div className="mt-2 flex items-start justify-between gap-4"><h3 className="text-xl font-black">{product.name}</h3><strong className="shrink-0">₦{product.price.toLocaleString()}</strong></div><button onClick={() => add(product)} className="mt-5 w-full rounded-xl bg-[#191714] py-3 font-black text-white transition active:scale-95">Add to bag</button></div></article>)}</div> : <div className="rounded-3xl border border-dashed border-black/20 p-16 text-center"><h3 className="text-xl font-black">No pieces found</h3><button onClick={() => {setQuery('');setCategory('All')}} className="mt-3 font-bold text-violet-700">Clear filters</button></div>}</section>
    {cartOpen && <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={() => setCartOpen(false)}><aside className="flex h-full w-full max-w-md flex-col bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Your bag</h2><button onClick={() => setCartOpen(false)} className="grid size-10 place-items-center rounded-full bg-black/5 text-xl">×</button></div>{ordered ? <div className="grid flex-1 place-items-center text-center"><div><span className="text-5xl">✓</span><h3 className="mt-5 text-2xl font-black">Order reserved</h3><p className="mt-2 text-black/55">This demo checkout saved your selection locally.</p><button onClick={() => {setOrdered(false);setCart([]);setCartOpen(false)}} className="mt-6 font-black text-violet-700">Continue shopping</button></div></div> : <><div className="mt-6 flex-1 space-y-3 overflow-auto">{cart.length ? cart.map((item,index) => <div key={index} className="flex items-center gap-4 rounded-2xl bg-[#F7F4EF] p-4"><div className={'size-16 rounded-xl bg-gradient-to-br ' + item.color}/><div className="min-w-0 flex-1"><p className="truncate font-black">{item.name}</p><p className="text-sm text-black/55">₦{item.price.toLocaleString()}</p></div><button onClick={() => remove(index)} className="text-sm font-bold text-red-600">Remove</button></div>) : <div className="grid h-full place-items-center text-center text-black/50">Your bag is empty.</div>}</div><div className="border-t border-black/10 pt-5"><p className="flex justify-between text-lg font-black"><span>Total</span><span>₦{total.toLocaleString()}</span></p><button disabled={!cart.length} onClick={() => setOrdered(true)} className="mt-4 w-full rounded-xl bg-violet-700 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Demo checkout</button></div></>}</aside></div>}
    <footer className="border-t border-black/10 bg-white px-5 py-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row"><strong>SECOND STORY</strong><p className="text-sm text-black/50">Verified thrift fashion · Secure delivery · Lagos, Nigeria</p></div></footer>
  </main>;
}`;
  }
  if (!/\b(?:school|academy|college|nursery|primary|secondary|university|education)\b/i.test(request)) return "";
  return `function App() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [selectedProgram, setSelectedProgram] = React.useState('Primary School');
  const [submitted, setSubmitted] = React.useState(false);
  const programs = [
    { name: 'Early Years', ages: 'Ages 2–5', detail: 'Play-led learning that builds confidence, language and curiosity.' },
    { name: 'Primary School', ages: 'Ages 5–11', detail: 'Strong foundations in literacy, mathematics, science and creativity.' },
    { name: 'Secondary School', ages: 'Ages 11–17', detail: 'Exam-ready learning, leadership development and practical digital skills.' }
  ];
  const news = [
    ['Admissions now open', 'Book a guided campus tour and meet our academic team.'],
    ['Science fair showcase', 'Students presented renewable-energy projects to families and local leaders.'],
    ['Inter-house sports', 'A full day of teamwork, athletics and community celebration.']
  ];
  const scrollTo = id => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setMenuOpen(false); };
  return <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <button onClick={() => scrollTo('home')} className="flex items-center gap-3 text-left">
          <span className="grid size-11 place-items-center rounded-2xl bg-blue-700 text-xl font-black text-white">A</span>
          <span><strong className="block text-base font-black">Alpha Heights School</strong><small className="text-xs font-bold text-blue-700">Learn · Lead · Flourish</small></span>
        </button>
        <nav className="hidden items-center gap-7 text-sm font-bold md:flex">
          {['about','programs','news','admissions'].map(item => <button key={item} onClick={() => scrollTo(item)} className="capitalize text-slate-600 transition hover:text-blue-700">{item}</button>)}
        </nav>
        <button onClick={() => scrollTo('admissions')} className="hidden rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 md:block">Apply now</button>
        <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-xl md:hidden">{menuOpen ? '×' : '☰'}</button>
      </div>
      {menuOpen && <nav className="grid gap-2 border-t border-slate-100 bg-white p-5 md:hidden">{['about','programs','news','admissions'].map(item => <button key={item} onClick={() => scrollTo(item)} className="rounded-xl px-4 py-3 text-left font-bold capitalize hover:bg-blue-50">{item}</button>)}</nav>}
    </header>
    <section id="home" className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-cyan-700 text-white">
      <div className="absolute -right-24 top-10 size-80 rounded-full bg-cyan-300/20 blur-3xl"/><div className="absolute -left-20 bottom-0 size-72 rounded-full bg-amber-300/15 blur-3xl"/>
      <div className="relative mx-auto grid min-h-[620px] max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_.9fr]">
        <div><p className="text-sm font-black uppercase tracking-[.24em] text-cyan-200">Admissions open for 2026/2027</p><h1 className="mt-6 max-w-3xl text-5xl font-black leading-[.98] sm:text-6xl lg:text-7xl">A school where every child can thrive.</h1><p className="mt-7 max-w-2xl text-lg font-medium leading-8 text-blue-50/80">Excellent teaching, strong character and a safe community prepare learners for a changing world.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><button onClick={() => scrollTo('admissions')} className="rounded-xl bg-amber-400 px-7 py-4 font-black text-blue-950 transition hover:-translate-y-1">Start an application</button><button onClick={() => scrollTo('about')} className="rounded-xl border border-white/30 bg-white/10 px-7 py-4 font-black backdrop-blur transition hover:bg-white/20">Explore our school</button></div></div>
        <div className="rounded-[2rem] border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-xl"><div className="grid aspect-[4/3] place-items-center rounded-3xl bg-gradient-to-br from-cyan-300/30 to-blue-950/40 p-8 text-center"><div><span className="text-7xl">🎓</span><p className="mt-5 text-2xl font-black">Future-ready learning</p><p className="mt-2 text-blue-100/75">Small classes · Caring teachers · Modern facilities</p></div></div></div>
      </div>
    </section>
    <section id="about" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-2 lg:items-center"><div><p className="font-black uppercase tracking-[.2em] text-blue-700">Why families choose us</p><h2 className="mt-4 text-4xl font-black sm:text-5xl">Education with purpose.</h2><p className="mt-5 text-lg leading-8 text-slate-600">We combine rigorous academics with creativity, technology, sport and service. Every learner is known, supported and challenged.</p></div><div className="grid grid-cols-2 gap-4">{[['18','Average class size'],['96%','Parent satisfaction'],['25+','Clubs and activities'],['100%','Safeguarding trained']].map(([value,label]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><strong className="text-3xl font-black text-blue-700">{value}</strong><p className="mt-2 text-sm font-bold text-slate-500">{label}</p></article>)}</div></section>
    <section id="programs" className="bg-white py-20"><div className="mx-auto max-w-7xl px-5"><div className="max-w-2xl"><p className="font-black uppercase tracking-[.2em] text-blue-700">Our programmes</p><h2 className="mt-4 text-4xl font-black">A clear path from first steps to graduation.</h2></div><div className="mt-10 grid gap-5 md:grid-cols-3">{programs.map(program => <button key={program.name} onClick={() => setSelectedProgram(program.name)} className={'rounded-3xl border p-7 text-left transition hover:-translate-y-1 hover:shadow-xl ' + (selectedProgram === program.name ? 'border-blue-700 bg-blue-700 text-white shadow-xl shadow-blue-700/20' : 'border-slate-200 bg-white')}><span className={'text-xs font-black uppercase tracking-wider ' + (selectedProgram === program.name ? 'text-cyan-200' : 'text-blue-700')}>{program.ages}</span><h3 className="mt-4 text-2xl font-black">{program.name}</h3><p className={'mt-3 leading-7 ' + (selectedProgram === program.name ? 'text-blue-50/80' : 'text-slate-600')}>{program.detail}</p></button>)}</div></div></section>
    <section id="news" className="mx-auto max-w-7xl px-5 py-20"><h2 className="text-4xl font-black">Life at Alpha Heights</h2><div className="mt-9 grid gap-5 md:grid-cols-3">{news.map(([title,copy],index) => <article key={title} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className={'h-40 ' + ['bg-blue-700','bg-cyan-600','bg-amber-400'][index]}/><div className="p-6"><p className="text-xs font-black uppercase tracking-wider text-blue-700">School update</p><h3 className="mt-3 text-xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-600">{copy}</p></div></article>)}</div></section>
    <section id="admissions" className="bg-blue-950 py-20 text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-2"><div><p className="font-black uppercase tracking-[.2em] text-cyan-300">Admissions</p><h2 className="mt-4 text-4xl font-black sm:text-5xl">Come and see your child’s next chapter.</h2><p className="mt-5 max-w-xl text-lg leading-8 text-blue-100/70">Tell us which programme interests you. Our admissions team will contact you to arrange a tour.</p></div><div className="rounded-3xl bg-white p-6 text-slate-950 sm:p-8">{submitted ? <div className="grid min-h-72 place-items-center text-center"><div><span className="text-5xl">✓</span><h3 className="mt-5 text-2xl font-black">Enquiry received</h3><p className="mt-2 text-slate-600">Our admissions team will contact you shortly.</p><button onClick={() => setSubmitted(false)} className="mt-6 font-black text-blue-700">Send another enquiry</button></div></div> : <form onSubmit={event => { event.preventDefault(); setSubmitted(true); }} className="grid gap-4"><input required aria-label="Parent name" placeholder="Parent or guardian name" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"/><input required type="email" aria-label="Email address" placeholder="Email address" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"/><select value={selectedProgram} onChange={event => setSelectedProgram(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3">{programs.map(program => <option key={program.name}>{program.name}</option>)}</select><textarea required aria-label="Message" placeholder="Tell us about your child" rows={4} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-600"/><button className="rounded-xl bg-blue-700 px-6 py-4 font-black text-white">Request a school tour</button></form>}</div></div></section>
    <footer className="bg-slate-950 px-5 py-10 text-slate-400"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row"><p className="font-bold text-white">Alpha Heights School</p><p>12 Learning Avenue · Lagos · admissions@alphaheights.edu</p></div></footer>
  </main>;
}`;
}

export function transientBuilderProject(input = {}) {
  const id = input.id || randomUUID();
  return {
    id,
    slug: null,
    title: String(input.title || "Untitled build").trim().slice(0, 120),
    prompt: String(input.prompt || "").trim().slice(0, 6000),
    code: String(input.code || ""),
    provider: String(input.provider || "alpha"),
    public_url: null,
    published: false,
    charged: false,
    persisted: false,
    transient: true,
    created_at: new Date().toISOString(),
  };
}

export async function listProjects(config, user) {
  try {
    const rows = await request(
      config,
      `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&charged=eq.true&select=id,slug,title,prompt,code,provider,public_url,published,views,versions,created_at,updated_at&order=created_at.desc&limit=50`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isBuilderSchemaOutdated(error)) {
      try {
        const rows = await request(
          config,
          `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=50`,
        );
        return Array.isArray(rows) ? rows.map(legacyProject) : [];
      } catch (compatibilityError) {
        if (!isBuilderSchemaError(compatibilityError)) throw compatibilityError;
      }
    } else if (!isBuilderTableMissing(error)) {
      throw error;
    }
    try {
      const rows = await request(
        config,
        `creations?user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=id,slug,title,code,deployment_url,published,versions,created_at&order=created_at.desc&limit=50`,
      );
      return Array.isArray(rows) ? rows.map(legacyProject) : [];
    } catch (legacyError) {
      // History is optional UI data. An installation with neither historical
      // table must show an honest empty state instead of breaking Builder.
      if (isMissingLegacyTable(legacyError)) return [];
      throw legacyError;
    }
  }
}

export async function findProjectByRequest(config, user, requestId) {
  try {
    const rows = await request(
      config,
      `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&select=*&limit=1`,
    );
    return rows?.[0] || null;
  } catch (error) {
    if (isBuilderSchemaOutdated(error)) {
      const rows = await request(
        config,
        `builder_projects?id=eq.${encodeURIComponent(requestId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
      ).catch(() => []);
      return rows?.[0] ? legacyProject(rows[0]) : null;
    }
    if (!isBuilderTableMissing(error)) throw error;
    try {
      const rows = await request(
        config,
        `creations?id=eq.${encodeURIComponent(requestId)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=*&limit=1`,
      );
      return rows?.[0] ? legacyProject(rows[0]) : null;
    } catch (legacyError) {
      if (isMissingLegacyTable(legacyError)) return null;
      throw legacyError;
    }
  }
}

export async function getOwnerProject(config, user, id) {
  try {
    const rows = await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
    );
    return rows?.[0] || null;
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    const rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=*&limit=1`,
    );
    return rows?.[0] ? legacyProject(rows[0]) : null;
  }
}

export async function updateProjectCode(config, user, id, code, provider) {
  const current = await getOwnerProject(config, user, id);
  const versions = Array.isArray(current?.versions) ? current.versions : [];
  const nextVersions = current?.code
    ? [
        ...versions,
        {
          id: randomUUID(),
          code: current.code,
          provider: current.provider || "alpha",
          created_at: new Date().toISOString(),
        },
      ].slice(-20)
    : versions;
  let rows;
  try {
    rows = await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          code,
          provider,
          versions: nextVersions,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ code, versions: nextVersions }),
      },
    );
    rows = rows?.map(legacyProject);
  }
  if (!rows?.length)
    throw Object.assign(new Error("This build could not be found in your account."), {
      status: 404,
    });
  return rows[0];
}

export async function requestCustomDomain(config, user, id, domain, token) {
  const normalized = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
    throw Object.assign(new Error("Enter a valid domain such as app.example.com."), {
      status: 400,
    });
  }
  const rows = await request(
    config,
    `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        custom_domain: normalized,
        domain_status: "pending_dns",
        domain_verification_token: token,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!rows?.length)
    throw Object.assign(new Error("This build could not be found."), { status: 404 });
  return {
    project: rows[0],
    domain: normalized,
    verification: { type: "TXT", name: `_alphatekx.${normalized}`, value: token },
  };
}

export async function saveGeneratedProject(config, user, input) {
  const id = input.id || randomUUID();
  const record = {
    id,
    user_id: user.id,
    // A private draft slug keeps this compatible with older installations
    // where the original builder_projects.slug column was declared NOT NULL.
    slug: `draft-${String(id).replace(/-/g, "").slice(0, 20)}`,
    title: String(input.title || "Untitled build")
      .trim()
      .slice(0, 120),
    prompt: String(input.prompt || "")
      .trim()
      .slice(0, 6000),
    code: String(input.code || ""),
    provider: String(input.provider || "alpha"),
    request_id: String(input.requestId || id),
    charged: false,
    published: false,
    updated_at: new Date().toISOString(),
  };
  try {
    const rows = await request(config, "builder_projects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record),
    });
    return rows?.[0] || record;
  } catch (error) {
    if (isBuilderSchemaOutdated(error)) {
      const compatible = {
        id,
        user_id: user.id,
        slug: record.slug,
        title: record.title,
        prompt: record.prompt,
        code: record.code,
      };
      const rows = await request(config, "builder_projects", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(compatible),
      });
      return legacyProject(rows?.[0] || compatible);
    }
    if (!isBuilderTableMissing(error)) throw error;
    return saveLegacyProject(config, user, { ...input, id });
  }
}

export async function markProjectCharged(config, user, id) {
  let rows;
  try {
    rows = await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ charged: true, updated_at: new Date().toISOString() }),
      },
    );
  } catch (error) {
    if (isBuilderSchemaOutdated(error)) {
      const current = await getOwnerProject(config, user, id);
      if (!current) throw new Error("Builder could not finalize the verified project.");
      return legacyProject({ ...current, charged: true });
    }
    if (!isBuilderTableMissing(error)) throw error;
    rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=*`,
      { headers: { Prefer: "return=representation" } },
    );
    rows = rows?.map(legacyProject);
  }
  if (!rows?.length) throw new Error("Builder could not finalize the verified project.");
  return rows[0];
}

export async function deleteProject(config, user, id) {
  try {
    await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      },
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await request(
      config,
      `missions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    ).catch(() => {});
  }
}

export async function deployProject(config, user, input, baseUrl) {
  const id = String(input.id || "");
  const slug = String(input.slug || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw Object.assign(new Error("Select a generated project before deploying."), { status: 400 });
  if (!SLUG_PATTERN.test(slug))
    throw Object.assign(
      new Error(
        "Use 3–30 lowercase letters, numbers, or hyphens. Start and end with a letter or number.",
      ),
      { status: 400 },
    );
  let compatibleStorage = false;
  let conflict;
  try {
    conflict = await request(
      config,
      `builder_projects?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(id)}&select=id&limit=1`,
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    compatibleStorage = true;
    conflict = await request(
      config,
      `creations?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(id)}&select=id&limit=1`,
    );
  }
  if (conflict?.length)
    throw Object.assign(new Error("That Builder address is already taken. Choose another slug."), {
      status: 409,
    });
  const appBase = new URL(String(baseUrl));
  const publicUrl =
    appBase.hostname === "alphatekx.name.ng"
      ? `${appBase.protocol}//${slug}.alphatekx.name.ng`
      : `${String(baseUrl).replace(/\/$/, "")}/b/${slug}`;
  const pathUrl = `${String(baseUrl).replace(/\/$/, "")}/b/${slug}`;
  let rows = await request(
    config,
    `${compatibleStorage ? "creations" : "builder_projects"}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(
        compatibleStorage
          ? { slug, deployment_url: publicUrl, published: true, status: "deployed" }
          : { slug, public_url: publicUrl, published: true, updated_at: new Date().toISOString() },
      ),
    },
  );
  if (compatibleStorage) rows = rows?.map(legacyProject);
  if (!rows?.length)
    throw Object.assign(new Error("This build could not be found in your account."), {
      status: 404,
    });
  return { project: rows[0], publicUrl, pathUrl };
}

export async function getPublicProject(config, slug) {
  if (!SLUG_PATTERN.test(String(slug || ""))) return null;
  let compatibleStorage = false;
  let rows;
  try {
    rows = await request(
      config,
      `builder_projects?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=id,slug,title,code,public_url,views,created_at&limit=1`,
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    compatibleStorage = true;
    rows = await request(
      config,
      `creations?slug=eq.${encodeURIComponent(slug)}&published=eq.true&type=eq.builder-v3&select=id,slug,title,code,deployment_url,created_at&limit=1`,
    );
  }
  const project = rows?.[0] ? (compatibleStorage ? legacyProject(rows[0]) : rows[0]) : null;
  if (!project) return null;
  let views = Number(project.views || 0);
  try {
    if (compatibleStorage) return project;
    const incremented = await request(config, "rpc/increment_builder_views", {
      method: "POST",
      body: JSON.stringify({ slug_param: slug }),
    });
    if (Number.isFinite(Number(incremented))) views = Number(incremented);
  } catch (error) {
    console.warn(
      "[Elite Builder] Atomic view increment unavailable:",
      error instanceof Error ? error.message : error,
    );
  }
  return { ...project, views };
}
