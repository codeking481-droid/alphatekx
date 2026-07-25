import { buildPlatformFiles } from './server/alphaPlatformBuilder.mjs'
import { SaaSLandingTemplate, TaskDashboardTemplate } from './server/alphaFallbackTemplates.mjs'

function getTitle(idea) {
  const words = String(idea).trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Alpha App'
}

function extractIdea(prompt) {
  const clean = String(prompt).trim()
  const match = clean.match(/User wants:\s*([^.]+)/i)
  if (match) return match[1].trim()
  const firstSentence = clean.match(/^[^.!?]{0,120}[.!?]?/)
  return firstSentence ? firstSentence[0].trim() : clean
}

const IFRAME_TEMPLATE = (path) => `const { useState } = React;

function AlphaApp() {
  const [ready, setReady] = useState(true);
  const title = __TITLE__;
  return (
    <div className="h-screen w-full overflow-hidden bg-[#0A0A0A] text-zinc-100" onClick={() => setReady(true)}>
      <iframe
        src={'${path}?t=' + encodeURIComponent(title)}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={title || 'Alpha app'}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`;

const LEARNING_TEMPLATE = IFRAME_TEMPLATE('/templates/alpha-learn.html');
const PORTFOLIO_TEMPLATE = IFRAME_TEMPLATE('/templates/alpha-portfolio.html');
const ECommerceTemplate = (title, idea) => `const { useState } = React;

const PRODUCTS = [
  { id: 'p1', name: 'Chrome Runner Sneakers', category: 'Shoes', price: 42000, stock: 5, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400' },
  { id: 'p2', name: 'Liquid Glass Hoodie', category: 'Fashion', price: 28000, stock: 8, image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400' },
  { id: 'p3', name: 'Orange Studio Backpack', category: 'Bags', price: 35000, stock: 4, image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400' },
  { id: 'p4', name: 'Founder Desk Lamp', category: 'Office', price: 18500, stock: 6, image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400' },
  { id: 'p5', name: 'Minimal Mechanical Keyboard', category: 'Tech', price: 52000, stock: 3, image: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=400' },
  { id: 'p6', name: 'Noise Cancelling Headphones', category: 'Audio', price: 31000, stock: 7, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400' },
];

function AlphaApp() {
  const [products] = useState(PRODUCTS);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showCart, setShowCart] = useState(false);
  const [checkout, setCheckout] = useState({ name: '', phone: '', address: '' });
  const [order, setOrder] = useState(null);

  const categories = ['All', ...new Set(products.map((p) => p.category))];
  const filtered = products.filter((p) => {
    const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase()) || p.category.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (category === 'All' || p.category === category);
  });

  const addToCart = (id) => {
    const product = products.find((p) => p.id === id);
    if (!product || product.stock < 1) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === id);
      if (existing) return prev.map((c) => c.id === id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
    setShowCart(true);
  };

  const updateQty = (id, delta) => {
    setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c).filter((c) => c.qty > 0));
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  const placeOrder = (e) => {
    e.preventDefault();
    if (!checkout.name || !checkout.phone || !checkout.address || cart.length === 0) return;
    setOrder({ id: Date.now().toString(36), items: cart, total, customer: checkout, at: new Date().toLocaleString() });
    setCart([]);
    setCheckout({ name: '', phone: '', address: '' });
    setShowCart(false);
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#0A0A0A] text-zinc-100">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0A0A]/80 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a href="#" className="text-lg font-bold tracking-tight">${title}</a>
          <div className="flex items-center gap-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products..." className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 sm:block" />
            <button onClick={() => setShowCart(true)} className="relative rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium">
              Cart
              {cart.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px]">{cart.reduce((a, c) => a + c.qty, 0)}</span>}
            </button>
          </div>
        </div>
      </nav>

      <header className="hero relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-indigo-950/40 to-[#0A0A0A] px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">${title}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">${idea}</p>
          <a href="#shop" className="mt-6 inline-block rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white">Shop now</a>
        </div>
      </header>

      <main id="shop" className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={'rounded-full border border-white/10 px-4 py-2 text-xs font-medium ' + (category === c ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{c}</button>
          ))}
        </div>
        {filtered.length === 0 && <p className="text-zinc-500">No products found.</p>}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#151515]">
              <div className="h-48 bg-cover bg-center" style={{ backgroundImage: 'url(' + product.image + ')' }} />
              <div className="p-5">
                <p className="text-xs text-indigo-400">{product.category}</p>
                <h3 className="mt-1 text-lg font-semibold">{product.name}</h3>
                <p className="mt-2 text-sm text-zinc-500">Stock: {product.stock}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-lg font-bold">NGN {product.price.toLocaleString()}</span>
                  <button onClick={() => addToCart(product.id)} disabled={product.stock === 0} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold disabled:opacity-40">Add to cart</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {showCart && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setShowCart(false)}>
          <aside className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0A0A0A] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your cart</h2>
              <button onClick={() => setShowCart(false)} className="text-zinc-400 hover:text-white">Close</button>
            </div>
            {cart.length === 0 && <p className="mt-4 text-zinc-500">Cart is empty.</p>}
            <div className="mt-4 space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#151515] p-3">
                  <div className="h-12 w-12 rounded-lg bg-cover" style={{ backgroundImage: 'url(' + item.image + ')' }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-zinc-500">NGN {item.price.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                    <button onClick={() => updateQty(item.id, -1)} className="px-2 text-zinc-400">-</button>
                    <span className="text-sm">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="px-2 text-zinc-400">+</button>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>NGN {total.toLocaleString()}</span>
                </div>
                <form onSubmit={placeOrder} className="space-y-3">
                  <input required value={checkout.name} onChange={(e) => setCheckout({ ...checkout, name: e.target.value })} placeholder="Full name" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
                  <input required value={checkout.phone} onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })} placeholder="Phone" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
                  <input required value={checkout.address} onChange={(e) => setCheckout({ ...checkout, address: e.target.value })} placeholder="Delivery address" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
                  <button type="submit" className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold">Place order</button>
                </form>
              </div>
            )}
            {order && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">Order {order.id} placed. Total NGN {order.total.toLocaleString()}</div>}
          </aside>
        </div>
      )}

      <footer className="border-t border-white/10 bg-[#0A0A0A] px-4 py-10">
        <div className="mx-auto max-w-7xl text-center text-sm text-zinc-500">
          <p>&copy; ${new Date().getFullYear()} ${title}. Built with AlphaTekX.</p>
          <div className="mt-4 flex justify-center gap-4">
            <a href="#" className="hover:text-white">Home</a>
            <a href="#shop" className="hover:text-white">Shop</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`;
