// Deterministic, multi-file AlphaUI-based operating-system/app builder for large platform prompts.
// No imports/exports in generated code; files are concatenated by combineFiles().

const DEFAULT_MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'projects', label: 'Projects', icon: '▣' },
  { id: 'crm', label: 'CRM', icon: '♟' },
  { id: 'analytics', label: 'Analytics', icon: '◧' },
  { id: 'chat', label: 'Team Chat', icon: '✉' },
  { id: 'calendar', label: 'Calendar', icon: '◴' },
  { id: 'email', label: 'Email', icon: '✉' },
  { id: 'files', label: 'Files', icon: '❏' },
  { id: 'automations', label: 'Automations', icon: '↻' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const KEYWORDS = [
  'os', 'operating system', 'platform', 'saas', 'enterprise', 'business', 'notion',
  'linear', 'slack', 'salesforce', 'crm', 'erp', 'workspace', 'neuralos', 'all-in-one',
  'dashboard suite', 'business suite', 'business operating system',
]

function normalizeHeading(heading) {
  return heading
    .replace(/^#+\s*/, '')
    .replace(/\b(core|advanced|ultimate|complete|full|professional|modern|simple|the)\b/gi, '')
    .replace(/[\(\):]/g, '')
    .trim()
}

function mapHeadingToModuleId(heading) {
  const h = heading.toLowerCase()
  if (/\b(dashboard|overview|home|summary|kpis|metrics)\b/.test(h)) return 'dashboard'
  if (/\b(project|task|kanban|todo|board|sprint|milestone|gantt|roadmap)\b/.test(h)) return 'projects'
  if (/\b(crm|lead|contact|opportunit|sales|pipeline|customer|company)\b/.test(h)) return 'crm'
  if (/\b(analytic|chart|graph|report|metric|funnel|cohort|retention|revenue)\b/.test(h)) return 'analytics'
  if (/\b(chat|message|channel|dm|direct|conversation|slack|communication|thread)\b/.test(h)) return 'chat'
  if (/\b(calendar|schedule|event|booking|meeting|availability|appoint)\b/.test(h)) return 'calendar'
  if (/\b(email|inbox|draft|template|compose|mail)\b/.test(h)) return 'email'
  if (/\b(file|storage|document|folder|upload|drive|cloud)\b/.test(h)) return 'files'
  if (/\b(automation|workflow|trigger|action|zapier|make|integration|webhook)\b/.test(h)) return 'automations'
  if (/\b(setting|preference|profile|account|workspace|billing|api key|security)\b/.test(h)) return 'settings'
  if (/\b(user|team|member|role|permission|department|attendance|performance|audit)\b/.test(h)) return 'settings'
  if (/\b(notification|alert|push|sms|digest)\b/.test(h)) return 'settings'
  if (/\b(billing|invoice|subscription|payment|wallet|credit|coupon|refund|plan)\b/.test(h)) return 'settings'
  return null
}

function extractTitle(prompt) {
  const clean = String(prompt).trim().replace(/^([\s#-]+)/, '')
  const quoted = clean.match(/^(?:Build\s+)?["']([^"']+)["']/) || clean.match(/^["']([^"']+)["']/)
  if (quoted) return quoted[1].trim()
  const beforeDash = clean.match(/^(?:Build\s+)?(.+?)\s*[—–-]/i)
  if (beforeDash) return beforeDash[1].trim().replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '').trim()
  const words = clean.split(/\n/)[0].trim().replace(/^([\s#-]+)/, '').replace(/\b(Build|Create|Make)\s+/i, '').split(/\s+/).slice(0, 4).join(' ')
  return words.replace(/["'“”‘’]/g, '').slice(0, 60).trim() || 'AlphaOS'
}

export function extractPlan(prompt) {
  const headingRe = /^##\s*(.+)$/gm
  const headings = []
  let match
  while ((match = headingRe.exec(prompt)) !== null) {
    headings.push(match[1].trim())
  }
  const mapped = headings
    .map(normalizeHeading)
    .map(mapHeadingToModuleId)
    .filter(Boolean)
  const moduleIds = [...new Set(mapped)]
  const modules = DEFAULT_MODULES.filter((m) => moduleIds.includes(m.id))
  return {
    title: extractTitle(prompt),
    modules: modules.length ? modules : DEFAULT_MODULES,
  }
}

export function isPlatformPrompt(prompt) {
  const lower = String(prompt).toLowerCase()
  return KEYWORDS.some((k) => lower.includes(k))
}

function getStoreFile() {
  return `const OS_DATA_KEY = 'alpha_os_data_v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString();
}

function badgeColor(status) {
  const s = String(status || '').toLowerCase();
  if (/\b(done|closed|won|active|paid|approved|green|success)\b/.test(s)) return 'emerald';
  if (/\b(progress|review|qualified|proposal|pending|amber|warning|in progress)\b/.test(s)) return 'amber';
  if (/\b(todo|new|open|lead|unread|blue|info)\b/.test(s)) return 'indigo';
  return 'zinc';
}

function initialData() {
  return {
    stats: { mrr: 42800, users: 4820, newUsers: 312, churn: 2.4, aiUsage: 8400, storage: 64, apiRequests: 1240000, automations: 48, projects: 14 },
    projects: [
      { id: 1, title: 'AI CRM v2', status: 'In Progress', priority: 'High', owner: 'Daniel' },
      { id: 2, title: 'Mobile App', status: 'Done', priority: 'Medium', owner: 'Sarah' },
      { id: 3, title: 'API Gateway', status: 'Review', priority: 'High', owner: 'Mike' },
      { id: 4, title: 'Onboarding Flow', status: 'Todo', priority: 'Low', owner: 'Ada' },
      { id: 5, title: 'Billing 2.0', status: 'In Progress', priority: 'High', owner: 'John' }
    ],
    tasks: [
      { id: 1, title: 'Design dashboard', col: 'todo', project: 'AI CRM v2' },
      { id: 2, title: 'Connect OpenAI', col: 'inprogress', project: 'AI CRM v2' },
      { id: 3, title: 'Write tests', col: 'review', project: 'API Gateway' },
      { id: 4, title: 'Deploy beta', col: 'done', project: 'Mobile App' },
      { id: 5, title: 'User interviews', col: 'inprogress', project: 'Onboarding Flow' }
    ],
    leads: [
      { id: 1, name: 'Acme Corp', stage: 'new', value: 45000, contact: 'jane@acme.com' },
      { id: 2, name: 'Beta Ltd', stage: 'qualified', value: 12000, contact: 'tom@beta.com' },
      { id: 3, name: 'Gamma Inc', stage: 'proposal', value: 78000, contact: 'lisa@gamma.com' },
      { id: 4, name: 'Delta LLC', stage: 'closed', value: 95000, contact: 'mark@delta.com' }
    ],
    messages: [
      { channel: 'General', user: 'Daniel', text: 'New deployment is live.', time: '2m ago' },
      { channel: 'Engineering', user: 'Sarah', text: 'Fixed the auth bug.', time: '5m ago' },
      { channel: 'Marketing', user: 'Ada', text: 'Campaign assets ready.', time: '12m ago' }
    ],
    events: [
      { id: 1, title: 'Sprint planning', day: 3, time: '10:00' },
      { id: 2, title: 'Investor call', day: 7, time: '14:00' },
      { id: 3, title: 'Design review', day: 12, time: '11:00' },
      { id: 4, title: 'Release party', day: 18, time: '17:00' }
    ],
    emails: [
      { id: 1, from: 'Jane Doe', subject: 'Welcome to NeuralOS', preview: 'Thanks for signing up...', read: false },
      { id: 2, from: 'Stripe', subject: 'Payment received', preview: 'Your invoice was paid.', read: true },
      { id: 3, from: 'GitHub', subject: 'Security alert', preview: 'New sign-in detected.', read: false }
    ],
    files: [
      { id: 1, name: 'Brand.pdf', size: '2.4 MB', type: 'pdf' },
      { id: 2, name: 'Roadmap.png', size: '1.1 MB', type: 'image' },
      { id: 3, name: 'Spec.docx', size: '840 KB', type: 'doc' },
      { id: 4, name: 'Dashboard.fig', size: '4.2 MB', type: 'figma' }
    ],
    automations: [
      { id: 1, name: 'Lead-to-CRM', active: true, runs: 1240 },
      { id: 2, name: 'Slack alerts', active: true, runs: 5820 },
      { id: 3, name: 'Email digest', active: false, runs: 320 },
      { id: 4, name: 'Invoice reminder', active: true, runs: 210 }
    ],
    revenue: [12000,15000,14000,19000,22000,26000,31000,29000,35000,38000,41000,42800],
    activity: [
      { text: 'New user signed up', time: '2m ago' },
      { text: 'Invoice #1024 paid', time: '12m ago' },
      { text: 'Automation workflow triggered', time: '25m ago' },
      { text: 'API key rotated', time: '1h ago' },
      { text: 'New lead created', time: '2h ago' }
    ]
  };
}

function loadData() {
  try {
    const s = localStorage.getItem(OS_DATA_KEY);
    return s ? JSON.parse(s) : initialData();
  } catch (e) {
    return initialData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(OS_DATA_KEY, JSON.stringify(data));
  } catch (e) {}
}`
}

function getDashboardPage() {
  return `function Dashboard({ data, setData, search }) {
  const trend = [40, 55, 48, 60, 65, 72, 68, 75, 82, 88, 92, 95];
  const activity = data.activity.slice(0, 6);
  const projects = data.projects.slice(0, 5).filter((p) => !search || (p.title + p.owner).toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AlphaUI.StatCard label="MRR" value={formatMoney(data.stats.mrr)} change={12} trend={trend} />
        <AlphaUI.StatCard label="Active Users" value={data.stats.users.toLocaleString()} change={8} trend={trend} />
        <AlphaUI.StatCard label="Churn Rate" value={data.stats.churn + '%'} change={-0.3} trend={trend} />
        <AlphaUI.StatCard label="API Requests" value={(data.stats.apiRequests / 1000000).toFixed(1) + 'M'} change={18} trend={trend} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AlphaUI.Card title="Revenue" subtitle="Monthly recurring revenue">
          <AlphaUI.Chart type="bar" data={data.revenue} labels={['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']} height={160} />
        </AlphaUI.Card>
        <AlphaUI.Card title="Recent Activity">
          <div className="space-y-3">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-sm text-zinc-300">{a.text}</span>
                <span className="text-xs text-zinc-500">{a.time}</span>
              </div>
            ))}
          </div>
        </AlphaUI.Card>
      </div>
      <AlphaUI.Card title="Active Projects">
        <AlphaUI.Table
          columns={[
            { key: 'title', title: 'Name' },
            { key: 'status', title: 'Status', render: (row) => <AlphaUI.Badge color={badgeColor(row.status)}>{row.status}</AlphaUI.Badge> },
            { key: 'owner', title: 'Owner' }
          ]}
          rows={projects}
          keyExtractor={(row) => row.id}
        />
      </AlphaUI.Card>
    </div>
  );
}`
}

function getProjectsPage() {
  return `function Projects({ data, setData, search }) {
  const columns = [
    { id: 'todo', title: 'To Do' },
    { id: 'inprogress', title: 'In Progress' },
    { id: 'review', title: 'Review' },
    { id: 'done', title: 'Done' }
  ];
  const q = search.toLowerCase();
  const cards = data.tasks
    .filter((t) => !q || (t.title + t.project).toLowerCase().includes(q))
    .map((t) => ({ id: t.id, title: t.title, column: t.col, meta: t.project }));
  const onMove = (cardId, colId) => {
    const next = { ...data, tasks: data.tasks.map((t) => t.id === Number(cardId) ? { ...t, col: colId } : t) };
    setData(next);
  };
  const onAdd = (colId) => {
    const title = prompt('Task title');
    if (!title) return;
    const next = { ...data, tasks: [...data.tasks, { id: Date.now(), title, col: colId, project: 'General' }] };
    setData(next);
  };
  return (
    <AlphaUI.Card title="Kanban Board">
      <AlphaUI.Kanban columns={columns} cards={cards} onMove={onMove} onAdd={onAdd} />
    </AlphaUI.Card>
  );
}`
}

function getCRMPage() {
  return `function CRM({ data, setData, search }) {
  const [showAdd, setShowAdd] = React.useState(false);
  const [name, setName] = React.useState('');
  const [contact, setContact] = React.useState('');
  const q = search.toLowerCase();
  const leads = data.leads.filter((l) => (l.name + l.contact).toLowerCase().includes(q));
  const addLead = () => {
    if (!name) return;
    const next = { ...data, leads: [...data.leads, { id: Date.now(), name, stage: 'new', value: Math.floor(Math.random() * 80000) + 5000, contact: contact || 'unknown@example.com' }] };
    setData(next);
    setShowAdd(false);
    setName('');
    setContact('');
  };
  const deleteLead = (id) => {
    const next = { ...data, leads: data.leads.filter((l) => l.id !== id) };
    setData(next);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AlphaUI.Button onClick={() => setShowAdd(true)}>+ Add Lead</AlphaUI.Button>
      </div>
      <AlphaUI.Card>
        <AlphaUI.Table
          columns={[
            { key: 'name', title: 'Company' },
            { key: 'stage', title: 'Stage', render: (row) => <AlphaUI.Badge color={badgeColor(row.stage)}>{row.stage}</AlphaUI.Badge> },
            { key: 'value', title: 'Value', render: (row) => formatMoney(row.value) },
            { key: 'contact', title: 'Contact' },
            { key: 'actions', title: '', render: (row) => <AlphaUI.Button variant="secondary" onClick={() => deleteLead(row.id)}>Delete</AlphaUI.Button> }
          ]}
          rows={leads}
          keyExtractor={(row) => row.id}
        />
      </AlphaUI.Card>
      <AlphaUI.Modal open={showAdd} title="Add Lead" onClose={() => setShowAdd(false)}>
        <div className="space-y-3">
          <AlphaUI.Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" />
          <AlphaUI.Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact email" />
          <AlphaUI.Button onClick={addLead}>Save</AlphaUI.Button>
        </div>
      </AlphaUI.Modal>
    </div>
  );
}`
}

function getAnalyticsPage() {
  return `function Analytics({ data }) {
  const funnel = [100, 68, 42, 28, 18];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AlphaUI.StatCard label="Conversion" value="3.8%" change={0.4} trend={[10,20,30,40,50]} />
        <AlphaUI.StatCard label="Retention" value="84%" change={2} trend={[70,72,76,80,84]} />
        <AlphaUI.StatCard label="LTV" value="$2,400" change={5} trend={[20,35,50,65,80]} />
        <AlphaUI.StatCard label="CAC" value="$142" change={-8} trend={[80,70,60,55,42]} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AlphaUI.Card title="Revenue Growth">
          <AlphaUI.Chart type="bar" data={data.revenue} labels={['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']} height={180} />
        </AlphaUI.Card>
        <AlphaUI.Card title="Conversion Funnel">
          <AlphaUI.Chart type="bar" data={funnel} labels={['Visit','Sign up','Active','Paid','Retain']} height={180} />
        </AlphaUI.Card>
      </div>
    </div>
  );
}`
}

function getChatPage() {
  return `function Chat({ data, setData, search }) {
  const channels = ['General', 'Engineering', 'Marketing', 'Sales'];
  const [channel, setChannel] = React.useState(channels[0]);
  const [text, setText] = React.useState('');
  const q = search.toLowerCase();
  const msgs = data.messages.filter((m) => m.channel === channel && (!q || (m.user + m.text).toLowerCase().includes(q)));
  const send = () => {
    if (!text.trim()) return;
    const next = { ...data, messages: [...data.messages, { channel, user: 'You', text, time: 'now' }] };
    setData(next);
    setText('');
  };
  const tabs = channels.map((c) => ({ id: c, label: '#' + c }));
  return (
    <div className="flex h-full flex-col gap-4">
      <AlphaUI.Tabs tabs={tabs} active={channel} onChange={setChannel} />
      <AlphaUI.Card className="flex-1">
        <div className="space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className="rounded-xl bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <AlphaUI.Avatar name={m.user} size={24} />
                <span className="text-sm font-semibold text-zinc-200">{m.user}</span>
                <span className="text-xs text-zinc-500">{m.time}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-300">{m.text}</p>
            </div>
          ))}
        </div>
      </AlphaUI.Card>
      <div className="flex gap-2">
        <AlphaUI.Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Message..." className="flex-1" />
        <AlphaUI.Button onClick={send}>Send</AlphaUI.Button>
      </div>
    </div>
  );
}`
}

function getCalendarPage() {
  return `function Calendar({ data, setData, search }) {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const q = search.toLowerCase();
  const addEvent = (day) => {
    const title = prompt('Event title');
    if (!title) return;
    const time = prompt('Time') || '12:00';
    const next = { ...data, events: [...data.events, { id: Date.now(), title, day, time }] };
    setData(next);
  };
  return (
    <div className="space-y-4">
      <AlphaUI.Card title="July 2026">
        <div className="grid grid-cols-7 gap-2">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} className="text-center text-xs font-medium text-zinc-500">{d}</div>)}
          {days.map((d) => (
            <div key={d} onClick={() => addEvent(d)} className="min-h-[80px] cursor-pointer rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
              <div className="text-sm font-semibold text-zinc-300">{d}</div>
              {data.events
                .filter((e) => e.day === d && (!q || e.title.toLowerCase().includes(q)))
                .map((e) => <div key={e.id} className="mt-1 truncate rounded bg-indigo-500/20 px-1 py-0.5 text-[10px] text-indigo-200">{e.title} · {e.time}</div>)}
            </div>
          ))}
        </div>
      </AlphaUI.Card>
    </div>
  );
}`
}

function getEmailPage() {
  return `function Email({ data, setData, search }) {
  const [showCompose, setShowCompose] = React.useState(false);
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const q = search.toLowerCase();
  const emails = data.emails.filter((e) => (e.from + e.subject + e.preview).toLowerCase().includes(q));
  const toggleRead = (id) => {
    const next = { ...data, emails: data.emails.map((e) => e.id === id ? { ...e, read: !e.read } : e) };
    setData(next);
  };
  const compose = () => {
    if (!subject) return;
    const next = { ...data, emails: [{ id: Date.now(), from: 'You', subject, preview: 'Sent to ' + to, read: true }, ...data.emails] };
    setData(next);
    setShowCompose(false);
    setTo('');
    setSubject('');
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AlphaUI.Button onClick={() => setShowCompose(true)}>Compose</AlphaUI.Button>
      </div>
      <AlphaUI.Card>
        <AlphaUI.Table
          columns={[
            { key: 'read', title: '', render: (row) => <button onClick={() => toggleRead(row.id)} className="text-zinc-400 hover:text-zinc-200">{row.read ? '●' : '○'}</button> },
            { key: 'from', title: 'From' },
            { key: 'subject', title: 'Subject' },
            { key: 'preview', title: 'Preview' }
          ]}
          rows={emails}
          keyExtractor={(row) => row.id}
        />
      </AlphaUI.Card>
      <AlphaUI.Modal open={showCompose} title="Compose Email" onClose={() => setShowCompose(false)}>
        <div className="space-y-3">
          <AlphaUI.Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
          <AlphaUI.Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <AlphaUI.Button onClick={compose}>Send</AlphaUI.Button>
        </div>
      </AlphaUI.Modal>
    </div>
  );
}`
}

function getFilesPage() {
  return `function Files({ data, search }) {
  const q = search.toLowerCase();
  const files = data.files.filter((f) => f.name.toLowerCase().includes(q));
  return (
    <AlphaUI.Card title="Files">
      <AlphaUI.Table
        columns={[
          { key: 'name', title: 'Name' },
          { key: 'type', title: 'Type', render: (row) => <AlphaUI.Badge color="zinc">{row.type}</AlphaUI.Badge> },
          { key: 'size', title: 'Size' }
        ]}
        rows={files}
        keyExtractor={(row) => row.id}
      />
    </AlphaUI.Card>
  );
}`
}

function getAutomationsPage() {
  return `function Automations({ data, setData }) {
  const toggle = (id) => {
    const next = { ...data, automations: data.automations.map((a) => a.id === id ? { ...a, active: !a.active } : a) };
    setData(next);
  };
  return (
    <AlphaUI.Card title="Automations">
      <AlphaUI.Table
        columns={[
          { key: 'name', title: 'Name' },
          { key: 'active', title: 'Status', render: (row) => <AlphaUI.Badge color={row.active ? 'emerald' : 'amber'}>{row.active ? 'Active' : 'Paused'}</AlphaUI.Badge> },
          { key: 'runs', title: 'Runs' },
          { key: 'actions', title: '', render: (row) => <AlphaUI.Button variant="secondary" onClick={() => toggle(row.id)}>{row.active ? 'Pause' : 'Activate'}</AlphaUI.Button> }
        ]}
        rows={data.automations}
        keyExtractor={(row) => row.id}
      />
    </AlphaUI.Card>
  );
}`
}

function getSettingsPage() {
  return `function Settings({ data, setData }) {
  const [name, setName] = React.useState('AlphaOS');
  const [theme, setTheme] = React.useState('Dark');
  const reset = () => {
    if (confirm('Reset all demo data?')) setData(initialData());
  };
  return (
    <AlphaUI.Card title="Settings">
      <div className="max-w-md space-y-4">
        <div>
          <label className="text-xs text-zinc-500">Workspace name</label>
          <AlphaUI.Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Theme</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none">
            <option>Dark</option>
            <option>Light</option>
            <option>System</option>
          </select>
        </div>
        <AlphaUI.Button onClick={reset}>Reset demo data</AlphaUI.Button>
      </div>
    </AlphaUI.Card>
  );
}`
}

function getAppFile(title, modules) {
  const moduleList = JSON.stringify(modules)
  const viewsObject = `{
    dashboard: Dashboard,
    projects: Projects,
    crm: CRM,
    analytics: Analytics,
    chat: Chat,
    calendar: Calendar,
    email: Email,
    files: Files,
    automations: Automations,
    settings: Settings
  }`
  return `function AlphaApp() {
  const [data, setData] = React.useState(loadData());
  const [view, setView] = React.useState('dashboard');
  const [search, setSearch] = React.useState('');

  const update = (next) => {
    saveData(next);
    setData(next);
  };

  const modules = ${moduleList};
  const views = ${viewsObject};
  const Page = views[view] || Dashboard;
  const current = modules.find((m) => m.id === view) || modules[0];

  React.useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '');
      if (views[h]) setView(h);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="h-screen w-full bg-zinc-950 text-zinc-100 flex overflow-hidden">
      <AlphaUI.Sidebar title="${title}" items={modules} current={view} onChange={setView} footer={<div className="text-xs text-zinc-500">AlphaTekX OS</div>} />
      <div className="flex flex-1 flex-col min-w-0">
        <AlphaUI.Topbar title={current.label} subtitle="Workspace">
          <AlphaUI.Search value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search anything..." />
          <AlphaUI.Avatar name="Daniel" size={32} />
        </AlphaUI.Topbar>
        <main className="flex-1 overflow-y-auto p-6">
          <Page data={data} setData={update} search={search} />
        </main>
      </div>
    </div>
  );
}`
}

function getSupabaseMigration() {
  return `CREATE TABLE IF NOT EXISTS app_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_slug text NOT NULL,
  entity text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid,
  owner_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_entities_app_entity ON app_entities(app_slug, entity);`
}

export function buildPlatformFiles(prompt) {
  const plan = extractPlan(prompt)
  const title = plan.title.replace(/"/g, '\\"')
  const modules = plan.modules

  const files = {
    'src/data/store.js': getStoreFile(),
    'src/pages/Dashboard.jsx': getDashboardPage(),
    'src/pages/Projects.jsx': getProjectsPage(),
    'src/pages/CRM.jsx': getCRMPage(),
    'src/pages/Analytics.jsx': getAnalyticsPage(),
    'src/pages/Chat.jsx': getChatPage(),
    'src/pages/Calendar.jsx': getCalendarPage(),
    'src/pages/Email.jsx': getEmailPage(),
    'src/pages/Files.jsx': getFilesPage(),
    'src/pages/Automations.jsx': getAutomationsPage(),
    'src/pages/Settings.jsx': getSettingsPage(),
    'src/App.jsx': getAppFile(title, modules),
    'supabase/migrations/001_app_entities.sql': getSupabaseMigration(),
  }

  return JSON.stringify({
    title: plan.title,
    description: 'AI business operating system built by AlphaTekX',
    dependencies: [],
    files,
  })
}
