export function SaaSLandingTemplate(title, idea) {
  const PLANS = [
    { id: 'starter', name: 'Starter', price: 9, features: ['1 project', 'Basic analytics', 'Community support', 'Email alerts'] },
    { id: 'pro', name: 'Pro', price: 29, features: ['Unlimited projects', 'Advanced analytics', 'Priority support', 'API access', 'Team invites'] },
    { id: 'enterprise', name: 'Enterprise', price: 99, features: ['Everything in Pro', 'SSO / SAML', 'Dedicated support', 'Custom SLA', 'On-premise option'] }
  ]
  const TESTIMONIALS = [
    { quote: 'AlphaTekX cut our launch time from months to days. The builder is magic.', author: 'Morgan Chen', role: 'CTO, Velocity' },
    { quote: 'Finally a tool that understands product intent and ships real code.', author: 'Sarah Adeyemi', role: 'Founder, Nexa' },
    { quote: 'The quality and speed of the generated apps exceeded our expectations.', author: 'Daniel Thompson', role: 'Engineering Lead, Orbit' }
  ]
  const FAQS = [
    { q: 'What can I build with AlphaTekX?', a: 'Landing pages, dashboards, internal tools, e-commerce stores, learning platforms, and more.' },
    { q: 'Do I need to write code?', a: 'No. Describe what you want in plain English and AlphaTekX generates the app, build, and preview.' },
    { q: 'Can I edit the generated app?', a: 'Yes. Send follow-up instructions like "change the navbar" or "add dark mode" and the app updates.' },
    { q: 'Is the generated app production-ready?', a: 'AlphaTekX runs real builds, lint, and type checks before marking a preview complete.' }
  ]
  const FEATURES = ['AI-first design', 'Real-time preview', 'Mobile responsive', 'Export clean code', 'Secure by default', 'Instant deploy']
  const ICONS = ['⚡', '🖼️', '📱', '💻', '🔒', '🚀']

  const planCards = PLANS.map((plan) => `
            <div key="${plan.id}" className="rounded-2xl border border-white/10 bg-[#151515] p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">${plan.name}</h3>
              <div className="mt-3 text-4xl font-bold text-white">{'$' + ${plan.price}}<span className="text-base font-normal text-zinc-500">/mo</span></div>
              <ul className="mt-6 space-y-2 text-sm text-zinc-300">
                ${plan.features.map((feat) => `<li key="${feat}" className="flex items-center gap-2">✓ ${feat}</li>`).join('\n                ')}
              </ul>
              <button className="mt-8 w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">Choose ${plan.name}</button>
            </div>`).join('')

  const testimonialCards = TESTIMONIALS.map((t, i) => `
            <div key="${i}" className="rounded-2xl border border-white/10 bg-[#151515] p-6">
              <p className="text-sm italic text-zinc-300">"${t.quote}"</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">${t.author.split(' ').map((n) => n[0]).join('')}</div>
                <div>
                  <div className="text-sm font-semibold text-white">${t.author}</div>
                  <div className="text-xs text-zinc-500">${t.role}</div>
                </div>
              </div>
            </div>`).join('')

  const faqItems = FAQS.map((f, i) => `
            <div key="${i}" className="rounded-2xl border border-white/10 bg-[#151515]">
              <button onClick={() => setOpenFaq(openFaq === ${i} ? -1 : ${i})} className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-semibold text-white">
                ${f.q}
                <span className="text-zinc-500">{openFaq === ${i} ? '−' : '+'}</span>
              </button>
              {openFaq === ${i} && <div className="px-6 pb-4 text-sm text-zinc-400">${f.a}</div>}
            </div>`).join('')

  const featureCards = FEATURES.map((f, i) => `
            <div key="${i}" className="rounded-2xl border border-white/10 bg-[#151515] p-6">
              <div className="mb-3 text-2xl">${ICONS[i]}</div>
              <h3 className="font-semibold text-white">${f}</h3>
              <p className="mt-2 text-sm text-zinc-500">Powerful, simple, and ready to ship.</p>
            </div>`).join('')

  return `const { useState } = React;

function AlphaApp() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const TITLE = ${JSON.stringify(title)};
  const IDEA = ${JSON.stringify(idea)};
  return (
    <div className="h-screen w-full overflow-y-auto overflow-x-hidden bg-[#0A0A0A] text-zinc-100">
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0A]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-lg font-bold text-transparent">{TITLE}</span>
          <div className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#testimonials" className="hover:text-white">Testimonials</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <button className="rounded-full bg-indigo-500 px-4 py-2 font-medium text-white hover:bg-indigo-400">Get started</button>
          </div>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-md p-2 text-zinc-400 md:hidden">
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
        {mobileOpen && (
          <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-sm text-zinc-300 md:hidden">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#testimonials" className="hover:text-white">Testimonials</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <button className="rounded-full bg-indigo-500 px-4 py-2 text-white">Get started</button>
          </div>
        )}
      </nav>

      <section className="hero mx-auto max-w-6xl px-6 py-20 text-center md:py-32">
        <h1 className="bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-4xl font-extrabold leading-tight text-transparent md:text-6xl">
          {IDEA}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
          Ship beautiful, responsive {TITLE} experiences in minutes. No design skills required.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <button className="rounded-full bg-indigo-500 px-7 py-3 font-semibold text-white shadow-lg hover:bg-indigo-400">Start building free</button>
          <button className="rounded-full border border-white/15 px-7 py-3 font-semibold text-white hover:bg-white/5">View demo</button>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-white">Built for modern teams</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${featureCards}
        </div>
      </section>

      <section id="pricing" className="pricing mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-white">Simple pricing</h2>
        <div className="grid gap-6 md:grid-cols-3">${planCards}
        </div>
      </section>

      <section id="testimonials" className="testimonials mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-white">Loved by builders</h2>
        <div className="grid gap-6 md:grid-cols-3">${testimonialCards}
        </div>
      </section>

      <section id="faq" className="faq mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold text-white">Frequently asked questions</h2>
        <div className="space-y-3">${faqItems}
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#0A0A0A] px-6 py-12">
        <div className="mx-auto max-w-6xl text-center text-zinc-500">
          <div className="mb-4 flex justify-center gap-6 text-sm">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
          <p className="text-xs">&copy; ${new Date().getFullYear()} {TITLE}. Built by AlphaTekX.</p>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`
}

