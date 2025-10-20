import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

const { createElement: h } = React;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const statusExplanations = {
  Pending: 'Order received, waiting for processing.',
  Processing: 'Your order is being prepared.',
  Dispatched: 'Your order has been shipped.',
  Delivered: 'Your order has been delivered.',
  Cancelled: 'Your order has been cancelled.'
};
const statusColors = {
  Pending: '#eab308',
  Processing: '#3b82f6',
  Dispatched: '#eab308',
  Delivered: '#22c55e',
  Cancelled: '#ef4444'
};

async function loadProducts() {
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Error loading products:', err);
    return [];
  }
}

async function loadOrders() {
  try {
    const q = query(collection(db, 'orders'), orderBy('timeISO', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Error loading orders:', err);
    return [];
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function addToCart(productId, quantity = 1, isPreOrder = false) {
  const cart = getCart();
  const existingItem = cart.find(item => item.productId === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({ productId, quantity, isPreOrder });
  }
  saveCart(cart);
  alert('Product added to cart!');
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.productId !== productId);
  saveCart(cart);
}

function updateCartItemQuantity(productId, quantity) {
  const cart = getCart();
  const item = cart.find(item => item.productId === productId);
  if (item) {
    item.quantity = Math.max(1, Number(quantity));
    saveCart(cart);
  }
}

function updateCartCount() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartCounts = document.querySelectorAll('#cart-count');
  cartCounts.forEach(el => {
    el.textContent = count;
    el.classList.toggle('show', count > 0);
  });
}

function CartItem({ item, product, onQuantityChange, onRemove }) {
  const isUpcoming = product.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(product.stock) <= 0 && product.availability !== 'Pre Order';
  const isPreOrder = product.availability === 'Pre Order';
  const hasDiscount = Number(product.discount) > 0;
  const price = Number(product.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(product.discount)) : price;
  const images = product.images && product.images.length > 0 ? product.images : [product.image || ''];
  const subtotal = finalPrice * item.quantity;

  return h('div', { className: 'cart-item card' }, [
    h('img', { 
      src: images[0], 
      alt: product.name, 
      onError: (e) => { e.target.src = ''; e.target.alt = 'Image not available'; }
    }),
    h('div', { className: 'details' }, [
      h('h3', { className: 'text-lg font-medium' }, product.name),
      h('div', { className: 'muted' }, `Color: ${product.color || '-'}`),
      h('div', { className: 'price' }, isUpcoming ? 'TBA' : `${hasDiscount ? h('s', null, `৳${price.toFixed(2)}`) + ' ' : ''}৳${finalPrice.toFixed(2)}`),
      h('div', { className: 'muted' }, `Subtotal: ৳${subtotal.toFixed(2)}`)
    ]),
    h('div', { className: 'controls' }, [
      h('input', { 
        type: 'number', 
        min: 1, 
        max: isPreOrder ? undefined : product.stock, 
        value: item.quantity, 
        className: 'qty', 
        onChange: (e) => onQuantityChange(product.id, e.target.value),
        disabled: isOOS || isUpcoming
      }),
      h('button', { 
        className: 'danger', 
        onClick: () => onRemove(product.id),
        disabled: isOOS || isUpcoming
      }, 'Remove')
    ])
  ]);
}

async function displayCart() {
  const container = document.getElementById('cart-items');
  const summary = document.getElementById('cart-total');
  if (!container || !summary) return;
  const cart = getCart();
  const products = await loadProducts();
  const cartItems = cart.map(item => ({
    ...item,
    product: products.find(p => p.id === item.productId)
  })).filter(item => item.product);
  let total = 0;
  cartItems.forEach(item => {
    const p = item.product;
    const price = Number(p.price) || 0;
    const discount = Number(p.discount) || 0;
    const finalPrice = price - discount;
    total += finalPrice * item.quantity;
  });
  ReactDOM.render(
    h('div', { className: 'grid gap-4' }, cartItems.length ? cartItems.map(item => 
      h(CartItem, { 
        item, 
        product: item.product, 
        key: item.productId,
        onQuantityChange: updateCartItemQuantity,
        onRemove: removeFromCart
      })
    ) : h('p', null, 'Your cart is empty.')
    ),
    container
  );
  summary.textContent = `Total: ৳${total.toFixed(2)}`;
  const checkoutBtn = document.getElementById('checkout-cart-btn');
  if (checkoutBtn) {
    checkoutBtn.disabled = cartItems.length === 0;
  }
}

function ProductCard({ p }) {
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const images = p.images && p.images.length > 0 ? p.images : [p.image || ''];
  const url = `product.html?id=${p.id}&name=${encodeURIComponent(p.name)}${p.color ? `-${encodeURIComponent(p.color)}` : ''}`;

  return h('div', { className: 'card product-card' }, [
    h('a', { href: url }, [
      h('img', { src: images[0], alt: p.name, className: 'w-full h-40 object-cover rounded-lg', onError: (e) => { e.target.src = ''; e.target.alt = 'Image not available'; } })
    ]),
    h('div', { className: 'badges flex gap-2' }, [
      p.category === 'new' ? h('span', { className: 'badge new' }, 'NEW') : null,
      p.category === 'hot' ? h('span', { className: 'badge hot' }, 'HOT') : null,
      isOOS ? h('span', { className: 'badge oos' }, 'OUT OF STOCK') : null,
      isUpcoming ? h('span', { className: 'badge upcoming' }, 'UPCOMING') : null,
      isPreOrder ? h('span', { className: 'badge preorder' }, 'PRE ORDER') : null
    ]),
    h('h3', { className: 'text-lg font-medium' }, p.name),
    h('div', { className: 'muted' }, `Color: ${p.color || '-'}`),
    h('div', { className: 'price' }, isUpcoming ? 'TBA' : `${hasDiscount ? h('s', null, `৳${price.toFixed(2)}`) + ' ' : ''}৳${finalPrice.toFixed(2)}`),
    h('div', { className: 'order-row flex gap-2 items-center mt-2' }, [
      isPreOrder ? h('button', { className: 'preorder-btn bg-purple-600 text-white px-4 py-2 rounded-lg', onClick: () => addToCart(p.id, 1, true) }, 'Add to Cart (Pre Order)') :
      h('button', { disabled: isOOS || isUpcoming, 'data-id': p.id, className: 'order-btn bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50', onClick: () => addToCart(p.id) }, 'Add to Cart')
    ])
  ]);
}

async function displayInterestProducts() {
  const container = document.getElementById('interest-products');
  if (!container) return;
  const products = await loadProducts();
  const shuffled = shuffleArray([...products]).slice(0, 5);
  ReactDOM.render(
    h('div', { className: 'flex animate-scroll' }, [...shuffled.map(p => h(ProductCard, { p, key: p.id + '-1' })), ...shuffled.map(p => h(ProductCard, { p, key: p.id + '-2' }))]),
    container
  );
}

async function displayProducts() {
  const container = document.getElementById('category-products');
  const title = document.getElementById('category-title');
  if (!container || !title) return;
  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get('cat');
  const searchQuery = urlParams.get('search')?.toLowerCase();
  title.textContent = searchQuery ? `Search Results for "${urlParams.get('search')}"` : category ? `${category.charAt(0).toUpperCase() + category.slice(1)} Products` : 'All Products';
  const products = await loadProducts();
  const filtered = products.filter(p => {
    let match = true;
    if (category) {
      if (category === 'preorder') match = match && p.availability === 'Pre Order';
      else if (category === 'upcoming') match = match && p.availability === 'Upcoming';
      else match = match && p.category === category;
    }
    if (searchQuery) {
      match = match && (p.name.toLowerCase().includes(searchQuery) || p.description?.toLowerCase().includes(searchQuery) || p.color?.toLowerCase().includes(searchQuery));
    }
    return match;
  });
  ReactDOM.render(
    h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' }, filtered.map(p => h(ProductCard, { p, key: p.id }))),
    container
  );
}

async function displayProductDetail() {
  const container = document.getElementById('product-detail');
  if (!container) return;
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  if (!id) return;
  const docRef = doc(db, 'products', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return;
  const p = { id: docSnap.id, ...docSnap.data() };
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const images = p.images && p.images.length > 0 ? p.images : [p.image || ''];
  
  document.title = `${p.name} - The Geek Shop`;
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = `${window.location.origin}/product.html?id=${p.id}&name=${encodeURIComponent(p.name)}${p.color ? `-${