const PLATFORM_TEMPLATE = IFRAME_TEMPLATE('/templates/alpha-platform.html');

const CALCULATOR_TEMPLATE = `const { useState } = React;

function AlphaApp() {
  const [display, setDisplay] = useState('0');
  const [history, setHistory] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const title = __TITLE__;

  const handlePress = (value) => {
    if (value === 'C') { setDisplay('0'); return; }
    if (value === 'DEL') { setDisplay((p) => p.length > 1 ? p.slice(0, -1) : '0'); return; }
    if (value === '=') {
      try {
        const result = String(new Function('return ' + display)());
        setHistory((h) => [{ expr: display, result }, ...h].slice(0, 20));
        setDisplay(result);
      } catch (e) { setDisplay('Error'); }
      return;
    }
    setDisplay((p) => p === '0' && value !== '.' ? value : p + value);
  };

  const buttons = ['C','DEL','/','*','7','8','9','-','4','5','6','+','1','2','3','=','0','.','%',''];

  return (
    <div className="h-screen w-full overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setMenuOpen(!menuOpen)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span className="text-sm font-semibold">{title || 'Alpha Calculator'}</span>
        </div>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMenuOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-64 border-r border-white/10 bg-zinc-900 p-4 pt-16" onClick={e => e.stopPropagation()}>
            <nav className="space-y-1">
              {['Calculator','History','About'].map((l) => (
                <button key={l} onClick={() => setMenuOpen(false)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/10">{l}</button>
              ))}
            </nav>
          </div>
        </div>
      )}
      <main className="flex flex-1 flex-col overflow-y-auto pt-16">
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 rounded-xl bg-black/40 p-4 text-right text-3xl font-mono break-all min-h-[3.5rem]">{display}</div>
            <div className="grid grid-cols-4 gap-2">
              {buttons.map((b, i) => (
                <button
                  key={i}
                  disabled={b === ''}
                  onClick={() => b && handlePress(b)}
                  className={'h-12 rounded-xl text-base font-semibold transition-all active:scale-95 ' + (b === '=' ? 'col-span-1 bg-emerald-500 text-black hover:bg-emerald-400' : b === 'C' ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : b === '' ? 'invisible' : 'bg-white/10 hover:bg-white/20 text-zinc-100')}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
        {history.length > 0 && (
          <div className="border-t border-white/10 bg-zinc-900/50 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">History</h3>
            <div className="flex gap-2 overflow-x-auto">
              {history.map((h, i) => (
                <button key={i} onClick={() => setDisplay(h.expr)} className="whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
                  {h.expr} = {h.result}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`;