export function TaskDashboardTemplate(title, idea) {
  const INITIAL_TASKS = [
    { id: 1, title: 'Design dashboard layout', status: 'todo', priority: 'high', tag: 'Design' },
    { id: 2, title: 'Connect authentication API', status: 'in progress', priority: 'high', tag: 'Engineering' },
    { id: 3, title: 'Write onboarding copy', status: 'done', priority: 'medium', tag: 'Product' },
    { id: 4, title: 'Set up dark mode toggle', status: 'todo', priority: 'medium', tag: 'Design' },
    { id: 5, title: 'Add filters to task list', status: 'in progress', priority: 'low', tag: 'Engineering' }
  ]
  const FILTERS = ['all', 'todo', 'in progress', 'done']
  const STAT_LABELS = ['Total tasks', 'To do', 'In progress', 'Done']
  const SIDEBAR = ['Dashboard', 'My tasks', 'Team', 'Settings']

  const initialTasksJson = JSON.stringify(INITIAL_TASKS)

  return `const { useState, useMemo } = React;

const INITIAL_TASKS = ${initialTasksJson};

function AlphaApp() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [filter, setFilter] = useState('all');
  const [dark, setDark] = useState(true);
  const [newTask, setNewTask] = useState('');
  const [selected, setSelected] = useState('Dashboard');
  const TITLE = ${JSON.stringify(title)};

  const filtered = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    inProgress: tasks.filter((t) => t.status === 'in progress').length,
    done: tasks.filter((t) => t.status === 'done').length
  }), [tasks]);

  const toggleStatus = (id) => {
    const next = ['todo', 'in progress', 'done'];
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: next[(next.indexOf(t.status) + 1) % next.length] } : t));
  };

  const addTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    setTasks((prev) => [...prev, { id: Date.now(), title: newTask, status: 'todo', priority: 'medium', tag: 'General' }]);
    setNewTask('');
  };

  const chartData = [stats.todo, stats.inProgress, stats.done];
  const chartMax = Math.max(1, ...chartData);
  const chartLabels = ['To do', 'In progress', 'Done'];

  return (
    <div className={'h-screen w-full overflow-hidden flex flex-col ' + (dark ? 'bg-[#0A0A0A] text-zinc-100' : 'bg-zinc-50 text-zinc-900')}>
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected('Dashboard')} className="rounded-md p-2 text-zinc-400 md:hidden">☰</button>
          <h1 className="text-base font-semibold">{TITLE}</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <button onClick={() => setDark(!dark)} className="rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5">{dark ? 'Dark mode' : 'Light mode'}</button>
          <span className="hidden rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-400 md:inline">Online</span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden w-60 flex-col gap-1 border-r border-white/10 bg-[#151515] p-3 md:flex">
          <div className="mb-4 px-2 text-sm font-bold text-white">Workspace</div>
          ${SIDEBAR.map((item) => `<button key="${item}" onClick={() => setSelected('${item}')} className={'rounded-lg px-3 py-2 text-left text-sm transition-colors ' + (selected === '${item}' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white')}>
            ${item}
          </button>`).join('\n          ')}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
          <h2 className="dashboard mb-4 text-xl font-bold">Dashboard</h2>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            ${STAT_LABELS.map((label, i) => `<div key="${label}" className="rounded-2xl border border-white/10 bg-[#151515] p-4"><div className="text-xs text-zinc-500">${label}</div><div className="mt-1 text-2xl font-semibold">{stats.${['total','todo','inProgress','done'][i]}}</div></div>`).join('\n            ')}
          </div>

          <div className="chart mt-6 rounded-2xl border border-white/10 bg-[#151515] p-5">
            <h3 className="mb-4 text-sm font-semibold">Task status chart</h3>
            <div className="flex h-40 items-end gap-2">
              {chartData.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-indigo-500/80" style={{ height: (v / chartMax) * 100 + '%' }} />
                  <span className="text-[10px] text-zinc-500">{chartLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#151515] p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-sm font-semibold">Task cards</h3>
              <div className="flex flex-wrap gap-2">
                {['all', 'todo', 'in progress', 'done'].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={'rounded-lg px-3 py-1.5 text-xs font-medium capitalize ' + (filter === f ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10')}>{f}</button>
                ))}
              </div>
            </div>

            <form onSubmit={addTask} className="mb-4 flex gap-2">
              <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a new task..." className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
              <button type="submit" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Add</button>
            </form>

            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr><th className="pb-2">Task</th><th className="pb-2 hidden sm:table-cell">Tag</th><th className="pb-2">Status</th><th className="pb-2 hidden sm:table-cell">Priority</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((t) => (
                  <tr key={t.id} className="group">
                    <td className="py-3">{t.title}</td>
                    <td className="py-3 hidden sm:table-cell text-zinc-500">{t.tag}</td>
                    <td className="py-3"><button onClick={() => toggleStatus(t.id)} className={'rounded-full px-2.5 py-1 text-[10px] font-medium ' + (t.status === 'done' ? 'bg-emerald-500/20 text-emerald-300' : t.status === 'in progress' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-zinc-300')}>{t.status}</button></td>
                    <td className="py-3 hidden sm:table-cell text-zinc-500 capitalize">{t.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="py-4 text-xs text-zinc-500">No tasks match this filter.</p>}
          </div>

          <footer className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-zinc-500">
            &copy; ${new Date().getFullYear()} {TITLE}. Built by AlphaTekX.
          </footer>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`
}
