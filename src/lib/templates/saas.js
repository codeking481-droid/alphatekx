// SaaS Dashboard - Full analytics platform
export const SAAS_CODE = `
const { useState, useMemo, useEffect } = React;

function BarChart({ data, labels, color }) {
  const max = Math.max(...data);
  return React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, padding: '0 4px' } },
    data.map((v, i) => React.createElement('div', { key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 } },
      React.createElement('div', { style: { width: '100%', maxWidth: 40, height: (v / max * 140) + '%', background: color || 'linear-gradient(180deg, #E56B2D, #C45A26)', borderRadius: '6px 6px 0 0', transition: 'height 0.5s ease', minHeight: 4, position: 'relative' } },
        React.createElement('span', { style: { position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: '#1e293b' } }, '$' + v + 'k')
      ),
      React.createElement('span', { style: { fontSize: 11, color: '#94a3b8' } }, labels[i])
    ))
  );
}

function App() {
  const [view, setView] = useState('dashboard');
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Redesign landing page', status: 'todo', assignee: 'Sarah', priority: 'high' },
    { id: 2, title: 'Fix payment bug #234', status: 'progress', assignee: 'Mike', priority: 'urgent' },
    { id: 3, title: 'Update API documentation', status: 'done', assignee: 'Emma', priority: 'medium' },
    { id: 4, title: 'Setup CI/CD pipeline', status: 'progress', assignee: 'James', priority: 'high' },
    { id: 5, title: 'User onboarding flow', status: 'todo', assignee: 'Lisa', priority: 'medium' },
    { id: 6, title: 'Q4 marketing plan', status: 'done', assignee: 'Tom', priority: 'low' },
    { id: 7, title: 'Database optimization', status: 'todo', assignee: 'Mike', priority: 'high' },
    { id: 8, title: 'Mobile app testing', status: 'progress', assignee: 'Emma', priority: 'urgent' },
  ]);
  const [newTask, setNewTask] = useState('');
  const [team] = useState([
    { name: 'Sarah Chen', role: 'Product Designer', dept: 'Design', avatar: 'SC', color: '#E56B2D', tasks: 3, online: true },
    { name: 'Mike Johnson', role: 'Senior Developer', dept: 'Engineering', avatar: 'MJ', color: '#C45A26', tasks: 5, online: true },
    { name: 'Emma Wilson', role: 'Frontend Dev', dept: 'Engineering', avatar: 'EW', color: '#E07A45', tasks: 4, online: false },
    { name: 'James Brown', role: 'DevOps Engineer', dept: 'Engineering', avatar: 'JB', color: '#f59e0b', tasks: 2, online: true },
    { name: 'Lisa Garcia', role: 'Product Manager', dept: 'Product', avatar: 'LG', color: '#ec4899', tasks: 6, online: true },
    { name: 'Tom Anderson', role: 'Marketing Lead', dept: 'Marketing', avatar: 'TA', color: '#10b981', tasks: 2, online: false },
  ]);
  const [transactions] = useState([
    { id: 'TRX-001', customer: 'Acme Corp', amount: 12400, date: 'Jan 15', status: 'completed' },
    { id: 'TRX-002', customer: 'TechFlow Inc', amount: 8900, date: 'Jan 15', status: 'completed' },
    { id: 'TRX-003', customer: 'GlobalSoft', amount: 23100, date: 'Jan 14', status: 'completed' },
    { id: 'TRX-004', customer: 'DataHub', amount: 5600, date: 'Jan 14', status: 'pending' },
    { id: 'TRX-005', customer: 'CloudNine', amount: 18900, date: 'Jan 13', status: 'completed' },
    { id: 'TRX-006', customer: 'ByteWorks', amount: 7200, date: 'Jan 13', status: 'failed' },
  ]);
  const [activity] = useState([
    { user: 'Sarah Chen', action: 'completed task "Redesign landing page"', time: '5 min ago', avatar: 'SC', color: '#E56B2D' },
    { user: 'Mike Johnson', action: 'commented on "Fix payment bug #234"', time: '12 min ago', avatar: 'MJ', color: '#C45A26' },
    { user: 'Emma Wilson', action: 'created task "Mobile app testing"', time: '1 hour ago', avatar: 'EW', color: '#E07A45' },
    { user: 'James Brown', action: 'deployed v2.4.1 to production', time: '2 hours ago', avatar: 'JB', color: '#f59e0b' },
    { user: 'Lisa Garcia', action: 'scheduled team meeting for Friday', time: '3 hours ago', avatar: 'LG', color: '#ec4899' },
  ]);

  const revenueData = [42, 55, 48, 67, 72, 89, 95, 108, 98, 115, 128, 142];
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const totalRevenue = revenueData.reduce((s, v) => s + v, 0);

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, { id: Date.now(), title: newTask, status: 'todo', assignee: 'You', priority: 'medium' }]);
    setNewTask('');
  };

  const moveTask = (id, dir) => {
    const order = ['todo', 'progress', 'done'];
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const idx = order.indexOf(t.status);
      const newIdx = Math.max(0, Math.min(2, idx + dir));
      return { ...t, status: order[newIdx] };
    }));
  };

  const columns = [
    { id: 'todo', label: 'To Do', color: '#94a3b8' },
    { id: 'progress', label: 'In Progress', color: '#E56B2D' },
    { id: 'done', label: 'Done', color: '#10b981' },
  ];

  const priorityColors = { urgent: { bg: '#fee2e2', color: '#991b1b' }, high: { bg: '#fef3c7', color: '#92400e' }, medium: { bg: '#dbeafe', color: '#1e40af' }, low: { bg: '#f1f5f9', color: '#475569' } };
  const statusColors = { completed: { bg: '#dcfce7', color: '#166534' }, pending: { bg: '#fef3c7', color: '#92400e' }, failed: { bg: '#fee2e2', color: '#991b1b' } };
  const cardStyle = { background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(24px)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' };
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'tasks', label: 'Tasks', icon: '✓' },
    { id: 'team', label: 'Team', icon: '👥' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const kpis = [
    { label: 'Total Revenue', value: '$' + totalRevenue + 'k', change: '+12.5%', up: true, icon: '💰', color: '#E56B2D' },
    { label: 'Active Users', value: '24,580', change: '+8.2%', up: true, icon: '👥', color: '#C45A26' },
    { label: 'Conversion Rate', value: '4.7%', change: '+0.3%', up: true, icon: '🎯', color: '#E07A45' },
    { label: 'Avg Order Value', value: '$284', change: '-2.1%', up: false, icon: '📦', color: '#f59e0b' },
  ];

  return React.createElement('div', { style: { minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f5f3ff 100%)', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex' } },
    // SIDEBAR
    React.createElement('div', { style: { width: 240, height: '100vh', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(241,245,249,0.8)', display: 'flex', flexDirection: 'column', flexShrink: 0 } },
      React.createElement('div', { style: { padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement('div', { style: { width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, React.createElement('span', { style: { color: 'white', fontWeight: 800, fontSize: 16 } }, 'N')),
        React.createElement('span', { style: { fontSize: 18, fontWeight: 800, color: '#1e293b' } }, 'Nexus')
      ),
      React.createElement('div', { style: { padding: '8px 12px', flex: 1 } },
        navItems.map(n => React.createElement('button', { key: n.id, onClick: () => setView(n.id), style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: view === n.id ? 600 : 400, background: view === n.id ? '#E56B2D' : 'transparent', color: view === n.id ? 'white' : '#475569', marginBottom: 4, transition: 'all 0.15s' } }, React.createElement('span', null, n.icon), n.label))
      ),
      React.createElement('div', { style: { padding: 16 } },
        React.createElement('div', { style: { background: 'linear-gradient(135deg, #E56B2D, #C45A26)', borderRadius: 16, padding: 16, color: 'white' } },
          React.createElement('p', { style: { fontSize: 13, fontWeight: 700, margin: '0 0 4px' } }, '⚡ Upgrade to Pro'),
          React.createElement('p', { style: { fontSize: 11, opacity: 0.8, margin: '0 0 10px' } }, 'Unlock advanced analytics'),
          React.createElement('button', { style: { width: '100%', padding: '8px', borderRadius: 10, border: 'none', background: 'white', color: '#E56B2D', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, 'Upgrade')
        )
      )
    ),

    React.createElement('div', { style: { flex: 1, padding: '24px 32px', overflowY: 'auto', maxHeight: '100vh' } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } },
        React.createElement('div', null,
          React.createElement('h1', { style: { fontSize: 28, fontWeight: 800, color: '#1e293b', margin: 0 } }, navItems.find(n => n.id === view).label),
          React.createElement('p', { style: { fontSize: 14, color: '#94a3b8', margin: '4px 0 0' } }, 'Welcome back, here is what is happening today')
        ),
        React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(241,245,249,0.8)' } },
            React.createElement('div', { style: { width: 8, height: 8, borderRadius: '50%', background: '#10b981' } }),
            React.createElement('span', { style: { fontSize: 13, color: '#475569' } }, 'All systems operational')
          ),
          React.createElement('button', { style: { padding: '10px 20px', borderRadius: 999, border: 'none', background: '#E56B2D', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, '+ New Report')
        )
      ),

      // DASHBOARD
      view === 'dashboard' && React.createElement('div', null,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 } },
          kpis.map(k => React.createElement('div', { key: k.label, style: { ...cardStyle, padding: 24 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 } },
              React.createElement('div', { style: { width: 44, height: 44, borderRadius: 14, background: k.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 } }, k.icon),
              React.createElement('span', { style: { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: k.up ? '#dcfce7' : '#fee2e2', color: k.up ? '#166534' : '#991b1b' } }, k.up ? '↑' : '↓', ' ', k.change)
            ),
            React.createElement('p', { style: { fontSize: 12, color: '#94a3b8', margin: 0, fontWeight: 500 } }, k.label),
            React.createElement('p', { style: { fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '4px 0 0' } }, k.value)
          ))
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 } },
          // Revenue Chart
          React.createElement('div', { style: { ...cardStyle, padding: 24 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
              React.createElement('div', null, React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 } }, 'Revenue Overview'), React.createElement('p', { style: { fontSize: 13, color: '#94a3b8', margin: '4px 0 0' } }, 'Monthly revenue for 2024')),
              React.createElement('div', { style: { textAlign: 'right' } }, React.createElement('p', { style: { fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 } }, '$' + totalRevenue + 'k'), React.createElement('p', { style: { fontSize: 12, color: '#10b981', margin: 0, fontWeight: 600 } }, '↑ 12.5% vs last year'))
            ),
            React.createElement(BarChart, { data: revenueData, labels: monthLabels })
          ),
          // Activity Feed
          React.createElement('div', { style: { ...cardStyle, padding: 24 } },
            React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 20 } }, 'Recent Activity'),
            activity.map((a, i) => React.createElement('div', { key: i, style: { display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < activity.length - 1 ? '1px solid #f1f5f9' : 'none' } },
              React.createElement('div', { style: { width: 36, height: 36, borderRadius: 12, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0 } }, a.avatar),
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('p', { style: { fontSize: 13, color: '#1e293b', margin: 0 } }, React.createElement('span', { style: { fontWeight: 600 } }, a.user), ' ' + a.action),
                React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: '2px 0 0' } }, a.time)
              )
            ))
          )
        ),
        // Transactions
        React.createElement('div', { style: { ...cardStyle, overflow: 'hidden' } },
          React.createElement('div', { style: { padding: '20px 24px', borderBottom: '1px solid #f1f5f9' } },
            React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 } }, 'Recent Transactions')
          ),
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null, React.createElement('tr', { style: { borderBottom: '1px solid #f1f5f9' } }, ['Transaction ID', 'Customer', 'Amount', 'Date', 'Status'].map(h => React.createElement('th', { key: h, style: { padding: '12px 24px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' } }, h)))),
            React.createElement('tbody', null, transactions.map(t => React.createElement('tr', { key: t.id, style: { borderBottom: '1px solid #f8fafc' } },
              React.createElement('td', { style: { padding: '14px 24px', fontSize: 13, fontWeight: 600, color: '#E56B2D' } }, t.id),
              React.createElement('td', { style: { padding: '14px 24px', fontSize: 13, fontWeight: 600, color: '#1e293b' } }, t.customer),
              React.createElement('td', { style: { padding: '14px 24px', fontSize: 13, fontWeight: 700, color: '#1e293b' } }, '$' + t.amount.toLocaleString()),
              React.createElement('td', { style: { padding: '14px 24px', fontSize: 13, color: '#94a3b8' } }, t.date),
              React.createElement('td', { style: { padding: '14px 24px' } }, React.createElement('span', { style: { padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: (statusColors[t.status]||{}).bg, color: (statusColors[t.status]||{}).color } }, t.status))
            )))
          )
        )
      ),

      // ANALYTICS
      view === 'analytics' && React.createElement('div', null,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 } },
          [{ l: 'Page Views', v: '1.2M', c: '+15%', icon: '👁️' }, { l: 'Bounce Rate', v: '32%', c: '-5%', icon: '📊' }, { l: 'Avg Session', v: '4m 32s', c: '+8%', icon: '⏱️' }].map(k => React.createElement('div', { key: k.l, style: { ...cardStyle, padding: 24 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', null, React.createElement('p', { style: { fontSize: 12, color: '#94a3b8', margin: 0, fontWeight: 500 } }, k.l), React.createElement('p', { style: { fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '4px 0 0' } }, k.v), React.createElement('p', { style: { fontSize: 12, color: '#10b981', margin: '4px 0 0', fontWeight: 600 } }, k.c + ' vs last month')),
              React.createElement('span', { style: { fontSize: 28 } }, k.icon)
            )
          ))
        ),
        React.createElement('div', { style: { ...cardStyle, padding: 24, marginBottom: 24 } },
          React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 20 } }, 'Monthly Revenue'),
          React.createElement(BarChart, { data: revenueData, labels: monthLabels })
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          React.createElement('div', { style: { ...cardStyle, padding: 24 } },
            React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 16 } }, 'Traffic Sources'),
            [{ s: 'Organic Search', v: 45, c: '#E56B2D' }, { s: 'Direct', v: 25, c: '#C45A26' }, { s: 'Social Media', v: 18, c: '#E07A45' }, { s: 'Referral', v: 12, c: '#f59e0b' }].map(t => React.createElement('div', { key: t.s, style: { marginBottom: 14 } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 } }, React.createElement('span', { style: { fontSize: 13, color: '#475569' } }, t.s), React.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: '#1e293b' } }, t.v + '%')),
              React.createElement('div', { style: { height: 8, borderRadius: 4, background: '#f1f5f9' } }, React.createElement('div', { style: { height: '100%', borderRadius: 4, background: t.c, width: t.v + '%' } }))
            ))
          ),
          React.createElement('div', { style: { ...cardStyle, padding: 24 } },
            React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 16 } }, 'Top Pages'),
            [{ p: '/dashboard', v: '342k views' }, { p: '/pricing', v: '128k views' }, { p: '/features', v: '98k views' }, { p: '/blog', v: '76k views' }, { p: '/about', v: '45k views' }].map((p, i) => React.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: '#E56B2D' } }, p.p),
              React.createElement('span', { style: { fontSize: 13, color: '#94a3b8' } }, p.v)
            ))
          )
        )
      ),

      // TASKS (Kanban)
      view === 'tasks' && React.createElement('div', null,
        React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 20 } },
          React.createElement('input', { value: newTask, onChange: e => setNewTask(e.target.value), onKeyDown: e => { if (e.key === 'Enter') addTask(); }, placeholder: 'Add a new task...', style: { flex: 1, maxWidth: 400, padding: '12px 20px', borderRadius: 14, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.7)', fontSize: 14, outline: 'none' } }),
          React.createElement('button', { onClick: addTask, style: { padding: '12px 24px', borderRadius: 14, border: 'none', background: '#E56B2D', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, '+ Add')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
          columns.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id);
            return React.createElement('div', { key: col.id, style: { ...cardStyle, padding: 20, minHeight: 400 } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 } },
                React.createElement('div', { style: { width: 10, height: 10, borderRadius: '50%', background: col.color } }),
                React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 } }, col.label),
                React.createElement('span', { style: { padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#94a3b8' } }, colTasks.length)
              ),
              colTasks.map(t => React.createElement('div', { key: t.id, style: { background: 'white', borderRadius: 14, padding: 16, marginBottom: 10, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' } },
                React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: '#1e293b', margin: '0 0 8px' } }, t.title),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  React.createElement('span', { style: { padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: (priorityColors[t.priority]||{}).bg, color: (priorityColors[t.priority]||{}).color } }, t.priority),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('div', { style: { width: 24, height: 24, borderRadius: 8, background: '#E56B2D', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700 } }, t.assignee.charAt(0))
                  )
                ),
                React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 10 } },
                  col.id !== 'todo' && React.createElement('button', { onClick: () => moveTask(t.id, -1), style: { flex: 1, padding: '5px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 11, color: '#475569' } }, '← Back'),
                  col.id !== 'done' && React.createElement('button', { onClick: () => moveTask(t.id, 1), style: { flex: 1, padding: '5px', borderRadius: 8, border: 'none', background: '#E56B2D', cursor: 'pointer', fontSize: 11, color: 'white', fontWeight: 600 } }, 'Forward →')
                )
              ))
            );
          })
        )
      ),

      // TEAM
      view === 'team' && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 } },
        team.map(m => React.createElement('div', { key: m.name, style: { ...cardStyle, padding: 24 } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 } },
            React.createElement('div', { style: { width: 56, height: 56, borderRadius: 16, background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18 } }, m.avatar),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              React.createElement('div', { style: { width: 8, height: 8, borderRadius: '50%', background: m.online ? '#10b981' : '#94a3b8' } }),
              React.createElement('span', { style: { fontSize: 11, color: m.online ? '#10b981' : '#94a3b8', fontWeight: 600 } }, m.online ? 'Online' : 'Offline')
            )
          ),
          React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 } }, m.name),
          React.createElement('p', { style: { fontSize: 13, color: '#94a3b8', margin: '2px 0 16px' } }, m.role),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #f1f5f9' } },
            React.createElement('div', null, React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0 } }, 'Department'), React.createElement('p', { style: { fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '2px 0 0' } }, m.dept)),
            React.createElement('div', { style: { textAlign: 'right' } }, React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0 } }, 'Active Tasks'), React.createElement('p', { style: { fontSize: 13, fontWeight: 600, color: '#E56B2D', margin: '2px 0 0' } }, m.tasks))
          )
        ))
      ),

      // SETTINGS
      view === 'settings' && React.createElement('div', { style: { maxWidth: 600 } },
        React.createElement('div', { style: { ...cardStyle, padding: 32, marginBottom: 16 } },
          React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 24 } }, 'Profile Settings'),
          React.createElement('div', { style: { display: 'flex', gap: 24, marginBottom: 24 } },
            React.createElement('div', { style: { width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 28 } }, 'DR'),
            React.createElement('div', { style: { flex: 1, display: 'grid', gap: 16 } },
              React.createElement('div', null, React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, 'Full Name'), React.createElement('input', { defaultValue: 'Dr. Admin', style: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } })),
              React.createElement('div', null, React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, 'Email'), React.createElement('input', { defaultValue: 'admin@nexus.io', style: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } }))
            )
          ),
          React.createElement('button', { style: { padding: '12px 32px', borderRadius: 12, border: 'none', background: '#E56B2D', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, 'Save Changes')
        ),
        React.createElement('div', { style: { ...cardStyle, padding: 32 } },
          React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 24 } }, 'Preferences'),
          [{ l: 'Email Notifications', d: 'Receive email about activity' }, { l: 'Push Notifications', d: 'Receive push notifications' }, { l: 'Weekly Reports', d: 'Get weekly summary reports' }, { l: 'Dark Mode', d: 'Enable dark theme' }].map((s, i) => React.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' } },
            React.createElement('div', null, React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: '#1e293b', margin: 0 } }, s.l), React.createElement('p', { style: { fontSize: 12, color: '#94a3b8', margin: '2px 0 0' } }, s.d)),
            React.createElement('div', { onClick: e => { e.currentTarget.style.background = e.currentTarget.style.background === 'rgb(59, 130, 246)' ? '#e2e8f0' : '#E56B2D'; }, style: { width: 44, height: 24, borderRadius: 999, background: i < 2 ? '#E56B2D' : '#e2e8f0', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' } },
              React.createElement('div', { style: { position: 'absolute', top: 2, left: i < 2 ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' } })
            )
          ))
        )
      )
    )
  );
}
ReactDOM.render(React.createElement(App), document.getElementById('root'));
`;