const CODE_TEMPLATE = `const { useState, useEffect, useMemo } = React;
const IDEA = __IDEA__;
const TITLE = __TITLE__;
const lower = IDEA.toLowerCase();
let category = 'generic';
if (/\\b(learn|course|study|physics|math|biology|chemistr(y|ies)|subject|school|academy|education|student|lesson|tutor|teach)\\b/i.test(lower)) category = 'learning';
else if (/\\b(dogs?|pets?|cats?|bookings?|sitters?|walks?)\\b/i.test(lower)) category = 'pet';
else if (/\\b(foods?|deliver(y|ies)?|orders?|restaurants?|meals?|kitchens?)\\b/i.test(lower)) category = 'food';
else if (/\\b(finances?|money|budgets?|cryptos?|mrr|revenue|invest(ing|s|ors?)?|stocks?)\\b/i.test(lower)) category = 'finance';
else if (/\\b(pos|stores?|shops?|retails?|inventory|provision|supermarket|mart|grocer(y|ies))\\b/i.test(lower)) category = 'retail';

const hasEmail = /\\b(email|mail|contact|message|send|notification|newsletter|subscribe|form)\\b/i.test(lower);

let config = {
  generic: { label: 'Workspace', item: 'Project', itemPlural: 'Projects', record: 'Task', recordPlural: 'Tasks', customer: 'Client', customerPlural: 'Clients', accent: 'orange', items: ['AlphaTekX Builder', 'Marketing Site', 'Mobile App', 'Dashboard V2'], records: [['Design the dashboard', false], ['Connect API', true], ['Write documentation', false], ['Launch beta', false]], customers: ['Alpha Client', 'Beta Partner', 'Gamma User', 'Delta Team'] },
  learning: { label: 'Learning', item: 'Course', itemPlural: 'Courses', record: 'Lesson', recordPlural: 'Lessons', customer: 'Student', customerPlural: 'Students', accent: 'orange', items: ['Physics Fundamentals', 'Mechanics', 'Electricity', 'Quantum Basics'], records: [['Intro to Physics', false], ['Forces & Motion', true], ['Energy & Work', false], ['Waves & Sound', true]], customers: ['Daniel T.', 'Ada O.', 'John K.', 'Sarah M.'] },
  pet: { label: 'Pet Care', item: 'Pet', itemPlural: 'Pets', record: 'Booking', recordPlural: 'Bookings', customer: 'Owner', customerPlural: 'Owners', accent: 'orange', items: ['Bella (Dog)', 'Max (Cat)', 'Charlie (Dog)', 'Luna (Rabbit)'], records: [['Weekend sitting - Bella', false], ['Dog walk - Max', true], ['Grooming - Charlie', false], ['Vet check - Luna', true]], customers: ['Ada O.', 'John K.', 'Sarah M.', 'Mike T.'] },
  food: { label: 'Food & Orders', item: 'Menu Item', itemPlural: 'Menu Items', record: 'Order', recordPlural: 'Orders', customer: 'Customer', customerPlural: 'Customers', accent: 'orange', items: ['Jollof Rice', 'Grilled Chicken', 'Pepper Soup', 'Fried Rice'], records: [['Table 3 - Jollof Rice', true], ['Delivery 12 - Grilled Chicken', false], ['Pickup - Pepper Soup', true], ['Dine-in - Fried Rice', false]], customers: ['Chidera A.', 'Emeka B.', 'Ngozi C.', 'Tunde D.'] },
  finance: { label: 'Finance', item: 'Account', itemPlural: 'Accounts', record: 'Transaction', recordPlural: 'Transactions', customer: 'Contact', customerPlural: 'Contacts', accent: 'orange', items: ['Savings', 'Operations', 'Investment', 'Payroll'], records: [['Client payment - $500', true], ['Server cost - $120', true], ['Investment return - $85', true], ['Office rent - $400', false]], customers: ['Acme Corp', 'Beta Ltd', 'Gamma Inc', 'Delta LLC'] },
  retail: { label: 'Retail / POS', item: 'Product', itemPlural: 'Products', record: 'Sale', recordPlural: 'Sales', customer: 'Customer', customerPlural: 'Customers', accent: 'orange', items: ['Rice 50kg', 'Vegetable Oil 5L', 'Milk Carton', 'Biscuits Pack'], records: [['Rice sale - ₦25,000', true], ['Oil sale - ₦8,500', true], ['Biscuits sale - ₦1,200', false], ['Milk sale - ₦3,400', true]], customers: ['Chidi O.', 'Nkechi A.', 'Emeka M.', 'Amina K.'] }
}[category];
config.accent = 'indigo';

const accentColors = { indigo: 'bg-indigo-500' };
const accentText = { indigo: 'text-indigo-400' };

const STORAGE = 'alpha_big_app_' + Math.abs(TITLE.split('').reduce((a, c) => a + c.charCodeAt(0), 0));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function formatDate(d) { return new Date(Date.now() - d * 86400000).toLocaleDateString(); }

function getInitialData() {
  return {
    items: config.items.map((n, i) => ({ id: uid(), name: n, status: 'active' })),
    records: config.records.map(([n, done], i) => ({ id: uid(), name: n, done: done, date: formatDate(i * 2), amount: Math.floor(Math.random() * 800) + 50 })),
    customers: config.customers.map((n, i) => ({ id: uid(), name: n, email: n.toLowerCase().replace(/\\s+/g, '.') + '@example.com', phone: '+234 80' + (10000000 + i * 123) }))
  };
}

function AlphaApp() {
  const [state, setState] = useState(() => { try { const s = localStorage.getItem(STORAGE); return s ? JSON.parse(s) : getInitialData(); } catch (e) { return getInitialData(); } });
  const [tab, setTab] = useState('dashboard');
  const accent = config.accent || 'orange';
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [gmail, setGmail] = useState({ connected: false, email: '' });
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', message: '' });
  const [emailStatus, setEmailStatus] = useState({ sending: false, sent: false, error: '' });

  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (e) {} }, [state]);
  useEffect(() => {
    const headers = { 'Content-Type': 'application/json' };
    try { const raw = localStorage.getItem('alphatekx:local-user'); if (raw) { const u = JSON.parse(raw); headers['x-local-user-id'] = u.id; headers['x-local-user-email'] = u.email; } } catch {}
    fetch('/api/integrations/status', { headers }).then(r => r.ok ? r.json() : null).then(d => setGmail(d?.gmail || { connected: false, email: '' })).catch(() => {});
  }, []);

  const setData = (fn) => setState((s) => Object.assign({}, s, fn(s)));
  const addRecord = (name) => { if (!name.trim()) return; setData((s) => ({ records: s.records.concat({ id: uid(), name: name.trim(), done: false, date: new Date().toLocaleDateString(), amount: Math.floor(Math.random() * 500) + 50 }) })); };
  const toggleRecord = (id) => { setData((s) => ({ records: s.records.map((r) => r.id === id ? Object.assign({}, r, { done: !r.done }) : r) })); };
  const deleteRecord = (id) => { setData((s) => ({ records: s.records.filter((r) => r.id !== id) })); };
  const addItem = (name) => { if (!name.trim()) return; setData((s) => ({ items: s.items.concat({ id: uid(), name: name.trim(), status: 'active' }) })); };
  const deleteItem = (id) => { setData((s) => ({ items: s.items.filter((i) => i.id !== id) })); };
  const addCustomer = (c) => { if (!c.name.trim()) return; setData((s) => ({ customers: s.customers.concat({ id: uid(), name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim() }) })); };
  const deleteCustomer = (id) => { setData((s) => ({ customers: s.customers.filter((c) => c.id !== id) })); };

  const sendEmail = async (e) => {
    e.preventDefault();
    if (!gmail.connected) { setEmailStatus({ sending: false, sent: false, error: 'Connect Gmail in AlphaTekX Connectors to enable email sending.' }); return; }
    setEmailStatus({ sending: true, sent: false, error: '' });
    try {
      const headers = { 'Content-Type': 'application/json' };
      try { const raw = localStorage.getItem('alphatekx:local-user'); if (raw) { const u = JSON.parse(raw); headers['x-local-user-id'] = u.id; headers['x-local-user-email'] = u.email; } } catch {}
      const body = JSON.stringify({ to: emailForm.to, subject: emailForm.subject, text: emailForm.message, html: emailForm.message.replace(/\\n/g, '<br>') });
      const res = await fetch('/api/gmail/send', { method: 'POST', headers, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send email.');
      setEmailStatus({ sending: false, sent: true, error: '' });
      setEmailForm({ to: '', subject: '', message: '' });
    } catch (err) {
      setEmailStatus({ sending: false, sent: false, error: err.message || 'Email failed.' });
    }
  };

  const filteredRecords = state.records.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const total = state.records.length;
  const completed = state.records.filter((r) => r.done).length;
  const active = total - completed;
  const revenue = state.records.reduce((sum, r) => sum + (r.done ? (r.amount || 0) : 0), 0);

  const accentBg = accentColors[accent] || 'bg-indigo-500';
  const accentTextClass = accentText[accent] || 'text-indigo-400';

  const tabs = ['dashboard', 'records', 'items', 'customers', ...(hasEmail ? ['email'] : []), 'analytics', 'settings'];
  const tabLabel = (t) => t[0].toUpperCase() + t.slice(1);

  const statCard = (label, value) => (
    <div className="liquid-glass p-5">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );

  const initials = (name) => name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/80 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{TITLE || 'Alpha App'}</h1>
            <p className="text-xs text-zinc-500">Generated by AlphaTekX — {config.label}</p>
          </div>
          {hasEmail && <span className={'hidden text-xs md:inline-flex ' + (gmail.connected ? 'text-emerald-400' : 'text-amber-400')}>{gmail.connected ? 'Gmail connected: ' + gmail.email : 'Gmail not connected'}</span>}
          <span className="hidden text-xs text-zinc-500 md:inline">Built by AlphaTekX</span>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row gap-4 px-4 py-4 md:px-6 md:py-6">
        <aside className="hidden w-48 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={'rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors ' + (tab === t ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white')}>
              {tabLabel(t)}
            </button>
          ))}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto min-h-0">
          <div className="mb-4 flex gap-2 md:hidden">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={'rounded-lg px-3 py-1.5 text-xs font-medium ' + (tab === t ? 'bg-white/10 text-white' : 'bg-zinc-900 text-zinc-400')}>
                {tabLabel(t)}
              </button>
            ))}
          </div>

          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statCard('Total ' + config.recordPlural, total)}
                {statCard('Active ' + config.recordPlural, active)}
                {statCard('Completed', completed)}
                {statCard('Revenue / Value', '$' + revenue.toLocaleString())}
              </div>
              <div className="liquid-glass p-5">
                <h2 className="mb-4 text-sm font-semibold">Weekly activity</h2>
                <div className="flex h-48 items-end gap-2">
                  {[45, 70, 55, 90, 65, 85, 75].map((h, i) => (
                    <div key={i} className={'flex-1 rounded-t transition-all ' + accentBg} style={{ height: h + '%' }} />
                  ))}
                </div>
              </div>
              <div className="liquid-glass p-5">
                <h2 className="mb-3 text-sm font-semibold">Recent {config.recordPlural}</h2>
                <div className="space-y-2">
                  {state.records.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <span className={'text-sm ' + (r.done ? 'text-zinc-500 line-through' : 'text-zinc-200')}>{r.name}</span>
                      <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + (r.done ? 'bg-zinc-800 text-zinc-400' : 'bg-white/10 text-white')}>{r.done ? 'Done' : 'Active'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'records' && (
            <div className="space-y-4">
              <div className="liquid-glass p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={'Search ' + config.recordPlural.toLowerCase()} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 sm:w-72" />
                  <button onClick={() => setModal('record')} className={'rounded-lg px-4 py-2 text-sm font-medium text-white ' + accentBg}>Add {config.record}</button>
                </div>
              </div>
              <div className="liquid-glass p-4">
                {filteredRecords.length === 0 && <p className="text-sm text-zinc-500">No {config.recordPlural.toLowerCase()} found.</p>}
                <div className="space-y-2">
                  {filteredRecords.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
                      <button onClick={() => toggleRecord(r.id)} className={'h-5 w-5 rounded border ' + (r.done ? accentBg + ' border-transparent' : 'border-zinc-500 bg-transparent')} />
                      <div className="min-w-0 flex-1">
                        <div className={'truncate text-sm ' + (r.done ? 'text-zinc-500 line-through' : 'text-zinc-100')}>{r.name}</div>
                        <div className="text-xs text-zinc-500">{r.date} · {'$' + (r.amount || 0).toLocaleString()}</div>
                      </div>
                      <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + (r.done ? 'bg-zinc-800 text-zinc-400' : 'bg-white/10 text-white')}>{r.done ? 'Done' : 'Active'}</span>
                      <button onClick={() => deleteRecord(r.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'items' && (
            <div className="liquid-glass p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{config.itemPlural}</h2>
                <button onClick={() => setModal('item')} className={'rounded-lg px-3 py-1.5 text-xs font-medium text-white ' + accentBg}>Add {config.item}</button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {state.items.map((item) => (
                  <div key={item.id} className="rounded-xl bg-white/5 p-4">
                    <div className="flex items-start justify-between">
                      <div className={'flex h-10 w-10 items-center justify-center rounded-lg ' + accentBg}>
                        <span className="text-lg font-semibold text-white">{item.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <button onClick={() => deleteItem(item.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                    <h3 className="mt-3 text-sm font-medium">{item.name}</h3>
                    <span className={'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] ' + (item.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-400')}>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'customers' && (
            <div className="liquid-glass p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{config.customerPlural}</h2>
                <button onClick={() => setModal('customer')} className={'rounded-lg px-3 py-1.5 text-xs font-medium text-white ' + accentBg}>Add {config.customer}</button>
              </div>
              <div className="space-y-2">
                {state.customers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <div className={'flex h-10 w-10 items-center justify-center rounded-full ' + accentBg}>
                        <span className="text-xs font-semibold text-white">{initials(c.name)}</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-xs text-zinc-500">{c.email}</div>
                      </div>
                    </div>
                    <button onClick={() => deleteCustomer(c.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'email' && (
            <div className="liquid-glass p-5">
              <h2 className="text-sm font-semibold">Send email</h2>
              {!gmail.connected && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Gmail is not connected. Connect Gmail in AlphaTekX Connectors to send real emails.</p>}
              {gmail.connected && <p className="mt-3 text-sm text-emerald-400">Sending from {gmail.email}</p>}
              <form onSubmit={sendEmail} className="mt-4 space-y-3">
                <input type="email" required value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" placeholder="Recipient email" />
                <input required value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" placeholder="Subject" />
                <textarea required value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" rows={5} placeholder="Message" />
                <button type="submit" disabled={emailStatus.sending || !gmail.connected} className={'rounded-lg px-4 py-2 text-sm font-medium text-white ' + accentBg}>{emailStatus.sending ? 'Sending...' : 'Send email'}</button>
              </form>
              {emailStatus.sent && <p className="mt-3 text-sm text-emerald-400">Email sent.</p>}
              {emailStatus.error && <p className="mt-3 text-sm text-red-400">{emailStatus.error}</p>}
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statCard('Completion rate', (total ? Math.round((completed / total) * 100) : 0) + '%')}
                {statCard('Active rate', (total ? Math.round((active / total) * 100) : 0) + '%')}
                {statCard('Total ' + config.recordPlural, total)}
                {statCard('Total ' + config.customerPlural, state.customers.length)}
              </div>
              <div className="liquid-glass p-5">
                <h2 className="mb-4 text-sm font-semibold">Breakdown</h2>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-zinc-400"><span>Completed</span><span>{total ? Math.round((completed / total) * 100) : 0}%</span></div>
                    <div className="h-2 w-full rounded-full bg-white/10"><div className={'h-2 rounded-full ' + accentBg} style={{ width: (total ? (completed / total) * 100 : 0) + '%' }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-zinc-400"><span>Active</span><span>{total ? Math.round((active / total) * 100) : 0}%</span></div>
                    <div className="h-2 w-full rounded-full bg-white/10"><div className={'h-2 rounded-full bg-zinc-500'} style={{ width: (total ? (active / total) * 100 : 0) + '%' }} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="liquid-glass p-5">
              <h2 className="mb-4 text-sm font-semibold">Settings</h2>
              <div className="space-y-4">
                <button onClick={() => setState(getInitialData())} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-400">Reset demo data</button>
                <p className="text-xs text-zinc-500">Data is saved to this browser's localStorage.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModal(null)}>
          <div className="liquid-glass w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{'Add ' + (modal === 'record' ? config.record : modal === 'item' ? config.item : config.customer)}</h3>
            <div className="mt-4 space-y-3">
              {modal !== 'customer' && <input id="alpha-name" placeholder={'Name'} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />}
              {modal === 'customer' && (
                <div className="space-y-3">
                  <input id="alpha-name" placeholder="Name" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
                  <input id="alpha-email" placeholder="Email" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
                  <input id="alpha-phone" placeholder="Phone" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-zinc-500" />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">Cancel</button>
              <button onClick={() => {
                const name = document.getElementById('alpha-name').value;
                if (modal === 'record') addRecord(name);
                else if (modal === 'item') addItem(name);
                else { const email = document.getElementById('alpha-email').value; const phone = document.getElementById('alpha-phone').value; addCustomer({ name, email, phone }); }
                document.getElementById('alpha-name').value = '';
                const emailEl = document.getElementById('alpha-email'); if (emailEl) emailEl.value = '';
                const phoneEl = document.getElementById('alpha-phone'); if (phoneEl) phoneEl.value = '';
                setModal(null);
              }} className={'rounded-lg px-4 py-2 text-sm font-medium text-white ' + accentBg}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AlphaApp />);`;

