(function(){
  const e = React.createElement;
  const cx = (...args) => args.filter(Boolean).join(' ');
  const cls = (base, conds) => {
    let out = base;
    for (const [c, v] of Object.entries(conds)) if (v) out += ' ' + c;
    return out;
  };
  const styles = {
    panel: 'rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl',
    card: 'rounded-2xl border border-white/10 bg-white/[0.04] p-5',
    input: 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500',
    btn: 'rounded-xl px-4 py-2 text-sm font-semibold transition-all active:scale-95',
    btnPrimary: 'bg-gradient-to-r from-indigo-500 to-pink-500 text-white shadow-lg',
    btnSecondary: 'bg-white/10 text-zinc-200 hover:bg-white/15',
    badge: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide'
  };

  window.AlphaUI = {
    _e: e,
    cx,
    cls,
    styles,

    Sidebar({ title, items, current, onChange, footer }) {
      const safeItems = (items || []).map((item) => typeof item === 'string' ? { id: item, label: item, icon: '' } : item);
      return e('aside', { className: 'h-full w-64 shrink-0 border-r border-white/10 bg-zinc-950/80 p-4 flex flex-col' },
        title ? e('div', { className: 'mb-6 px-2 text-lg font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent' }, title) : null,
        e('nav', { className: 'flex-1 space-y-1 overflow-y-auto' },
          safeItems.map((item) => e('button', {
            key: item.id,
            onClick: () => onChange && onChange(item.id),
            className: cls('w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-3', {
              'bg-white/10 text-white': current === item.id,
              'text-zinc-400 hover:bg-white/5 hover:text-zinc-100': current !== item.id
            })
          }, item.icon ? e('span', { className: 'opacity-80' }, item.icon) : null, item.label || item.id || ''))
        ),
        footer ? e('div', { className: 'mt-4 border-t border-white/10 pt-4' }, footer) : null
      );
    },

    Topbar({ title, subtitle, children }) {
      return e('header', { className: 'sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-zinc-950/80 px-6 backdrop-blur-xl' },
        e('div', null,
          e('h1', { className: 'text-base font-semibold text-white' }, title),
          subtitle ? e('p', { className: 'text-xs text-zinc-500' }, subtitle) : null
        ),
        e('div', { className: 'flex items-center gap-3' }, children)
      );
    },

    Card({ title, subtitle, children, className, onClick }) {
      return e('div', { onClick, className: cls(styles.card + (onClick ? ' cursor-pointer hover:bg-white/[0.06]' : ''), { [className]: className }) },
        title ? e('h3', { className: 'text-sm font-semibold text-zinc-100' }, title) : null,
        subtitle ? e('p', { className: 'mt-1 text-xs text-zinc-500' }, subtitle) : null,
        children ? e('div', { className: title || subtitle ? 'mt-4' : '' }, children) : null
      );
    },

    StatCard({ label, value, change, trend, className }) {
      const changeColor = change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-zinc-400';
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '−';
      return e('div', { className: cls(styles.card, { [className]: className }) },
        e('div', { className: 'text-xs font-medium text-zinc-400' }, label),
        e('div', { className: 'mt-2 text-2xl font-bold tracking-tight text-white' }, value),
        change !== undefined ? e('div', { className: cls('mt-1 text-xs font-medium', changeColor) }, `${arrow} ${Math.abs(change)}%`) : null,
        trend ? e('div', { className: 'mt-3 flex h-10 items-end gap-1' }, trend.map((v, i) => e('div', { key: i, className: 'flex-1 rounded-t bg-indigo-500/80', style: { height: `${Math.max(10, v)}%` } }))) : null
      );
    },

    Button({ children, onClick, variant = 'primary', className, type = 'button', disabled }) {
      const vClass = variant === 'primary' ? styles.btnPrimary : styles.btnSecondary;
      return e('button', { type, disabled, onClick, className: cls(styles.btn + ' ' + vClass, { 'opacity-50 cursor-not-allowed': disabled, [className]: className }) }, children);
    },

    Input(props) {
      const { className, ...rest } = props;
      return e('input', Object.assign({ className: cls(styles.input, { [className]: className }) }, rest));
    },

    Modal({ open, title, onClose, children }) {
      if (!open) return null;
      return e('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4', onClick: (ev) => ev.target === ev.currentTarget && onClose && onClose() },
        e('div', { className: 'w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl' },
          title ? e('h3', { className: 'mb-4 text-base font-semibold' }, title) : null,
          children
        )
      );
    },

    Table({ columns, rows, keyExtractor, onRowClick, className }) {
      const safeColumns = (columns || []).map((col) => typeof col === 'string' ? { key: col, title: col } : col);
      const safeRows = (rows || []);
      return e('div', { className: cls('overflow-x-auto', { [className]: className }) },
        e('table', { className: 'w-full text-left text-sm' },
          e('thead', null,
            e('tr', { className: 'border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500' },
              safeColumns.map((col, i) => e('th', { key: col.key || i, className: 'pb-3 pr-4 font-semibold' }, col.title || col.key || ''))
            )
          ),
          e('tbody', null,
            safeRows.map((row, idx) => e('tr', {
              key: keyExtractor ? keyExtractor(row, idx) : idx,
              onClick: () => onRowClick && onRowClick(row),
              className: 'border-b border-white/5 hover:bg-white/[0.03] ' + (onRowClick ? 'cursor-pointer' : '')
            }, safeColumns.map((col, ci) => {
              let cell;
              if (Array.isArray(row)) {
                cell = row[ci];
              } else if (row) {
                cell = row[col.key];
              }
              if (col.render) {
                cell = col.render(cell, row);
              }
              return e('td', { key: col.key || ci, className: 'py-3 pr-4 text-zinc-300' }, cell !== undefined && cell !== null ? cell : '');
            })))
          )
        )
      );
    },

    Kanban({ columns, cards, onMove, onAdd, className }) {
      const colForCard = (c) => c.column || c.columnId || c.status;
      const allowDrop = (ev) => ev.preventDefault();
      const drop = (ev, colId) => {
        ev.preventDefault();
        const cardId = ev.dataTransfer.getData('cardId');
        if (cardId && onMove) onMove(cardId, colId);
      };
      const drag = (ev, cardId) => ev.dataTransfer.setData('cardId', cardId);
      return e('div', { className: cls('grid gap-4', { [className]: className }), style: { gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))` } },
        columns.map((col) => e('div', { key: col.id, className: 'flex flex-col rounded-2xl border border-white/10 bg-zinc-900/50 p-3', onDragOver: allowDrop, onDrop: (ev) => drop(ev, col.id) },
          e('div', { className: 'mb-3 flex items-center justify-between px-1' },
            e('span', { className: 'text-xs font-semibold uppercase tracking-wide text-zinc-400' }, col.title),
            e('span', { className: 'text-xs text-zinc-500' }, cards.filter((c) => colForCard(c) === col.id).length)
          ),
          e('div', { className: 'flex-1 space-y-3 overflow-y-auto pr-1' },
            cards.filter((c) => colForCard(c) === col.id).map((card) => e('div', {
              key: card.id,
              draggable: true,
              onDragStart: (ev) => drag(ev, card.id),
              className: 'cursor-grab rounded-xl border border-white/10 bg-zinc-800/60 p-3 hover:bg-zinc-800'
            },
              e('div', { className: 'text-sm font-medium text-zinc-100' }, card.title || card.name || ''),
              (card.meta || card.description || card.content) ? e('div', { className: 'mt-1 text-xs text-zinc-500' }, card.meta || card.description || card.content) : null
            )),
            onAdd ? e('button', { onClick: () => onAdd(col.id), className: 'w-full rounded-lg border border-dashed border-white/20 py-2 text-xs text-zinc-500 hover:border-white/40 hover:text-zinc-300' }, '+ Add card') : null
          )
        ))
      );
    },

    Chart({ type = 'bar', data, labels, height = 160, className }) {
      const values = data || [];
      const max = Math.max(1, ...values.map(v => (typeof v === 'object' ? v.value : v)));
      return e('div', { className: cls('w-full', { [className]: className }) },
        e('div', { className: 'flex items-end gap-2', style: { height } },
          values.map((v, i) => {
            const val = typeof v === 'object' ? v.value : v;
            const label = labels ? labels[i] : v.label;
            return e('div', { key: i, className: 'flex flex-1 flex-col items-center gap-1' },
              e('div', { className: 'w-full rounded-t-lg bg-gradient-to-t from-indigo-500 to-pink-500', style: { height: `${(val / max) * 100}%` } }),
              label ? e('div', { className: 'text-[10px] text-zinc-500 truncate w-full text-center' }, label) : null
            );
          })
        )
      );
    },

    Empty({ text, message, action }) {
      return e('div', { className: 'flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center' },
        e('div', { className: 'text-3xl opacity-30' }, '📭'),
        e('p', { className: 'mt-3 text-sm text-zinc-400' }, text || message || 'No data yet.'),
        action ? e('div', { className: 'mt-4' }, action) : null
      );
    },

    Skeleton({ count = 3 }) {
      return e('div', { className: 'space-y-3' }, Array.from({ length: count }).map((_, i) => e('div', { key: i, className: 'h-12 animate-pulse rounded-xl bg-white/5' })));
    },

    Tabs({ tabs, active, onChange, className }) {
      return e('div', { className: cls('flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit', { [className]: className }) },
        tabs.map((tab) => e('button', {
          key: tab.id,
          onClick: () => onChange && onChange(tab.id),
          className: cls('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', {
            'bg-white/10 text-white': active === tab.id,
            'text-zinc-400 hover:text-zinc-200': active !== tab.id
          })
        }, tab.label))
      );
    },

    Search({ value, onChange, placeholder = 'Search...', className }) {
      return e('div', { className: cls('relative', { [className]: className }) },
        e('input', {
          value, onChange, placeholder,
          className: cls(styles.input + ' pl-9', { [className]: className })
        })
      );
    },

    Avatar({ name, image, src, size = 32, className }) {
      const photo = image || src;
      const initials = String(name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      if (photo) {
        return e('img', {
          src: photo,
          alt: name || 'avatar',
          className: cls('rounded-full object-cover', { [className]: className }),
          style: { width: size, height: size },
          onError: (ev) => { ev.target.style.display = 'none'; }
        });
      }
      return e('div', {
        className: cls('flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-xs font-bold text-white', { [className]: className }),
        style: { width: size, height: size }
      }, initials);
    },

    Badge({ children, color = 'indigo' }) {
      const colors = {
        indigo: 'bg-indigo-500/15 text-indigo-300',
        emerald: 'bg-emerald-500/15 text-emerald-300',
        rose: 'bg-rose-500/15 text-rose-300',
        amber: 'bg-amber-500/15 text-amber-300',
        zinc: 'bg-white/10 text-zinc-300'
      };
      return e('span', { className: cls(styles.badge, { [colors[color] || colors.indigo]: true }) }, children);
    }
  };
})();
