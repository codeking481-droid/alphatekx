// BookHaven - Full bookstore e-commerce app
export const BOOKHAVEN_CODE = `
const { useState, useEffect, useMemo, useRef } = React;

function StarRating({ rating, size }) {
  return React.createElement('span', { style: { color: '#f59e0b', fontSize: size || 13 } },
    '★★★★★'.split('').map((s, i) => React.createElement('span', {
      key: i,
      style: { opacity: i < Math.floor(rating) ? 1 : i < rating ? 0.5 : 0.2 }
    }, '★'))
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return React.createElement('div', {
    style: { position: 'fixed', top: 20, right: 20, background: '#10b981', color: 'white',
      padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500, zIndex: 9999,
      boxShadow: '0 8px 24px rgba(16,185,129,0.3)', animation: 'slideIn 0.3s ease' }
  }, '✓ ' + msg);
}

function App() {
  const [books, setBooks] = useState([
    { id: 1, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', price: 12.99, stock: 8, image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop', category: 'Classic', rating: 4.5, reviews: 234, desc: 'A portrait of the Jazz Age in all of its decadence and excess.' },
    { id: 2, title: 'To Kill a Mockingbird', author: 'Harper Lee', price: 14.99, stock: 5, image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&h=400&fit=crop', category: 'Classic', rating: 4.8, reviews: 412, desc: 'The unforgettable novel of a childhood in a sleepy Southern town.' },
    { id: 3, title: 'Sapiens', author: 'Yuval Noah Harari', price: 18.99, stock: 12, image: 'https://images.unsplash.com/photo-1589998059171-988d887df646?w=300&h=400&fit=crop', category: 'Non-Fiction', rating: 4.7, reviews: 891, desc: 'A brief history of humankind exploring how Homo sapiens came to dominate.' },
    { id: 4, title: 'Atomic Habits', author: 'James Clear', price: 16.99, stock: 15, image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=300&h=400&fit=crop', category: 'Self-Help', rating: 4.9, reviews: 1203, desc: 'An easy and proven way to build good habits and break bad ones.' },
    { id: 5, title: 'Dune', author: 'Frank Herbert', price: 15.99, stock: 7, image: 'https://images.unsplash.com/photo-1531988042231-d39a9cc12a9a?w=300&h=400&fit=crop', category: 'Sci-Fi', rating: 4.6, reviews: 567, desc: 'A stunning blend of adventure and mysticism on the desert planet Arrakis.' },
    { id: 6, title: 'The Alchemist', author: 'Paulo Coelho', price: 11.99, stock: 20, image: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=300&h=400&fit=crop', category: 'Fiction', rating: 4.4, reviews: 345, desc: 'A philosophical story of a shepherd boy traveling to Egypt.' },
    { id: 7, title: '1984', author: 'George Orwell', price: 13.99, stock: 3, image: 'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=300&h=400&fit=crop', category: 'Classic', rating: 4.7, reviews: 678, desc: 'A dystopian social science fiction novel and cautionary tale.' },
    { id: 8, title: 'Deep Work', author: 'Cal Newport', price: 17.99, stock: 9, image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=300&h=400&fit=crop', category: 'Self-Help', rating: 4.6, reviews: 234, desc: 'Rules for focused success in a distracted world.' },
    { id: 9, title: 'The Hobbit', author: 'J.R.R. Tolkien', price: 14.99, stock: 11, image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&h=400&fit=crop', category: 'Fantasy', rating: 4.8, reviews: 789, desc: 'A fantasy adventure of Bilbo Baggins on a quest for treasure.' },
    { id: 10, title: 'Educated', author: 'Tara Westover', price: 16.99, stock: 6, image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=300&h=400&fit=crop', category: 'Memoir', rating: 4.7, reviews: 456, desc: 'A memoir about a woman who leaves her survivalist family.' },
    { id: 11, title: 'The Silent Patient', author: 'Alex Michaelides', price: 13.99, stock: 14, image: 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=300&h=400&fit=crop', category: 'Thriller', rating: 4.3, reviews: 321, desc: 'A psychological thriller about a woman who shoots her husband.' },
    { id: 12, title: 'Where the Crawdads Sing', author: 'Delia Owens', price: 15.99, stock: 8, image: 'https://images.unsplash.com/photo-1535905557558-3fcd7f69da2e?w=300&h=400&fit=crop', category: 'Fiction', rating: 4.5, reviews: 612, desc: 'A coming-of-age mystery set in the marshes of North Carolina.' },
  ]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('bh_cart')) || []; } catch { return []; } });
  const [wishlist, setWishlist] = useState(() => { try { return JSON.parse(localStorage.getItem('bh_wishlist')) || []; } catch { return []; } });
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('featured');
  const [view, setView] = useState('home');
  const [showCart, setShowCart] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState('');
  const [priceRange, setPriceRange] = useState(25);
  const toastTimer = useRef(null);

  useEffect(() => { localStorage.setItem('bh_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('bh_wishlist', JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => {
    if (toast) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 2500);
    }
  }, [toast]);

  const categories = ['All', ...new Set(books.map(b => b.category))];

  const filteredBooks = useMemo(() => {
    let r = books.filter(b => {
      const ms = b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase());
      const mc = category === 'All' || b.category === category;
      const mp = b.price <= priceRange;
      return ms && mc && mp;
    });
    if (sortBy === 'price-low') r.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price-high') r.sort((a, b) => b.price - a.price);
    else if (sortBy === 'rating') r.sort((a, b) => b.rating - a.rating);
    return r;
  }, [books, search, category, sortBy, priceRange]);

  const handleBuy = (id) => {
    const book = books.find(b => b.id === id);
    if (!book || book.stock <= 0) return;
    setBooks(prev => prev.map(b => b.id === id ? { ...b, stock: Math.max(0, b.stock - 1) } : b));
    setCart(prev => {
      const ex = prev.find(c => c.id === id);
      if (ex) return prev.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...book, qty: 1 }];
    });
    setToast(book.title + ' added to cart');
  };

  const handleQty = (id, d) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + d) } : c).filter(c => c.qty > 0));
  };

  const toggleWishlist = (id) => {
    setWishlist(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);
    setToast(wishlist.includes(id) ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const wishlistBooks = books.filter(b => wishlist.includes(b.id));
  const featured = books.filter(b => b.rating >= 4.7).slice(0, 4);

  const B = dark ? '#0f172a' : 'transparent';
  const cardBg = dark ? 'rgba(30,41,59,0.8)' : 'rgba(255,255,255,0.75)';
  const textPri = dark ? '#f1f5f9' : '#1e293b';
  const textSec = dark ? '#94a3b8' : '#64748b';

  const placeOrder = () => {
    setCheckout({ success: true, total: total, items: cartCount });
    setCart([]);
    setShowCart(false);
    setView('home');
  };

  return React.createElement('div', { style: { minHeight: '100vh', background: dark ? '#0f172a' : 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f5f3ff 100%)', fontFamily: 'Inter, system-ui, sans-serif', transition: 'background 0.3s' } },
    React.createElement(Toast, { msg: toast }),
    React.createElement('style', null, '@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}'),
    // Nav
    React.createElement('nav', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', background: dark ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid ' + (dark ? 'rgba(51,65,85,0.5)' : 'rgba(255,255,255,0.6)'), position: 'sticky', top: 0, zIndex: 50 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }, onClick: () => setView('home') },
        React.createElement('span', { style: { fontSize: 28 } }, '📚'),
        React.createElement('span', { style: { fontSize: 22, fontWeight: 800, color: textPri } }, 'BookHaven')
      ),
      React.createElement('div', { style: { display: 'flex', gap: 24 } },
        ['home', 'shop'].map(v => React.createElement('button', { key: v, onClick: () => setView(v), style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: view === v ? 700 : 500, color: view === v ? '#E56B2D' : textSec } }, v === 'home' ? 'Home' : 'Shop'))
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement('input', { value: search, onChange: e => { setSearch(e.target.value); setView('shop'); }, placeholder: 'Search books...', style: { padding: '10px 20px', borderRadius: 999, border: '1px solid ' + (dark ? '#334155' : 'rgba(148,163,184,0.3)'), background: dark ? 'rgba(30,41,59,0.8)' : 'rgba(255,255,255,0.7)', color: textPri, width: 220, fontSize: 14, outline: 'none' } }),
        React.createElement('button', { onClick: () => setDark(!dark), style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '8px' } }, dark ? '☀️' : '🌙'),
        React.createElement('button', { onClick: () => setShowWishlist(true), style: { position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '8px' } }, '❤️', wishlist.length > 0 && React.createElement('span', { style: { position: 'absolute', top: 2, right: 2, background: '#ef4444', borderRadius: '50%', padding: '1px 6px', fontSize: 10, color: 'white' } }, wishlist.length)),
        React.createElement('button', { onClick: () => setShowCart(true), style: { position: 'relative', padding: '10px 20px', borderRadius: 999, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 } }, '🛒 ' + cartCount)
      )
    ),

    // HOME VIEW
    view === 'home' && React.createElement('div', null,
      // Hero
      React.createElement('div', { style: { padding: '60px 32px', textAlign: 'center', maxWidth: 800, margin: '0 auto' } },
        React.createElement('h1', { style: { fontSize: 48, fontWeight: 800, color: textPri, marginBottom: 16, lineHeight: 1.1 } }, 'Discover Your Next', React.createElement('br', null), 'Great Read'),
        React.createElement('p', { style: { fontSize: 18, color: textSec, marginBottom: 32 } }, 'Thousands of books at your fingertips. Find your next adventure today.'),
        React.createElement('button', { onClick: () => setView('shop'), style: { padding: '14px 40px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer' } }, 'Browse Collection')
      ),
      // Featured
      React.createElement('div', { style: { padding: '0 32px 60px', maxWidth: 1200, margin: '0 auto' } },
        React.createElement('h2', { style: { fontSize: 28, fontWeight: 700, color: textPri, marginBottom: 24 } }, '✨ Featured Books'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 24 } },
          featured.map(book => React.createElement('div', { key: book.id, onClick: () => setSelectedBook(book), style: { background: cardBg, backdropFilter: 'blur(24px)', borderRadius: 20, border: '1px solid ' + (dark ? 'rgba(51,65,85,0.5)' : 'rgba(255,255,255,0.6)'), overflow: 'hidden', cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.06)', animation: 'fadeIn 0.4s ease', transition: 'transform 0.2s' }, onMouseEnter: e => e.currentTarget.style.transform = 'translateY(-4px)', onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)' },
            React.createElement('img', { src: book.image, alt: book.title, style: { width: '100%', height: 200, objectFit: 'cover' } }),
            React.createElement('div', { style: { padding: 16 } },
              React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: textPri, margin: '0 0 4px' } }, book.title),
              React.createElement('p', { style: { fontSize: 13, color: textSec, margin: '0 0 8px' } }, book.author),
              React.createElement(StarRating, { rating: book.rating }),
              React.createElement('p', { style: { fontSize: 18, fontWeight: 700, color: '#E56B2D', marginTop: 8 } }, '$' + book.price.toFixed(2))
            )
          ))
        )
      ),
      // Categories
      React.createElement('div', { style: { padding: '0 32px 60px', maxWidth: 1200, margin: '0 auto' } },
        React.createElement('h2', { style: { fontSize: 28, fontWeight: 700, color: textPri, marginBottom: 24 } }, 'Browse by Category'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 } },
          categories.filter(c => c !== 'All').map(c => React.createElement('button', { key: c, onClick: () => { setCategory(c); setView('shop'); }, style: { padding: '24px', borderRadius: 20, border: 'none', cursor: 'pointer', background: cardBg, backdropFilter: 'blur(16px)', color: textPri, fontSize: 16, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } }, c))
        )
      )
    ),

    // SHOP VIEW
    view === 'shop' && React.createElement('div', { style: { display: 'flex', maxWidth: 1200, margin: '0 auto', padding: '24px 32px', gap: 24 } },
      // Sidebar filters
      React.createElement('div', { style: { width: 240, flexShrink: 0 } },
        React.createElement('div', { style: { background: cardBg, backdropFilter: 'blur(16px)', borderRadius: 20, padding: 20, border: '1px solid ' + (dark ? 'rgba(51,65,85,0.5)' : 'rgba(255,255,255,0.6)') } },
          React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: textPri, marginBottom: 12 } }, 'Categories'),
          categories.map(c => React.createElement('button', { key: c, onClick: () => setCategory(c), style: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: category === c ? 600 : 400, background: category === c ? '#E56B2D' : 'transparent', color: category === c ? 'white' : textSec, marginBottom: 2 } }, c)),
          React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: textPri, margin: '20px 0 8px' } }, 'Max Price: $' + priceRange),
          React.createElement('input', { type: 'range', min: '5', max: '25', value: priceRange, onChange: e => setPriceRange(+e.target.value), style: { width: '100%', accentColor: '#E56B2D' } }),
          React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: textPri, margin: '20px 0 8px' } }, 'Sort By'),
          React.createElement('select', { value: sortBy, onChange: e => setSortBy(e.target.value), style: { width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid ' + (dark ? '#334155' : '#e2e8f0'), background: dark ? '#1e293b' : 'white', color: textPri, fontSize: 13, outline: 'none' } },
            ['featured', 'price-low', 'price-high', 'rating'].map(s => React.createElement('option', { key: s, value: s }, { 'featured': 'Featured', 'price-low': 'Price: Low to High', 'price-high': 'Price: High to Low', 'rating': 'Top Rated' }[s]))
          )
        )
      ),
      // Grid
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('p', { style: { color: textSec, fontSize: 14, marginBottom: 16 } }, filteredBooks.length + ' books found'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 } },
          filteredBooks.map(book => React.createElement('div', { key: book.id, style: { background: cardBg, backdropFilter: 'blur(24px)', borderRadius: 20, border: '1px solid ' + (dark ? 'rgba(51,65,85,0.5)' : 'rgba(255,255,255,0.6)'), overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.06)', animation: 'fadeIn 0.3s ease', transition: 'transform 0.2s' }, onMouseEnter: e => e.currentTarget.style.transform = 'translateY(-4px)', onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)' },
            React.createElement('div', { style: { position: 'relative', cursor: 'pointer' }, onClick: () => setSelectedBook(book) },
              React.createElement('img', { src: book.image, alt: book.title, style: { width: '100%', height: 180, objectFit: 'cover' } }),
              React.createElement('button', { onClick: e => { e.stopPropagation(); toggleWishlist(book.id); }, style: { position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 14 } }, wishlist.includes(book.id) ? '❤️' : '🤍'),
              React.createElement('span', { style: { position: 'absolute', top: 8, left: 8, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: book.stock > 5 ? '#dcfce7' : book.stock > 0 ? '#fef3c7' : '#fee2e2', color: book.stock > 5 ? '#166534' : book.stock > 0 ? '#92400e' : '#991b1b' } }, book.stock > 0 ? book.stock + ' left' : 'Sold out')
            ),
            React.createElement('div', { style: { padding: 14 } },
              React.createElement('span', { style: { fontSize: 10, color: '#E56B2D', fontWeight: 600, textTransform: 'uppercase' } }, book.category),
              React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: textPri, margin: '4px 0 2px' } }, book.title),
              React.createElement('p', { style: { fontSize: 12, color: textSec, margin: '0 0 6px' } }, book.author),
              React.createElement(StarRating, { rating: book.rating }),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 } },
                React.createElement('span', { style: { fontSize: 17, fontWeight: 700, color: textPri } }, '$' + book.price.toFixed(2)),
                React.createElement('button', { onClick: () => handleBuy(book.id), disabled: book.stock <= 0, style: { padding: '8px 18px', borderRadius: 999, border: 'none', background: book.stock > 0 ? '#E56B2D' : '#94a3b8', color: 'white', cursor: book.stock > 0 ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 } }, 'Add')
              )
            )
          ))
        ),
        filteredBooks.length === 0 && React.createElement('div', { style: { textAlign: 'center', padding: 60, color: textSec } }, '📚 No books found')
      )
    ),

    // CHECKOUT SUCCESS
    checkout && checkout.success && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('div', { style: { background: dark ? '#1e293b' : 'white', borderRadius: 24, padding: 40, width: 440, textAlign: 'center' } },
        React.createElement('div', { style: { fontSize: 64, marginBottom: 16 } }, '✅'),
        React.createElement('h2', { style: { fontSize: 24, fontWeight: 800, color: textPri, marginBottom: 8 } }, 'Order Confirmed!'),
        React.createElement('p', { style: { color: textSec, fontSize: 14, marginBottom: 20 } }, 'Thank you for your purchase of ' + checkout.items + ' items for $' + checkout.total.toFixed(2)),
        React.createElement('button', { onClick: () => setCheckout(null), style: { padding: '12px 32px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, 'Continue Shopping')
      )
    ),

    // BOOK DETAIL MODAL
    selectedBook && React.createElement('div', { onClick: () => setSelectedBook(null), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('div', { onClick: e => e.stopPropagation(), style: { background: dark ? '#1e293b' : 'white', borderRadius: 24, padding: 32, width: 600, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' } },
        React.createElement('div', { style: { display: 'flex', gap: 24 } },
          React.createElement('img', { src: selectedBook.image, alt: selectedBook.title, style: { width: 180, height: 240, borderRadius: 16, objectFit: 'cover' } }),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('span', { style: { fontSize: 11, color: '#E56B2D', fontWeight: 600, textTransform: 'uppercase' } }, selectedBook.category),
            React.createElement('h2', { style: { fontSize: 24, fontWeight: 800, color: textPri, margin: '4px 0' } }, selectedBook.title),
            React.createElement('p', { style: { color: textSec, fontSize: 14, margin: '0 0 8px' } }, 'by ' + selectedBook.author),
            React.createElement(StarRating, { rating: selectedBook.rating, size: 16 }),
            React.createElement('span', { style: { fontSize: 13, color: textSec, marginLeft: 8 } }, selectedBook.rating + ' (' + selectedBook.reviews + ' reviews)'),
            React.createElement('p', { style: { color: textSec, fontSize: 14, margin: '12px 0', lineHeight: 1.5 } }, selectedBook.desc),
            React.createElement('p', { style: { fontSize: 28, fontWeight: 800, color: textPri, margin: '12px 0' } }, '$' + selectedBook.price.toFixed(2)),
            React.createElement('div', { style: { display: 'flex', gap: 12, marginTop: 16 } },
              React.createElement('button', { onClick: () => handleBuy(selectedBook.id), disabled: selectedBook.stock <= 0, style: { flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: selectedBook.stock > 0 ? 'linear-gradient(135deg, #E56B2D, #C45A26)' : '#94a3b8', color: 'white', fontSize: 15, fontWeight: 700, cursor: selectedBook.stock > 0 ? 'pointer' : 'not-allowed' } }, selectedBook.stock > 0 ? 'Add to Cart' : 'Sold Out'),
              React.createElement('button', { onClick: () => toggleWishlist(selectedBook.id), style: { padding: '14px 20px', borderRadius: 14, border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontSize: 18 } }, wishlist.includes(selectedBook.id) ? '❤️' : '🤍')
            )
          )
        )
      )
    ),

    // CART DRAWER
    showCart && React.createElement('div', { onClick: () => setShowCart(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 } },
      React.createElement('div', { onClick: e => e.stopPropagation(), style: { width: 400, background: dark ? '#1e293b' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)', height: '100vh', padding: 28, overflowY: 'auto' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } },
          React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: textPri } }, 'Your Cart'),
          React.createElement('button', { onClick: () => setShowCart(false), style: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: textSec } }, '✕')
        ),
        cart.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: 60, color: textSec } }, React.createElement('p', { style: { fontSize: 48 } }, '🛒'), React.createElement('p', null, 'Your cart is empty')) :
        React.createElement('div', null,
          cart.map(item => React.createElement('div', { key: item.id, style: { display: 'flex', gap: 12, padding: '16px 0', borderBottom: '1px solid ' + (dark ? '#334155' : '#f1f5f9') } },
            React.createElement('img', { src: item.image, style: { width: 56, height: 72, borderRadius: 10, objectFit: 'cover' } }),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: textPri, margin: 0 } }, item.title),
              React.createElement('p', { style: { fontSize: 13, color: textSec, margin: '2px 0 8px' } }, '$' + item.price.toFixed(2)),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                React.createElement('button', { onClick: () => handleQty(item.id, -1), style: { width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: dark ? '#334155' : 'white', color: textPri, cursor: 'pointer', fontSize: 14 } }, '−'),
                React.createElement('span', { style: { fontWeight: 600, minWidth: 20, textAlign: 'center', color: textPri } }, item.qty),
                React.createElement('button', { onClick: () => handleQty(item.id, 1), style: { width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0', background: dark ? '#334155' : 'white', color: textPri, cursor: 'pointer', fontSize: 14 } }, '+')
              )
            ),
            React.createElement('span', { style: { fontWeight: 700, color: textPri } }, '$' + (item.price * item.qty).toFixed(2))
          )),
          React.createElement('div', { style: { borderTop: '2px solid ' + (dark ? '#334155' : '#e2e8f0'), marginTop: 16, paddingTop: 16 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 16 } },
              React.createElement('span', { style: { fontSize: 16, fontWeight: 600, color: textPri } }, 'Total'),
              React.createElement('span', { style: { fontSize: 22, fontWeight: 800, color: '#E56B2D' } }, '$' + total.toFixed(2))
            ),
            React.createElement('button', { onClick: placeOrder, style: { width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' } }, 'Checkout (' + cartCount + ' items)')
          )
        )
      )
    ),

    // WISHLIST DRAWER
    showWishlist && React.createElement('div', { onClick: () => setShowWishlist(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 } },
      React.createElement('div', { onClick: e => e.stopPropagation(), style: { width: 400, background: dark ? '#1e293b' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)', height: '100vh', padding: 28, overflowY: 'auto' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } },
          React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: textPri } }, '❤️ Wishlist'),
          React.createElement('button', { onClick: () => setShowWishlist(false), style: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: textSec } }, '✕')
        ),
        wishlistBooks.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: 60, color: textSec } }, React.createElement('p', { style: { fontSize: 48 } }, '❤️'), React.createElement('p', null, 'Your wishlist is empty')) :
        wishlistBooks.map(book => React.createElement('div', { key: book.id, style: { display: 'flex', gap: 12, padding: '16px 0', borderBottom: '1px solid ' + (dark ? '#334155' : '#f1f5f9') } },
          React.createElement('img', { src: book.image, style: { width: 48, height: 64, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' }, onClick: () => { setSelectedBook(book); setShowWishlist(false); } }),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: textPri, margin: 0, cursor: 'pointer' }, onClick: () => { setSelectedBook(book); setShowWishlist(false); } }, book.title),
            React.createElement('p', { style: { fontSize: 13, color: textSec, margin: '2px 0' } }, '$' + book.price.toFixed(2)),
            React.createElement('button', { onClick: () => handleBuy(book.id), disabled: book.stock <= 0, style: { padding: '6px 16px', borderRadius: 999, border: 'none', background: '#E56B2D', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 } }, 'Add to Cart')
          )
        ))
      )
    )
  );
}
ReactDOM.render(React.createElement(App), document.getElementById('root'));
`;