export function fallbackAlphaBuilder(prompt) {
  const idea = extractIdea(prompt)
  const title = getTitle(idea)
  const lower = idea.toLowerCase()
  const render = (template) => template.replace(/__IDEA__/g, JSON.stringify(idea)).replace(/__TITLE__/g, JSON.stringify(title))

  if (/\bcalculator\b/i.test(idea)) return render(CALCULATOR_TEMPLATE)
  if (/\b(learn|learning|course|study|physics|math|biology|chemistr(y|ies)|subject|school|academy|education|student|lesson|tutor|teach|grade|grading)\b/i.test(lower)) return render(LEARNING_TEMPLATE)
  if (/\b(portfolio|cv|resume|showcase|designer|developer)\b/i.test(lower)) return render(PORTFOLIO_TEMPLATE)
  if (/\b(shop|store|ecommerce|e-commerce|product|cart|checkout|sell|buy|market)\b/i.test(lower)) return ECommerceTemplate(title, idea)

  if (/\b(saas\s+(landing|site|page|website)|landing\s+(page|site|website)|marketing\s+(site|page)|saas\b.*\b(landing|page|site))|\blanding\b.*\bpage\b/i.test(lower)) return SaaSLandingTemplate(title, idea)
  if (/\b(task\s+(management|dashboard|tracker|app)|dashboard.*task|task.*dashboard|kanban.*task)\b/i.test(lower)) return TaskDashboardTemplate(title, idea)

  if (/\b(os|operating system|platform|saas|enterprise|business|notion|linear|slack|salesforce|crm|erp|workspace|neuralos)\b/i.test(lower)) return buildPlatformFiles(prompt)
  return CODE_TEMPLATE
    .replace(/__IDEA__/g, JSON.stringify(idea))
    .replace(/__TITLE__/g, JSON.stringify(title))
}
