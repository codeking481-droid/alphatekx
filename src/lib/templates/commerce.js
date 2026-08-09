// Commerce OS - Full e-commerce platform
export const COMMERCE_CODE = `
const { useState, useEffect, useMemo, useRef } = React;

function Stars({ rating }) {
  return React.createElement('span', { style: { color: '#f59e0b', fontSize: 13 } },
    [0,1,2,3,4].map(i => React.createElement('span', { key: i, style: { opacity: i < Math.floor(rating) ? 1 : i < rating ? 0.5 : 0.2 } }, '★'))
  );
}

function App() {
  const [products, setProducts] = useState([
    { id: 1, name: 'Wireless Headphones Pro', price: 149.99, oldPrice: 199.99, stock: 12, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop', category: 'Electronics', rating: 4.8, reviews: 234, desc: 'Premium wireless headphones with active noise cancellation and 40-hour battery life.' },
    { id: 2, name: 'Premium Leather Backpack', price: 89.99, oldPrice: 119.99, stock: 8, image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop', category: 'Accessories', rating: 4.6, reviews: 156, desc: 'Handcrafted full-grain leather backpack with laptop compartment and lifetime warranty.' },
    { id: 3, name: 'Smart Watch Elite', price: 299.99, oldPrice: 349.99, stock: 5, image: 'https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=400&h=400&fit=crop', category: 'Electronics', rating: 4.9, reviews: 412, desc: 'Advanced smartwatch with health tracking, GPS, and 7-day battery life.' },
    { id: 4, name: 'Organic Coffee Beans', price: 24.99, oldPrice: 29.99, stock: 30, image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=400&fit=crop', category: 'Food', rating: 4.7, reviews: 89, desc: 'Single-origin organic coffee beans, freshly roasted. Medium roast, 1lb bag.' },
    { id: 5, name: 'Minimalist Desk Lamp', price: 59.99, oldPrice: 79.99, stock: 15, image: 'https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=400&h=400&fit=crop', category: 'Home', rating: 4.5, reviews: 67, desc: 'Modern LED desk lamp with adjustable brightness and USB charging port.' },
    { id: 6, name: 'Running Shoes Ultra', price: 129.99, oldPrice: 159.99, stock: 10, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop', category: 'Sports', rating: 4.8, reviews: 345, desc: 'Lightweight performance running shoes with responsive cushioning technology.' },
    { id: 7, name: 'Ceramic Plant Pot Set', price: 34.99, oldPrice: 44.99, stock: 22, image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&h=400&fit=crop', category: 'Home', rating: 4.4, reviews: 78, desc: 'Set of 3 minimalist ceramic plant pots with drainage trays.' },
    { id: 8, name: 'Bluetooth Speaker Mini', price: 49.99, oldPrice: 69.99, stock: 18, image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop', category: 'Electronics', rating: 4.6, reviews: 198, desc: 'Compact waterproof Bluetooth speaker with 360-degree sound.' },
    { id: 9, name: 'Yoga Mat Premium', price: 39.99, oldPrice: 54.99, stock: 25, image: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400&h=400&fit=crop', category: 'Sports', rating: 4.7, reviews: 134, desc: 'Eco-friendly yoga mat with non-slip surface and alignment markers.' },
    { id: 10, name: 'Sunglasses Aviator', price: 79.99, oldPrice: 99.99, stock: 14, image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=400&fit=crop', category: 'Accessories', rating: 4.5, reviews: 112, desc: 'Classic aviator sunglasses with UV400 protection and polarized lenses.' },
    { id: 11, name: 'Stainless Water Bottle', price: 27.99, oldPrice: 34.99, stock: 40, image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop', category: 'Home', rating: 4.6, reviews: 256, desc: 'Insulated stainless steel water bottle, keeps cold for 24 hours.' },
    { id: 12, name: 'Mechanical Keyboard', price: 119.99, oldPrice: 149.99, stock: 7, image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&h=400&fit=crop', category: 'Electronics', rating: 4.8, reviews: 189, desc: 'Compact mechanical keyboard with hot-swappable switches and RGB backlight.' },
  ]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('featured');
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('co_cart')) || []; } catch { return []; } });
  const [wishlist, setWishlist] = useState(() => { try { return JSON.parse(localStorage.getItem('co_wishlist')) || []; } catch { return []; } });
  const [recentlyViewed, setRecentlyViewed] = useState(() => { try { return JSON.parse(localStorage.getItem('co_recent')) || []; } catch { return []; } });
  const [view, setView] = useState('home');
  const [showCart, setShowCart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState(null);
  const [orderComplete, setOrderComplete] = useState(null);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [toast, setToast] = useState('');
  const toastRef = useRef(null);

  useEffect(() => { localStorage.setItem('co_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('co_wishlist', JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => { localStorage.setItem('co_recent', JSON.stringify(recentlyViewed)); }, [recentlyViewed]);
  useEffect(() => { if (toast) { if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(''), 2500); } }, [toast]);

  const categories = ['All', ...new Set(products.map(p => p.category))];

  const filteredProducts = useMemo(() => {
    let r = products.filter(p => {
      const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
      const mc = category === 'All' || p.category === category;
      return ms && mc;
    });
    if (sortBy === 'price-low') r.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price-high') r.sort((a, b) => b.price - a.price);
    else if (sortBy === 'rating') r.sort((a, b) => b.rating - a.rating);
    return r;
  }, [products, search, category, sortBy]);

  const addToCart = (id) => {
    const p = products.find(pr => pr.id === id);
    if (!p || p.stock <= 0) return;
    setProducts(prev => prev.map(pr => pr.id === id ? { ...pr, stock: Math.max(0, pr.stock - 1) } : pr));
    setCart(prev => { const ex = prev.find(c => c.id === id); if (ex) return prev.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c); return [...prev, { ...p, qty: 1 }]; });
    setToast(p.name + ' added to cart!');
  };

  const handleQty = (id, d) => { setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + d) } : c).filter(c => c.qty > 0)); };

  const toggleWishlist = (id) => { setWishlist(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]); setToast(wishlist.includes(id) ? 'Removed from wishlist' : 'Added to wishlist ❤️'); };

  const openProduct = (p) => {
    setSelectedProduct(p);
    setRecentlyViewed(prev => [p.id, ...prev.filter(id => id !== p.id)].slice(0, 6));
  };

  const applyDiscount = () => {
    const codes = { 'SAVE10': 0.10, 'SAVE20': 0.20, 'WELCOME': 0.15 };
    const disc = codes[discountCode.toUpperCase()];
    if (disc) { setAppliedDiscount(disc); setToast('Discount applied: ' + discountCode.toUpperCase()); }
    else { setToast('Invalid discount code'); }
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = subtotal * appliedDiscount;
  const total = subtotal - discountAmt;
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const featured = products.filter(p => p.rating >= 4.7).slice(0, 4);
  const recentProducts = recentlyViewed.map(id => products.find(p => p.id === id)).filter(Boolean);
  const cardBg = 'rgba(255,255,255,0.75)';

  const placeOrder = () => {
    setOrderComplete({ total, items: cartCount, code: 'ORD-' + Math.floor(Math.random() * 90000 + 10000) });
    setCart([]); setCheckoutStep(null); setShowCart(false); setAppliedDiscount(0);
  };

  return React.createElement('div', { style: { minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f5f3ff 100%)', fontFamily: 'Inter, system-ui, sans-serif' } },
    toast && React.createElement('div', { style: { position: 'fixed', top: 20, right: 20, background: '#10b981', color: 'white', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: '0 8px 24px rgba(16,185,129,0.3)' } }, '✓ ' + toast),
    React.createElement('style', null, '@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}'),

    // NAV
    React.createElement('nav', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.6)', position: 'sticky', top: 0, zIndex: 50 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }, onClick: () => setView('home') },
        React.createElement('span', { style: { fontSize: 28 } }, '🛒'),
        React.createElement('span', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } }, 'Commerce OS')
      ),
      React.createElement('div', { style: { display: 'flex', gap: 24 } },
        ['home', 'shop'].map(v => React.createElement('button', { key: v, onClick: () => setView(v), style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: view === v ? 700 : 500, color: view === v ? '#E56B2D' : '#64748b' } }, v === 'home' ? 'Home' : 'Shop'))
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement('input', { value: search, onChange: e => { setSearch(e.target.value); setView('shop'); }, placeholder: 'Search products...', style: { padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.7)', width: 240, fontSize: 14, outline: 'none' } }),
        React.createElement('button', { onClick: () => { const w = products.filter(p => wishlist.includes(p.id)); if (w.length) setToast(w.length + ' items in wishlist ❤️'); }, style: { position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '8px' } }, '❤️', wishlist.length > 0 && React.createElement('span', { style: { position: 'absolute', top: 2, right: 2, background: '#ef4444', borderRadius: '50%', padding: '1px 6px', fontSize: 10, color: 'white' } }, wishlist.length)),
        React.createElement('button', { onClick: () => setShowCart(true), style: { position: 'relative', padding: '10px 20px', borderRadius: 999, background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 } }, '🛒 Cart ' + cartCount)
      )
    ),

    // HOME
    view === 'home' && React.createElement('div', null,
      React.createElement('div', { style: { padding: '60px 32px', textAlign: 'center', maxWidth: 800, margin: '0 auto' } },
        React.createElement('h1', { style: { fontSize: 48, fontWeight: 800, color: '#1e293b', marginBottom: 16, lineHeight: 1.1 } }, 'Shop Smart,', React.createElement('br', null), 'Live Better'),
        React.createElement('p', { style: { fontSize: 18, color: '#64748b', marginBottom: 32 } }, 'Discover premium products at unbeatable prices. Free shipping on orders over $50.'),
        React.createElement('button', { onClick: () => setView('shop'), style: { padding: '14px 40px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer' } }, 'Shop Now')
      ),
      React.createElement('div', { style: { padding: '0 32px 60px', maxWidth: 1200, margin: '0 auto' } },
        React.createElement('h2', { style: { fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: 24 } }, '🔥 Trending Now'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 } },
          featured.map(p => React.createElement('div', { key: p.id, onClick: () => openProduct(p), style: { background: cardBg, backdropFilter: 'blur(24px)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.6)', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.06)', animation: 'fadeIn 0.4s ease', transition: 'transform 0.2s' }, onMouseEnter: e => e.currentTarget.style.transform = 'translateY(-4px)', onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)' },
            React.createElement('div', { style: { position: 'relative' } },
              React.createElement('img', { src: p.image, style: { width: '100%', height: 200, objectFit: 'cover' } }),
              p.oldPrice > p.price && React.createElement('span', { style: { position: 'absolute', top: 8, left: 8, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#ef4444', color: 'white' } }, '-' + Math.round((1 - p.price / p.oldPrice) * 100) + '%')
            ),
            React.createElement('div', { style: { padding: 14 } },
              React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' } }, p.name),
              React.createElement(Stars, { rating: p.rating }),
              React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } },
                React.createElement('span', { style: { fontSize: 18, fontWeight: 700, color: '#E56B2D' } }, '$' + p.price.toFixed(2)),
                p.oldPrice > p.price && React.createElement('span', { style: { fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' } }, '$' + p.oldPrice.toFixed(2))
              )
            )
          ))
        )
      ),
      recentProducts.length > 0 && React.createElement('div', { style: { padding: '0 32px 60px', maxWidth: 1200, margin: '0 auto' } },
        React.createElement('h2', { style: { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 20 } }, 'Recently Viewed'),
        React.createElement('div', { style: { display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 } },
          recentProducts.map(p => React.createElement('div', { key: p.id, onClick: () => openProduct(p), style: { minWidth: 140, background: cardBg, borderRadius: 16, overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(241,245,249,0.8)' } },
            React.createElement('img', { src: p.image, style: { width: '100%', height: 120, objectFit: 'cover' } }),
            React.createElement('div', { style: { padding: 10 } },
              React.createElement('p', { style: { fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, p.name),
              React.createElement('p', { style: { fontSize: 13, fontWeight: 700, color: '#E56B2D', margin: '4px 0 0' } }, '$' + p.price.toFixed(2))
            )
          ))
        )
      )
    ),

    // SHOP
    view === 'shop' && React.createElement('div', { style: { maxWidth: 1200, margin: '0 auto', padding: '24px 32px' } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          categories.map(c => React.createElement('button', { key: c, onClick: () => setCategory(c), style: { padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: category === c ? '#E56B2D' : 'rgba(255,255,255,0.7)', color: category === c ? 'white' : '#475569' } }, c))
        ),
        React.createElement('select', { value: sortBy, onChange: e => setSortBy(e.target.value), style: { padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.7)', fontSize: 13, outline: 'none', cursor: 'pointer' } },
          [{ v: 'featured', l: 'Sort: Featured' }, { v: 'price-low', l: 'Price: Low to High' }, { v: 'price-high', l: 'Price: High to Low' }, { v: 'rating', l: 'Top Rated' }].map(o => React.createElement('option', { key: o.v, value: o.v }, o.l))
        )
      ),
      React.createElement('p', { style: { color: '#94a3b8', fontSize: 14, marginBottom: 16 } }, filteredProducts.length + ' products'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 } },
        filteredProducts.map(p => React.createElement('div', { key: p.id, style: { background: cardBg, backdropFilter: 'blur(24px)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.6)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.06)', animation: 'fadeIn 0.3s ease', transition: 'transform 0.2s' }, onMouseEnter: e => e.currentTarget.style.transform = 'translateY(-4px)', onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)' },
          React.createElement('div', { style: { position: 'relative', cursor: 'pointer' }, onClick: () => openProduct(p) },
            React.createElement('img', { src: p.image, style: { width: '100%', height: 220, objectFit: 'cover' } }),
            React.createElement('button', { onClick: e => { e.stopPropagation(); toggleWishlist(p.id); }, style: { position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 14 } }, wishlist.includes(p.id) ? '❤️' : '🤍'),
            p.oldPrice > p.price && React.createElement('span', { style: { position: 'absolute', top: 8, left: 8, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#ef4444', color: 'white' } }, '-' + Math.round((1 - p.price / p.oldPrice) * 100) + '%'),
            React.createElement('span', { style: { position: 'absolute', bottom: 8, right: 8, padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: p.stock > 5 ? '#dcfce7' : p.stock > 0 ? '#fef3c7' : '#fee2e2', color: p.stock > 5 ? '#166534' : p.stock > 0 ? '#92400e' : '#991b1b' } }, p.stock > 0 ? p.stock + ' left' : 'Sold out')
          ),
          React.createElement('div', { style: { padding: 16 } },
            React.createElement('span', { style: { fontSize: 10, color: '#E56B2D', fontWeight: 600, textTransform: 'uppercase' } }, p.category),
            React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '4px 0 2px' } }, p.name),
            React.createElement(Stars, { rating: p.rating }),
            React.createElement('span', { style: { fontSize: 12, color: '#94a3b8', marginLeft: 6 } }, p.rating + ' (' + p.reviews + ')'),
            React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 } },
              React.createElement('span', { style: { fontSize: 19, fontWeight: 700, color: '#1e293b' } }, '$' + p.price.toFixed(2)),
              p.oldPrice > p.price && React.createElement('span', { style: { fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' } }, '$' + p.oldPrice.toFixed(2))
            ),
            React.createElement('button', { onClick: () => addToCart(p.id), disabled: p.stock <= 0, style: { marginTop: 12, width: '100%', padding: '10px', borderRadius: 12, border: 'none', background: p.stock > 0 ? '#E56B2D' : '#94a3b8', color: 'white', cursor: p.stock > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 } }, p.stock > 0 ? 'Add to Cart' : 'Sold Out')
          )
        ))
      )
    ),

    // PRODUCT MODAL
    selectedProduct && React.createElement('div', { onClick: () => setSelectedProduct(null), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('div', { onClick: e => e.stopPropagation(), style: { background: 'white', borderRadius: 24, padding: 32, width: 640, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' } },
        React.createElement('div', { style: { display: 'flex', gap: 24 } },
          React.createElement('img', { src: selectedProduct.image, style: { width: 280, height: 280, borderRadius: 16, objectFit: 'cover' } }),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('span', { style: { fontSize: 11, color: '#E56B2D', fontWeight: 600, textTransform: 'uppercase' } }, selectedProduct.category),
            React.createElement('h2', { style: { fontSize: 24, fontWeight: 800, color: '#1e293b', margin: '4px 0' } }, selectedProduct.name),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } }, React.createElement(Stars, { rating: selectedProduct.rating }), React.createElement('span', { style: { fontSize: 13, color: '#94a3b8' } }, selectedProduct.rating + ' (' + selectedProduct.reviews + ' reviews)')),
            React.createElement('p', { style: { color: '#64748b', fontSize: 14, lineHeight: 1.5, margin: '8px 0 16px' } }, selectedProduct.desc),
            React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 } },
              React.createElement('span', { style: { fontSize: 30, fontWeight: 800, color: '#1e293b' } }, '$' + selectedProduct.price.toFixed(2)),
              selectedProduct.oldPrice > selectedProduct.price && React.createElement('span', { style: { fontSize: 16, color: '#94a3b8', textDecoration: 'line-through' } }, '$' + selectedProduct.oldPrice.toFixed(2)),
              React.createElement('span', { style: { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#166534' } }, 'Save $' + (selectedProduct.oldPrice - selectedProduct.price).toFixed(2))
            ),
            React.createElement('p', { style: { fontSize: 13, color: selectedProduct.stock > 0 ? '#10b981' : '#ef4444', fontWeight: 600, marginBottom: 16 } }, selectedProduct.stock > 0 ? '✓ In stock (' + selectedProduct.stock + ' available)' : '✗ Out of stock'),
            React.createElement('div', { style: { display: 'flex', gap: 12 } },
              React.createElement('button', { onClick: () => { addToCart(selectedProduct.id); setSelectedProduct(null); }, disabled: selectedProduct.stock <= 0, style: { flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: selectedProduct.stock > 0 ? 'linear-gradient(135deg, #E56B2D, #C45A26)' : '#94a3b8', color: 'white', fontSize: 15, fontWeight: 700, cursor: selectedProduct.stock > 0 ? 'pointer' : 'not-allowed' } }, 'Add to Cart'),
              React.createElement('button', { onClick: () => toggleWishlist(selectedProduct.id), style: { padding: '14px 20px', borderRadius: 14, border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontSize: 18 } }, wishlist.includes(selectedProduct.id) ? '❤️' : '🤍')
            )
          )
        )
      )
    ),

    // CART DRAWER
    showCart && React.createElement('div', { onClick: () => setShowCart(false), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 } },
      React.createElement('div', { onClick: e => e.stopPropagation(), style: { width: 420, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)', height: '100vh', padding: 28, overflowY: 'auto', display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } },
          React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } }, 'Your Cart (' + cartCount + ')'),
          React.createElement('button', { onClick: () => setShowCart(false), style: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8' } }, '✕')
        ),
        cart.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: 60, color: '#94a3b8', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, React.createElement('p', { style: { fontSize: 48 } }, '🛒'), React.createElement('p', null, 'Your cart is empty'), React.createElement('button', { onClick: () => { setShowCart(false); setView('shop'); }, style: { marginTop: 16, padding: '10px 24px', borderRadius: 999, border: 'none', background: '#E56B2D', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600 } }, 'Shop Now')) :
        React.createElement(React.Fragment, null,
          cart.map(item => React.createElement('div', { key: item.id, style: { display: 'flex', gap: 12, padding: '16px 0', borderBottom: '1px solid #f1f5f9' } },
            React.createElement('img', { src: item.image, style: { width: 64, height: 64, borderRadius: 12, objectFit: 'cover', cursor: 'pointer' }, onClick: () => { setSelectedProduct(item); setShowCart(false); } }),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('p', { style: { fontSize: 14, fontWeight: 600, color: '#1e293b', margin: 0 } }, item.name),
              React.createElement('p', { style: { fontSize: 13, color: '#64748b', margin: '2px 0 10px' } }, '$' + item.price.toFixed(2) + ' each'),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                React.createElement('button', { onClick: () => handleQty(item.id, -1), style: { width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 15 } }, '−'),
                React.createElement('span', { style: { fontWeight: 600, minWidth: 20, textAlign: 'center', color: '#1e293b' } }, item.qty),
                React.createElement('button', { onClick: () => handleQty(item.id, 1), style: { width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 15 } }, '+')
              )
            ),
            React.createElement('span', { style: { fontWeight: 700, color: '#1e293b', fontSize: 15 } }, '$' + (item.price * item.qty).toFixed(2))
          )),
          // Discount
          React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
            React.createElement('input', { value: discountCode, onChange: e => setDiscountCode(e.target.value), placeholder: 'Discount code (SAVE10)', style: { flex: 1, padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' } }),
            React.createElement('button', { onClick: applyDiscount, style: { padding: '10px 20px', borderRadius: 12, border: 'none', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 } }, 'Apply')
          ),
          React.createElement('div', { style: { borderTop: '2px solid #e2e8f0', marginTop: 16, paddingTop: 16 } },
            appliedDiscount > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } }, React.createElement('span', { style: { fontSize: 14, color: '#10b981' } }, 'Discount (' + (appliedDiscount * 100) + '%)'), React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: '#10b981' } }, '-$' + discountAmt.toFixed(2))),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } }, React.createElement('span', { style: { fontSize: 14, color: '#64748b' } }, 'Subtotal'), React.createElement('span', { style: { fontSize: 14, fontWeight: 600 } }, '$' + subtotal.toFixed(2))),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 16 } }, React.createElement('span', { style: { fontSize: 14, color: '#64748b' } }, 'Shipping'), React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: '#10b981' } }, subtotal >= 50 ? 'Free' : '$5.99')),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 20 } }, React.createElement('span', { style: { fontSize: 17, fontWeight: 700, color: '#1e293b' } }, 'Total'), React.createElement('span', { style: { fontSize: 22, fontWeight: 800, color: '#E56B2D' } }, '$' + (total + (subtotal >= 50 ? 0 : 5.99)).toFixed(2))),
            React.createElement('button', { onClick: () => { setShowCart(false); setCheckoutStep(1); }, style: { width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' } }, 'Checkout')
          )
        )
      )
    ),

    // CHECKOUT
    checkoutStep && React.createElement('div', { onClick: () => setCheckoutStep(null), style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('div', { onClick: e => e.stopPropagation(), style: { background: 'white', borderRadius: 24, padding: 36, width: 500, maxWidth: '90vw' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } },
          React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } }, checkoutStep === 1 ? 'Shipping Details' : checkoutStep === 2 ? 'Payment' : 'Review Order'),
          React.createElement('button', { onClick: () => setCheckoutStep(null), style: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8' } }, '✕')
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 24 } },
          [1, 2, 3].map(s => React.createElement('div', { key: s, style: { flex: 1, height: 4, borderRadius: 2, background: s <= checkoutStep ? '#E56B2D' : '#e2e8f0' } }))
        ),
        checkoutStep === 1 && React.createElement('div', { style: { display: 'grid', gap: 16 } },
          [{ l: 'Full Name', p: 'John Doe' }, { l: 'Email', p: 'john@email.com' }, { l: 'Address', p: '123 Main St' }, { l: 'City', p: 'New York' }, { l: 'ZIP Code', p: '10001' }].map(f => React.createElement('div', { key: f.l }, React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, f.l), React.createElement('input', { placeholder: f.p, style: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } }))),
          React.createElement('button', { onClick: () => setCheckoutStep(2), style: { width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#E56B2D', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8 } }, 'Continue to Payment')
        ),
        checkoutStep === 2 && React.createElement('div', { style: { display: 'grid', gap: 16 } },
          React.createElement('div', null, React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, 'Card Number'), React.createElement('input', { placeholder: '4242 4242 4242 4242', style: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } }))),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
            React.createElement('div', null, React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, 'Expiry'), React.createElement('input', { placeholder: 'MM/YY', style: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } }))),
            React.createElement('div', null, React.createElement('label', { style: { fontSize: 13, fontWeight: 500, color: '#475569', display: 'block', marginBottom: 6 } }, 'CVC'), React.createElement('input', { placeholder: '123', style: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' } })))
          ),
          React.createElement('div', { style: { display: 'flex', gap: 12, marginTop: 8 } },
            React.createElement('button', { onClick: () => setCheckoutStep(1), style: { flex: 1, padding: '14px', borderRadius: 14, border: '1px solid #e2e8f0', background: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' } }, 'Back'),
            React.createElement('button', { onClick: () => setCheckoutStep(3), style: { flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: '#E56B2D', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' } }, 'Review Order')
          )
        ),
        checkoutStep === 3 && React.createElement('div', null,
          React.createElement('div', { style: { background: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 16 } },
            cart.map(item => React.createElement('div', { key: item.id, style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } }, React.createElement('span', { style: { fontSize: 14, color: '#475569' } }, item.name + ' ×' + item.qty), React.createElement('span', { style: { fontSize: 14, fontWeight: 600 } }, '$' + (item.price * item.qty).toFixed(2))))
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } }, React.createElement('span', { style: { fontSize: 16, fontWeight: 700 } }, 'Total'), React.createElement('span', { style: { fontSize: 20, fontWeight: 800, color: '#E56B2D' } }, '$' + (total + (subtotal >= 50 ? 0 : 5.99)).toFixed(2))),
          React.createElement('div', { style: { display: 'flex', gap: 12, marginTop: 16 } },
            React.createElement('button', { onClick: () => setCheckoutStep(2), style: { flex: 1, padding: '14px', borderRadius: 14, border: '1px solid #e2e8f0', background: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' } }, 'Back'),
            React.createElement('button', { onClick: placeOrder, style: { flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' } }, 'Place Order')
          )
        )
      )
    ),

    // ORDER CONFIRMATION
    orderComplete && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('div', { style: { background: 'white', borderRadius: 24, padding: 40, width: 440, textAlign: 'center' } },
        React.createElement('div', { style: { fontSize: 64, marginBottom: 16 } }, '🎉'),
        React.createElement('h2', { style: { fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 8 } }, 'Order Confirmed!'),
        React.createElement('p', { style: { color: '#64748b', fontSize: 14, marginBottom: 8 } }, 'Order #' + orderComplete.code),
        React.createElement('p', { style: { color: '#64748b', fontSize: 14, marginBottom: 20 } }, 'Thank you for your purchase of ' + orderComplete.items + ' items for $' + orderComplete.total.toFixed(2)),
        React.createElement('p', { style: { color: '#94a3b8', fontSize: 13, marginBottom: 24 } }, 'A confirmation email has been sent to your inbox.'),
        React.createElement('button', { onClick: () => { setOrderComplete(null); setView('home'); }, style: { padding: '12px 32px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #E56B2D, #C45A26)', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' } }, 'Continue Shopping')
      )
    )
  );
}
ReactDOM.render(React.createElement(App), document.getElementById('root'));
`;