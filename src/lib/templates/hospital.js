// Hospital OS - Full hospital management system
export const HOSPITAL_CODE = `
const { useState, useEffect, useMemo } = React;

function App() {
  const [patients, setPatients] = useState([
    { id: 1, name: 'Sarah Johnson', age: 34, gender: 'F', condition: 'Routine Checkup', status: 'Waiting', department: 'General', doctor: 'Dr. Smith', admitted: '2024-01-15', bed: 'A-12', vitals: { bp: '120/80', temp: '98.6°F', hr: 72, spo2: 98 }, history: [{ date: 'Jan 15', note: 'Routine checkup, all normal' }, { date: 'Dec 20', note: 'Annual physical completed' }] },
    { id: 2, name: 'Michael Chen', age: 45, gender: 'M', condition: 'Post-Surgery Recovery', status: 'In Treatment', department: 'Surgery', doctor: 'Dr. Patel', admitted: '2024-01-12', bed: 'S-04', vitals: { bp: '130/85', temp: '99.1°F', hr: 78, spo2: 96 }, history: [{ date: 'Jan 12', note: 'Appendectomy performed, recovery on track' }, { date: 'Jan 13', note: 'Pain management adjusted' }] },
    { id: 3, name: 'Emily Davis', age: 28, gender: 'F', condition: 'Fracture - Left Arm', status: 'In Treatment', department: 'Orthopedics', doctor: 'Dr. Wilson', admitted: '2024-01-14', bed: 'O-08', vitals: { bp: '118/75', temp: '98.4°F', hr: 68, spo2: 99 }, history: [{ date: 'Jan 14', note: 'Cast applied, follow-up in 2 weeks' }] },
    { id: 4, name: 'Robert Kim', age: 62, gender: 'M', condition: 'Cardiac Monitoring', status: 'Critical', department: 'Cardiology', doctor: 'Dr. Martinez', admitted: '2024-01-10', bed: 'C-01', vitals: { bp: '145/92', temp: '99.8°F', hr: 95, spo2: 93 }, history: [{ date: 'Jan 10', note: 'Admitted for chest pain, monitoring' }, { date: 'Jan 11', note: 'Medication adjusted, stable but critical' }] },
    { id: 5, name: 'Lisa Thompson', age: 41, gender: 'F', condition: 'Pneumonia', status: 'In Treatment', department: 'Pulmonology', doctor: 'Dr. Brown', admitted: '2024-01-13', bed: 'P-03', vitals: { bp: '125/82', temp: '100.2°F', hr: 85, spo2: 91 }, history: [{ date: 'Jan 13', note: 'Antibiotics started, oxygen support' }] },
    { id: 6, name: 'James Wilson', age: 55, gender: 'M', condition: 'Diabetes Management', status: 'Discharged', department: 'Endocrinology', doctor: 'Dr. Lee', admitted: '2024-01-08', bed: '—', vitals: { bp: '135/88', temp: '98.6°F', hr: 74, spo2: 98 }, history: [{ date: 'Jan 08', note: 'Insulin regimen adjusted' }, { date: 'Jan 09', note: 'Patient education completed, discharged' }] },
    { id: 7, name: 'Amanda Garcia', age: 29, gender: 'F', condition: 'Pregnancy - 3rd Trimester', status: 'Waiting', department: 'Obstetrics', doctor: 'Dr. Taylor', admitted: '2024-01-15', bed: 'OB-05', vitals: { bp: '115/72', temp: '98.8°F', hr: 80, spo2: 99 }, history: [{ date: 'Jan 15', note: 'Routine prenatal check, fetus healthy' }] },
    { id: 8, name: 'David Brown', age: 71, gender: 'M', condition: 'Hip Replacement Recovery', status: 'In Treatment', department: 'Orthopedics', doctor: 'Dr. Wilson', admitted: '2024-01-11', bed: 'O-12', vitals: { bp: '140/90', temp: '98.9°F', hr: 70, spo2: 95 }, history: [{ date: 'Jan 11', note: 'Hip replacement surgery successful' }, { date: 'Jan 13', note: 'Physical therapy started' }] },
  ]);
  const [staff] = useState([
    { name: 'Dr. Smith', role: 'General Medicine', dept: 'General', patients: 1, status: 'On Duty' },
    { name: 'Dr. Patel', role: 'Surgeon', dept: 'Surgery', patients: 1, status: 'In Surgery' },
    { name: 'Dr. Wilson', role: 'Orthopedic Surgeon', dept: 'Orthopedics', patients: 2, status: 'On Duty' },
    { name: 'Dr. Martinez', role: 'Cardiologist', dept: 'Cardiology', patients: 1, status: 'On Call' },
    { name: 'Dr. Brown', role: 'Pulmonologist', dept: 'Pulmonology', patients: 1, status: 'On Duty' },
    { name: 'Dr. Lee', role: 'Endocrinologist', dept: 'Endocrinology', patients: 0, status: 'Off Duty' },
    { name: 'Dr. Taylor', role: 'Obstetrician', dept: 'Obstetrics', patients: 1, status: 'On Duty' },
  ]);
  const [appointments] = useState([
    { id: 1, patient: 'Sarah Johnson', doctor: 'Dr. Smith', time: '09:00', dept: 'General', status: 'Checked In' },
    { id: 2, patient: 'Frank Miller', doctor: 'Dr. Smith', time: '10:30', dept: 'General', status: 'Scheduled' },
    { id: 3, patient: 'Amanda Garcia', doctor: 'Dr. Taylor', time: '11:00', dept: 'Obstetrics', status: 'Waiting' },
    { id: 4, patient: 'Tom Anderson', doctor: 'Dr. Wilson', time: '13:00', dept: 'Orthopedics', status: 'Scheduled' },
    { id: 5, patient: 'Jennifer Lee', doctor: 'Dr. Martinez', time: '14:30', dept: 'Cardiology', status: 'Scheduled' },
  ]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [view, setView] = useState('dashboard');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPatient, setNewPatient] = useState({ name: '', age: '', condition: '', department: 'General', doctor: 'Dr. Smith' });

  const statuses = ['All', 'Waiting', 'In Treatment', 'Critical', 'Discharged'];
  const departments = ['All', ...new Set(patients.map(p => p.department))];

  const filteredPatients = useMemo(() =>
    patients.filter(p => {
      const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.condition.toLowerCase().includes(search.toLowerCase()) || p.doctor.toLowerCase().includes(search.toLowerCase());
      const mst = statusFilter === 'All' || p.status === statusFilter;
      const md = deptFilter === 'All' || p.department === deptFilter;
      return ms && mst && md;
    }), [patients, search, statusFilter, deptFilter]
  );

  const updateStatus = (id, ns) => {
    setPatients(prev => prev.map(p => p.id === id ? { ...p, status: ns } : p));
    if (selectedPatient && selectedPatient.id === id) setSelectedPatient(prev => ({ ...prev, status: ns }));
  };

  const addPatient = () => {
    if (!newPatient.name || !newPatient.condition) return;
    const p = { ...newPatient, id: Date.now(), age: parseInt(newPatient.age) || 0, gender: 'U', status: 'Waiting', admitted: new Date().toISOString().split('T')[0], bed: 'TBD', vitals: { bp: '120/80', temp: '98.6°F', hr: 72, spo2: 98 }, history: [{ date: 'Today', note: 'Patient admitted' }] };
    setPatients(prev => [...prev, p]);
    setNewPatient({ name: '', age: '', condition: '', department: 'General', doctor: 'Dr. Smith' });
    setShowAddModal(false);
  };

  const stats = { total: patients.length, waiting: patients.filter(p => p.status === 'Waiting').length, treating: patients.filter(p => p.status === 'In Treatment').length, critical: patients.filter(p => p.status === 'Critical').length, discharged: patients.filter(p => p.status === 'Discharged').length };
  const statusColors = { 'Waiting': { bg: '#fef3c7', color: '#92400e' }, 'In Treatment': { bg: '#dbeafe', color: '#1e40af' }, 'Critical': { bg: '#fee2e2', color: '#991b1b' }, 'Discharged': { bg: '#dcfce7', color: '#166534' }, 'Checked In': { bg: '#dbeafe', color: '#1e40af' }, 'Scheduled': { bg: '#f1f5f9', color: '#475569' }, 'On Duty': { bg: '#dcfce7', color: '#166534' }, 'In Surgery': { bg: '#fee2e2', color: '#991b1b' }, 'On Call': { bg: '#fef3c7', color: '#92400e' }, 'Off Duty': { bg: '#f1f5f9', color: '#94a3b8' } };

  const cardStyle = { background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(24px)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' };
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'patients', label: 'Patients', icon: '👥' },
    { id: 'appointments', label: 'Appointments', icon: '📅' },
    { id: 'staff', label: 'Staff', icon: '🩺' },
  ];

  return React.createElement('div', { style: { minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f5f3ff 100%)', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex' } },
    // Sidebar
    React.createElement('div', { style: { width: 240, height: '100vh', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(241,245,249,0.8)', display: 'flex', flexDirection: 'column', flexShrink: 0 } },
      React.createElement('div', { style: { padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement('span', { style: { fontSize: 28 } }, '🏥'),
        React.createElement('span', { style: { fontSize: 20, fontWeight: 800, color: '#1e293b' } }, 'Hospital OS')
      ),
      React.createElement('div', { style: { padding: '8px 12px', flex: 1 } },
        navItems.map(n => React.createElement('button', { key: n.id, onClick: () => setView(n.id), style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: view === n.id ? 600 : 400, background: view === n.id ? '#E56B2D' : 'transparent', color: view === n.id ? 'white' : '#475569', marginBottom: 4, transition: 'all 0.15s' } }, React.createElement('span', null, n.icon), n.label))
      ),
      React.createElement('div', { style: { padding: 16 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 14, background: 'rgba(241,245,249,0.7)' } },
          React.createElement('div', { style: { width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 } }, 'DR'),
          React.createElement('div', null, React.createElement('p', { style: { fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 } }, 'Dr. Admin'), React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0 } }, 'Administrator'))
        )
      )
    ),
    React.createElement('div', { style: { flex: 1, padding: '24px 32px', overflowY: 'auto', maxHeight: '100vh' } },
      // Top bar
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } },
        React.createElement('div', null,
          React.createElement('h1', { style: { fontSize: 28, fontWeight: 800, color: '#1e293b', margin: 0 } }, navItems.find(n => n.id === view).label),
          React.createElement('p', { style: { fontSize: 14, color: '#94a3b8', margin: '4px 0 0' } }, new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
        ),
        React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
          React.createElement('input', { value: search, onChange: e => { setSearch(e.target.value); setView('patients'); }, placeholder: 'Search patients...', style: { padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.7)', width: 280, fontSize: 14, outline: 'none' } }),
          view === 'patients' && React.createElement('button', { onClick: () => setShowAddModal(true), style: { padding: '10px 24px', borderRadius: 999, border: 'none', background: '#E56B2D', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, '+ Add Patient')
        )
      ),

      // DASHBOARD
      view === 'dashboard' && React.createElement('div', null,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 } },
          [{ l: 'Total', v: stats.total, i: '👥', c: '#E56B2D' }, { l: 'Waiting', v: stats.waiting, i: '⏳', c: '#f59e0b' }, { l: 'In Treatment', v: stats.treating, i: '💊', c: '#E07A45' }, { l: 'Critical', v: stats.critical, i: '🚨', c: '#ef4444' }, { l: 'Discharged', v: stats.discharged, i: '✅', c: '#10b981' }].map(s => React.createElement('div', { key: s.l, style: { ...cardStyle, padding: 20 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', null, React.createElement('p', { style: { fontSize: 12, color: '#94a3b8', margin: 0, fontWeight: 500 } }, s.l), React.createElement('p', { style: { fontSize: 32, fontWeight: 800, color: '#1e293b', margin: '4px 0 0' } }, s.v)),
              React.createElement('span', { style: { fontSize: 28 } }, s.i)
            )
          ))
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 } },
          // Recent patients
          React.createElement('div', { style: { ...cardStyle, padding: 24 } },
            React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16 } }, 'Recent Patients'),
            React.createElement('div', null, patients.slice(0, 5).map(p => React.createElement('div', { key: p.id, onClick: () => { setSelectedPatient(p); }, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' } },
              React.createElement('div', { style: { width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 } }, p.name.charAt(0)),
              React.createElement('div', { style: { flex: 1 } }, React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: '#1e293b', margin: 0 } }, p.name), React.createElement('p', { style: { fontSize: 12, color: '#94a3b8', margin: 0 } }, p.condition + ' • ' + p.department)),
              React.createElement('span', { style: { padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: (statusColors[p.status]||{}).bg, color: (statusColors[p.status]||{}).color } }, p.status)
            )))
          ),
          // Today's appointments
          React.createElement('div', { style: { ...cardStyle, padding: 24 } },
            React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16 } }, "Today's Schedule"),
            React.createElement('div', null, appointments.map(a => React.createElement('div', { key: a.id, style: { display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' } },
              React.createElement('div', { style: { minWidth: 48, fontSize: 14, fontWeight: 700, color: '#E56B2D' } }, a.time),
              React.createElement('div', null, React.createElement('p', { style: { fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 } }, a.patient), React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0 } }, a.doctor + ' • ' + a.dept))
            )))
          )
        )
      ),

      // PATIENTS
      view === 'patients' && React.createElement('div', null,
        React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
          statuses.map(s => React.createElement('button', { key: s, onClick: () => setStatusFilter(s), style: { padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: statusFilter === s ? '#E56B2D' : 'rgba(255,255,255,0.7)', color: statusFilter === s ? 'white' : '#475569' } }, s)),
          React.createElement('div', { style: { width: 1, background: '#e2e8f0', margin: '0 4px' } }),
          departments.map(d => React.createElement('button', { key: d, onClick: () => setDeptFilter(d), style: { padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: deptFilter === d ? '#C45A26' : 'rgba(255,255,255,0.7)', color: deptFilter === d ? 'white' : '#475569' } }, d))
        ),
        React.createElement('div', { style: { ...cardStyle, overflow: 'hidden' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null, React.createElement('tr', { style: { borderBottom: '1px solid #f1f5f9' } }, ['Patient', 'Age', 'Condition', 'Department', 'Doctor', 'Bed', 'Status', ''].map(h => React.createElement('th', { key: h, style: { padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' } }, h)))),
            React.createElement('tbody', null, filteredPatients.map(p => React.createElement('tr', { key: p.id, onClick: () => setSelectedPatient(p), style: { borderBottom: '1px solid #f8fafc', cursor: 'pointer' }, onMouseEnter: e => e.currentTarget.style.background = 'rgba(248,250,252,0.5)', onMouseLeave: e => e.currentTarget.style.background = 'transparent' },
              React.createElement('td', { style: { padding: '14px 16px' } }, React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, React.createElement('div', { style: { width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 } }, p.name.charAt(0)), React.createElement('span', { style: { fontWeight: 600, color: '#1e293b', fontSize: 14 } }, p.name))),
              React.createElement('td', { style: { padding: '14px 16px', fontSize: 14, color: '#475569' } }, p.age),
              React.createElement('td', { style: { padding: '14px 16px', fontSize: 14, color: '#475569' } }, p.condition),
              React.createElement('td', { style: { padding: '14px 16px', fontSize: 14, color: '#475569' } }, p.department),
              React.createElement('td', { style: { padding: '14px 16px', fontSize: 14, color: '#475569' } }, p.doctor),
              React.createElement('td', { style: { padding: '14px 16px', fontSize: 14, color: '#475569' } }, p.bed),
              React.createElement('td', { style: { padding: '14px 16px' } }, React.createElement('span', { style: { padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: (statusColors[p.status]||{}).bg, color: (statusColors[p.status]||{}).color } }, p.status)),
              React.createElement('td', { style: { padding: '14px 16px' } }, React.createElement('select', { value: p.status, onClick: e => e.stopPropagation(), onChange: e => updateStatus(p.id, e.target.value), style: { padding: '6px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', background: 'white', cursor: 'pointer' } }, statuses.filter(s => s !== 'All').map(s => React.createElement('option', { key: s, value: s }, s))))
            )))
          )
        )
      ),

      // APPOINTMENTS
      view === 'appointments' && React.createElement('div', { style: { ...cardStyle, padding: 24 } },
        React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 20 } }, "Today's Appointments"),
        React.createElement('div', null, appointments.map(a => React.createElement('div', { key: a.id, style: { display: 'flex', gap: 20, padding: '16px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' } },
          React.createElement('div', { style: { minWidth: 60, textAlign: 'center', padding: '8px 12px', borderRadius: 12, background: '#E56B2D', color: 'white', fontWeight: 700, fontSize: 14 } }, a.time),
          React.createElement('div', { style: { flex: 1 } }, React.createElement('p', { style: { fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 } }, a.patient), React.createElement('p', { style: { fontSize: 13, color: '#94a3b8', margin: '2px 0 0' } }, a.doctor + ' • ' + a.dept + ' Department')),
          React.createElement('span', { style: { padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: (statusColors[a.status]||{}).bg, color: (statusColors[a.status]||{}).color } }, a.status)
        )))
      ),

      // STAFF
      view === 'staff' && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 } },
        staff.map(s => React.createElement('div', { key: s.name, style: { ...cardStyle, padding: 24 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 } },
            React.createElement('div', { style: { width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18 } }, s.name.replace('Dr. ', '').charAt(0)),
            React.createElement('div', null, React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 } }, s.name), React.createElement('p', { style: { fontSize: 13, color: '#94a3b8', margin: '2px 0 0' } }, s.role))
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('div', null, React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0 } }, 'Department'), React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: '#1e293b', margin: '2px 0 0' } }, s.dept)),
            React.createElement('div', null, React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0 } }, 'Patients'), React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: '#1e293b', margin: '2px 0 0' } }, s.patients)),
            React.createElement('span', { style: { padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: (statusColors[s.status]||{}).bg, color: (statusColors[s.status]||{}).color } }, s.status)
          )
        ))
      ),

      // PATIENT DETAIL MODAL
      selectedPatient && React.createElement('div', { onClick: () => setSelectedPatient(null), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
        React.createElement('div', { onClick: e => e.stopPropagation(), style: { background: 'white', borderRadius: 24, padding: 32, width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 24 } },
            React.createElement('div', { style: { display: 'flex', gap: 16, alignItems: 'center' } },
              React.createElement('div', { style: { width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 20 } }, selectedPatient.name.charAt(0)),
              React.createElement('div', null, React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 } }, selectedPatient.name), React.createElement('p', { style: { color: '#94a3b8', margin: '4px 0 0', fontSize: 14 } }, selectedPatient.department + ' • ' + selectedPatient.doctor))
            ),
            React.createElement('button', { onClick: () => setSelectedPatient(null), style: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8' } }, '✕')
          ),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 } },
            [{ l: 'Age', v: selectedPatient.age }, { l: 'Gender', v: selectedPatient.gender }, { l: 'Admitted', v: selectedPatient.admitted }, { l: 'Bed', v: selectedPatient.bed }, { l: 'Condition', v: selectedPatient.condition }, { l: 'Status', v: selectedPatient.status }].map(i => React.createElement('div', { key: i.l, style: { background: '#f8fafc', borderRadius: 14, padding: 14 } }, React.createElement('p', { style: { fontSize: 11, color: '#94a3b8', margin: 0, fontWeight: 500 } }, i.l), React.createElement('p', { style: { fontSize: 15, color: '#1e293b', margin: '4px 0 0', fontWeight: 600 } }, i.v)))
          ),
          React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' } }, 'Vitals'),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 24 } },
            [{ l: 'Blood Pressure', v: selectedPatient.vitals.bp, i: '🫀' }, { l: 'Temperature', v: selectedPatient.vitals.temp, i: '🌡️' }, { l: 'Heart Rate', v: selectedPatient.vitals.hr + ' bpm', i: '💓' }, { l: 'SpO2', v: selectedPatient.vitals.spo2 + '%', i: '🫁' }].map(v => React.createElement('div', { key: v.l, style: { background: '#f8fafc', borderRadius: 14, padding: 14, textAlign: 'center' } }, React.createElement('span', { style: { fontSize: 20 } }, v.i), React.createElement('p', { style: { fontSize: 10, color: '#94a3b8', margin: '6px 0 2px' } }, v.l), React.createElement('p', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 } }, v.v)))
          ),
          React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' } }, 'Patient History'),
          React.createElement('div', null, selectedPatient.history.map((h, i) => React.createElement('div', { key: i, style: { display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' } },
            React.createElement('div', { style: { minWidth: 60, fontSize: 12, fontWeight: 600, color: '#E56B2D' } }, h.date),
            React.createElement('p', { style: { fontSize: 13, color: '#475569', margin: 0 } }, h.note)
          )))
        )
      ),

      // ADD PATIENT MODAL
      showAddModal && React.createElement('div', { onClick: () => setShowAddModal(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
        React.createElement('div', { onClick: e => e.stopPropagation(), style: { background: 'white', borderRadius: 24, padding: 32, width: 440 } },
          React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b', margin: '0 0 24px' } }, 'Add New Patient'),
          [{ k: 'name', l: 'Full Name', p: 'Enter patient name' }, { k: 'age', l: 'Age', p: 'Enter age' }, { k: 'condition', l: 'Condition', p: 'Enter condition' }].map(f => React.createElement('div', { key: f.k, style: { marginBottom: 16 } },
            React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, f.l),
            React.createElement('input', { value: newPatient[f.k], onChange: e => setNewPatient(p => ({ ...p, [f.k]: e.target.value })), placeholder: f.p, style: { width: '100%', padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } })
          )),
          React.createElement('div', { style: { marginBottom: 16 } },
            React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, 'Department'),
            React.createElement('select', { value: newPatient.department, onChange: e => setNewPatient(p => ({ ...p, department: e.target.value })), style: { width: '100%', padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } }, ['General', 'Surgery', 'Orthopedics', 'Cardiology', 'Pulmonology', 'Endocrinology', 'Obstetrics'].map(d => React.createElement('option', { key: d, value: d }, d)))
          ),
          React.createElement('div', { style: { display: 'flex', gap: 12, marginTop: 8 } },
            React.createElement('button', { onClick: () => setShowAddModal(false), style: { flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' } }, 'Cancel'),
            React.createElement('button', { onClick: addPatient, style: { flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#E56B2D', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, 'Add Patient')
          )
        )
      )
    )
  );
}
ReactDOM.render(React.createElement(App), document.getElementById('root'));
`;