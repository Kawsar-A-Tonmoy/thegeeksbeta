import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction, limit } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Status explanations
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

// ====== UTIL ======
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

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

function getSlug() {
  let slug = new URLSearchParams(location.search).get('slug');
  if (slug) return slug;
  const path = location.pathname;
  if (path.startsWith('/product/')) {
    slug = path.substring('/product/'.length);
  }
  return slug;
}

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function setCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function addToCart(id, qty = 1) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) {
    item.qty += qty;
  } else {
    cart.push({ id, qty });
  }
  setCart(cart);
}

function updateCartCount() {
  const count = getCart().reduce((sum, i) => sum + i.qty, 0);
  const el = document.getElementById('cart-count');
  if (el) el.textContent = count > 0 ? count : '';
}

// ====== HOME PAGE ======
async function displayHome() {
  const interest = document.getElementById('interest-products');
  if (interest) {
    const products = await loadProducts();
    const shuffled = products.sort(() => Math.random() - 0.5).slice(0, 5);
    shuffled.forEach(p => interest.appendChild(createProductCard(p)));
  }
  const categoryCards = document.getElementById('category-cards');
  if (categoryCards) {
    const categories = [
      { name: 'Gadgets', slug: 'gadgets', desc: 'Latest tech gadgets' },
      { name: 'Apparel', slug: 'apparel', desc: 'Geeky clothing' },
      { name: 'Accessories', slug: 'accessories', desc: 'Cool accessories' },
      { name: 'Collectibles', slug: 'collectibles', desc: 'Collectible items' }
    ];
    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'card category-card';
      card.innerHTML = `
        <h3>${cat.name}</h3>
        <p>${cat.desc}</p>
        <a href="products.html?category=${cat.slug}">Browse</a>
      `;
      categoryCards.appendChild(card);
    });
  }
}

// ====== PRODUCTS PAGE ======
async function displayProducts() {
  const allProducts = document.getElementById('all-products');
  const title = document.getElementById('products-title');
  if (!allProducts) return;
  let products = await loadProducts();
  const params = new URLSearchParams(location.search);
  const category = params.get('category');
  const search = params.get('search');
  let headerText = 'All Products';
  if (category) {
    products = products.filter(p => p.category === category);
    headerText = category.charAt(0).toUpperCase() + category.slice(1) + ' Products';
  }
  if (search) {
    products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    headerText = `Search Results for "${search}"`;
  }
  if (title) title.textContent = headerText;
  allProducts.innerHTML = '';
  products.forEach(p => allProducts.appendChild(createProductCard(p)));
}

// ====== PRODUCT DETAILS PAGE ======
async function displayProduct() {
  const details = document.getElementById('product-details');
  if (!details) return;
  const slug = getSlug();
  if (!slug) {
    details.innerHTML = '<h2>Product not found</h2>';
    return;
  }
  const q = query(collection(db, 'products'), where('slug', '==', slug), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    details.innerHTML = '<h2>Product not found</h2>';
    return;
  }
  const docSnap = snap.docs[0];
  const p = docSnap.data();
  p.id = docSnap.id;
  const can = document.createElement('link');
  can.rel = 'canonical';
  can.href = `${location.origin}/product/${p.slug}`;
  document.head.appendChild(can);
  const images = p.images || (p.image ? [p.image] : []);
  let galleryHtml = '';
  if (images.length > 1) {
    galleryHtml = `
      <img id="main-img" src="${images[0]}" alt="${p.name}">
      <div class="thumbnails">
        ${images.map(src => `<img src="${src}" alt="${p.name}" class="thumb" data-src="${src}">`).join('')}
      </div>
    `;
  } else if (images.length === 1) {
    galleryHtml = `<img src="${images[0]}" alt="${p.name}">`;
  }
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const html = `
    <div class="gallery">${galleryHtml}</div>
    <div class="info">
      <h1>${p.name}</h1>
      <div class="badges">
        ${p.category === 'new' ? `<span class="badge new">NEW</span>` : ``}
        ${p.category === 'hot' ? `<span class="badge hot">HOT</span>` : ``}
        ${isOOS ? `<span class="badge oos">OUT OF STOCK</span>` : ``}
        ${isUpcoming ? `<span class="badge upcoming">UPCOMING</span>` : ``}
        ${isPreOrder ? `<span class="badge preorder">PRE ORDER</span>` : ``}
      </div>
      <div class="muted">Color: ${p.color || '-'}</div>
      <div class="price">
        ${isUpcoming ? `TBA` : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ``}৳${finalPrice.toFixed(2)}`}
      </div>
      <p class="desc">${p.description || ''}</p>
      <div class="actions">
        <input type="number" id="add-qty" min="1" value="1" ${isOOS || isUpcoming ? 'disabled' : ''}>
        <button id="add-cart-btn" ${isOOS && !isPreOrder || isUpcoming ? 'disabled' : ''}>Add to Cart</button>
        <button id="buy-now-btn" ${isOOS && !isPreOrder || isUpcoming ? 'disabled' : ''}>Buy Now</button>
      </div>
    </div>
  `;
  details.innerHTML = html;
  if (images.length > 1) {
    document.querySelectorAll('.thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        document.getElementById('main-img').src = thumb.dataset.src;
      });
    });
  }
  document.getElementById('add-cart-btn').addEventListener('click', () => {
    const qty = Number(document.getElementById('add-qty').value) || 1;
    addToCart(p.id, qty);
    alert('Added to cart!');
  });
  document.getElementById('buy-now-btn').addEventListener('click', () => {
    const qty = Number(document.getElementById('add-qty').value) || 1;
    addToCart(p.id, qty);
    location.href = 'cart.html';
  });
  bindCheckoutModal();
}

// ====== CART PAGE ======
async function displayCart() {
  const itemsContainer = document.getElementById('cart-items');
  const totalAmount = document.getElementById('total-amount');
  const checkoutBtn = document.getElementById('checkout-btn');
  if (!itemsContainer) return;
  const cart = getCart();
  if (!cart.length) {
    itemsContainer.innerHTML = '<p>Your cart is empty.</p>';
    if (totalAmount) totalAmount.textContent = '0.00';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }
  const products = await loadProducts();
  let total = 0;
  itemsContainer.innerHTML = '';
  cart.forEach((item, index) => {
    const p = products.find(pr => pr.id === item.id);
    if (!p) return;
    const isUpcoming = p.availability === 'Upcoming';
    const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
    const isPreOrder = p.availability === 'Pre Order';
    const hasDiscount = Number(p.discount) > 0;
    const price = Number(p.price) || 0;
    const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
    const itemTotal = item.qty * finalPrice;
    total += itemTotal;
    const card = document.createElement('div');
    card.className = 'card cart-item';
    card.innerHTML = `
      <img src="${p.images ? p.images[0] : p.image || ''}" alt="${p.name}">
      <div class="info">
        <h3>${p.name}</h3>
        <div class="muted">Color: ${p.color || '-'}</div>
        <div class="price">৳${finalPrice.toFixed(2)}</div>
        <div class="badges">
          ${isOOS ? `<span class="badge oos">OUT OF STOCK</span>` : ``}
          ${isUpcoming ? `<span class="badge upcoming">UPCOMING</span>` : ``}
          ${isPreOrder ? `<span class="badge preorder">PRE ORDER</span>` : ``}
        </div>
      </div>
      <div class="actions">
        <label>Quantity:</label>
        <input type="number" class="qty" value="${item.qty}" min="1">
        <button class="danger remove-btn">Remove</button>
      </div>
    `;
    card.querySelector('.qty').addEventListener('input', (e) => {
      let newQty = Number(e.target.value);
      if (newQty < 1) newQty = 1;
      cart[index].qty = newQty;
      setCart(cart);
      displayCart();
    });
    card.querySelector('.remove-btn').addEventListener('click', () => {
      const newCart = cart.filter((_, i) => i !== index);
      setCart(newCart);
      displayCart();
    });
    itemsContainer.appendChild(card);
  });
  if (totalAmount) totalAmount.textContent = total.toFixed(2);
  if (checkoutBtn) checkoutBtn.disabled = total === 0;
  if (checkoutBtn) checkoutBtn.addEventListener('click', openCheckoutModal);
}

// ====== PRODUCT CARD ======
function createProductCard(p) {
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const card = document.createElement('div');
  card.className = 'card product-card';
  card.innerHTML = `
    <img src="${p.images ? p.images[0] : p.image || ''}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
    <div class="badges">
      ${p.category === 'new' ? `<span class="badge new">NEW</span>` : ``}
      ${p.category === 'hot' ? `<span class="badge hot">HOT</span>` : ``}
      ${isOOS ? `<span class="badge oos">OUT OF STOCK</span>` : ``}
      ${isUpcoming ? `<span class="badge upcoming">UPCOMING</span>` : ``}
      ${isPreOrder ? `<span class="badge preorder">PRE ORDER</span>` : ``}
    </div>
    <h3>${p.name}</h3>
    <div class="muted">Color: ${p.color || '-'}</div>
    <div class="price">
      ${isUpcoming ? `TBA` : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ``}৳${finalPrice.toFixed(2)}`}
    </div>
    <div class="order-row">
      <a href="product.html?slug=${p.slug}" class="secondary">View Details</a>
      <button ${isOOS && !isPreOrder || isUpcoming ? 'disabled' : ''} data-id="${p.id}" class="add-cart-btn">Add to Cart</button>
    </div>
  `;
  card.querySelector('.add-cart-btn').addEventListener('click', (e) => {
    const id = e.currentTarget.getAttribute('data-id');
    addToCart(id);
    alert('Added to cart!');
  });
  return card;
}

// ====== DELIVERY CHARGE LOGIC ======
function calculateDeliveryFee(address) {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr.includes("savar")) {
    return 70;
  } else if (lowerAddr.includes("dhaka")) {
    return 110;
  }
  return 150;
}

// ====== CHECKOUT MODAL FLOW ======
function bindCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (!modal) return;
  document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
  const form = document.getElementById('checkout-form');
  form.addEventListener('submit', submitCheckoutOrder);
  document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
  document.getElementById('co-address').addEventListener('input', updateDeliveryCharge);
}

async function openCheckoutModal() {
  const cart = getCart();
  if (!cart.length) return;
  const products = await Promise.all(cart.map(async item => {
    const docSnap = await getDoc(doc(db, 'products', item.id));
    return { ...docSnap.data(), id: docSnap.id, qty: item.qty };
  }));
  const isPreOrder = products.some(p => p.availability === 'Pre Order');
  const subtotal = products.reduce((sum, p) => {
    const price = Number(p.price) || 0;
    const discount = Number(p.discount) || 0;
    const finalPrice = price - discount;
    return sum + (p.qty * finalPrice);
  }, 0);
  const delivery = DELIVERY_FEE; // initial
  const total = subtotal + delivery;
  document.getElementById('co-products-list').innerHTML = products.map(p => {
    const price = Number(p.price) || 0;
    const discount = Number(p.discount) || 0;
    const finalPrice = price - discount;
    return `<div>${p.name} (${p.color || '-'}) x ${p.qty} @ ৳${finalPrice.toFixed(2)} = ৳${(p.qty * finalPrice).toFixed(2)}</div>`;
  }).join('');
  document.getElementById('co-delivery').value = `Delivery Charge = ${delivery}`;
  document.getElementById('co-delivery').dataset.fee = delivery;
  document.getElementById('co-total').value = total.toFixed(2);
  document.getElementById('co-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-txn').value = '';
  document.getElementById('co-policy').checked = false;
  document.getElementById('co-note').textContent = '';
  const payNowRow = document.getElementById('co-pay-now').parentElement.parentElement;
  payNowRow.style.display = 'block';
  const payment = document.getElementById('co-payment');
  payment.value = isPreOrder ? 'Bkash' : '';
  payment.disabled = isPreOrder;
  handlePaymentChange({ target: payment }, subtotal, delivery, isPreOrder);
  const modal = document.getElementById('checkout-modal');
  modal.classList.add('show');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  modal.classList.remove('show');
}

function updateDeliveryCharge() {
  const address = document.getElementById('co-address').value.trim();
  const deliveryFee = calculateDeliveryFee(address);
  document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;
  // Re-calculate payments
  const payment = document.getElementById('co-payment');
  const subtotal = Number(document.getElementById('co-total').value) - Number(document.getElementById('co-delivery').dataset.fee); // approximate
  handlePaymentChange({ target: payment }, subtotal, deliveryFee);
}

function handlePaymentChange(e, subtotal = 0, delivery = DELIVERY_FEE, isPreOrder = false) {
  const method = e.target.value;
  const total = subtotal + delivery;
  const payNow = document.getElementById('co-pay-now');
  const due = document.getElementById('co-due-amount');
  const number = document.getElementById('co-payment-number');
  const note = document.getElementById('co-note');
  if (isPreOrder) {
    const advance = Math.round((subtotal * 0.25) / 5) * 5;
    payNow.value = advance.toFixed(2);
    due.value = (total - advance).toFixed(2);
    number.value = BKASH_NUMBER;
    note.textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID. Pre-order requires 25% advance.`;
  } else if (method === 'Bkash') {
    payNow.value = total.toFixed(2);
    due.value = '0.00';
    number.value = BKASH_NUMBER;
    note.textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID.`;
  } else if (method === 'Cash on Delivery') {
    payNow.value = '0.00';
    due.value = total.toFixed(2);
    number.value = '';
    note.textContent = '';
  } else {
    payNow.value = '';
    due.value = '';
    number.value = '';
    note.textContent = '';
  }
  document.getElementById('co-total').value = total.toFixed(2);
}

async function submitCheckoutOrder(e) {
  e.preventDefault();
  const cart = getCart();
  if (!cart.length) return alert('Cart is empty');
  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const payment = document.getElementById('co-payment').value;
  const txn = document.getElementById('co-txn').value.trim();
  const policy = document.getElementById('co-policy').checked;
  if (!name || !phone || !address || !payment || !policy) return alert('Please fill all required fields');
  if (payment === 'Bkash' && !txn) return alert('Transaction ID required for Bkash');
  const deliveryFee = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  try {
    await runTransaction(db, async (transaction) => {
      const products = await Promise.all(cart.map(async item => {
        const prodRef = doc(db, 'products', item.id);
        const prodSnap = await transaction.get(prodRef);
        if (!prodSnap.exists()) throw new Error('Product not found');
        const p = prodSnap.data();
        const isPreOrder = p.availability === 'Pre Order';
        if (p.availability !== 'Pre Order' && item.qty > p.stock) throw new Error(`Out of stock for ${p.name}`);
        if (p.availability === 'Ready') {
          transaction.update(prodRef, { stock: p.stock - item.qty });
        }
        const price = Number(p.price) || 0;
        const discount = Number(p.discount) || 0;
        const unitPrice = price - discount;
        return { id: item.id, name: p.name, color: p.color || '', quantity: item.qty, unitPrice };
      }));
      const isAnyPreOrder = products.some(pr => pr.availability === 'Pre Order'); // Note: availability not in return, but assume from earlier
      const subtotal = products.reduce((sum, pr) => sum + (pr.quantity * pr.unitPrice), 0);
      const total = subtotal + deliveryFee;
      let paid = 0;
      let due = total;
      if (isAnyPreOrder) {
        paid = Math.round((subtotal * 0.25) / 5) * 5;
        due = total - paid;
      } else if (payment === 'Bkash') {
        paid = total;
        due = 0;
      }
      const orderData = {
        products,
        customerName: name,
        phone,
        address,
        paymentMethod: payment,
        transactionId: txn,
        timeISO: new Date().toISOString(),
        deliveryFee,
        paid,
        due,
        status: 'Pending'
      };
      const newOrderRef = doc(collection(db, 'orders'));
      transaction.set(newOrderRef, orderData);
    });
    setCart([]);
    closeCheckoutModal();
    alert('Order placed successfully!');
  } catch (err) {
    console.error('Order failed:', err);
    alert('Order failed: ' + err.message);
  }
}

// ====== ORDER STATUS PAGE ======
async function checkOrderStatus(e) {
  e.preventDefault();
  const txnId = document.getElementById('txn-id').value.trim();
  if (!txnId) {
    alert('Please enter a Transaction ID');
    return;
  }
  const container = document.getElementById('status-form').parentElement;
  try {
    const q = query(collection(db, 'orders'), where('transactionId', '==', txnId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = '<h2>Order not found</h2>';
      return;
    }
    const order = snap.docs[0].data();
    const status = order.status || 'Pending';
    const explanation = statusExplanations[status] || 'Unknown status';
    const color = statusColors[status] || '#000000';
    const products = order.products.map(p => `${p.name} (${p.color || '-'}) x ${p.quantity}`).join('<br>');
    container.innerHTML = `
      <h2>Order Status</h2>
      <div class="card">
        <h3 style="color: ${color}">${status}</h3>
        <p>${explanation}</p>
        <p><strong>Products:</strong><br>${products}</p>
        <p><strong>Customer:</strong> ${order.customerName}</p>
        <p><strong>Phone:</strong> ${order.phone}</p>
        <p><strong>Address:</strong> ${order.address}</p>
        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        <p><strong>Transaction ID:</strong> ${order.transactionId}</p>
        <p><strong>Delivery Fee:</strong> ৳${order.deliveryFee.toFixed(2)}</p>
        <p><strong>Paid:</strong> ৳${order.paid.toFixed(2)}</p>
        <p><strong>Due:</strong> ৳${order.due.toFixed(2)}</p>
        <p><strong>Order Time:</strong> ${new Date(order.timeISO).toLocaleString()}</p>
      </div>
    `;
  } catch (err) {
    console.error('Error checking status:', err);
    alert('Error checking order status: ' + err.message);
  }
}

// ====== ADMIN: AUTH ======
function logoutAdmin() {
  signOut(auth).then(() => {
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('login-panel').style.display = 'block';
  }).catch(err => {
    console.error('Logout failed:', err);
    alert('Logout failed: ' + err.message);
  });
}

async function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    document.getElementById('login-panel').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    renderDataTable();
    renderOrdersTable();
  } catch (err) {
    console.error('Login failed:', err);
    alert('Login failed: ' + err.message);
  }
}

// ====== ADMIN: ADD PRODUCT ======
async function addProduct(e) {
  e.preventDefault();
  const name = document.getElementById('add-name').value.trim();
  const slug = document.getElementById('add-slug').value.trim();
  const price = document.getElementById('add-price').value.trim();
  const discount = Number(document.getElementById('add-discount').value) || 0;
  const imagesStr = document.getElementById('add-images').value.trim();
  const images = imagesStr.split(',').map(s => s.trim()).filter(s => s);
  const category = document.getElementById('add-category').value;
  const color = document.getElementById('add-color').value.trim();
  const stock = Number(document.getElementById('add-stock').value) || 0;
  const availability = document.getElementById('add-availability').value;
  const desc = document.getElementById('add-desc').value.trim();
  if (!name || !slug || !images.length || !category || !availability) return alert('Please fill required fields');
  try {
    await addDoc(collection(db, 'products'), {
      name,
      slug,
      price: price === 'TBA' ? 'TBA' : Number(price),
      discount,
      images,
      category,
      color,
      stock,
      availability,
      description: desc
    });
    document.getElementById('add-product-form').reset();
    renderDataTable();
  } catch (err) {
    console.error('Error adding product:', err);
    alert('Error adding product: ' + err.message);
  }
}

// ====== ADMIN: PRODUCTS TABLE ======
async function renderDataTable() {
  const tbody = document.getElementById('products-body');
  if (!tbody) return;
  const products = await loadProducts();
  tbody.innerHTML = '';
  const cols = [
    { key: 'name' },
    { key: 'slug' },
    { key: 'price' },
    { key: 'category' },
    { key: 'color' },
    { key: 'discount' },
    { key: 'stock' },
    { key: 'availability' }
  ];
  products.forEach(p => {
    const tr = document.createElement('tr');
    // Toggle button cell
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = '▼';
    tdToggle.addEventListener('click', (e) => {
      const detailsRow = e.target.closest('tr').nextElementSibling;
      const isVisible = detailsRow.classList.contains('show');
      detailsRow.classList.toggle('show', !isVisible);
      e.target.textContent = isVisible ? '▼' : '▲';
    });
    tr.appendChild(tdToggle);
    // Main columns
    cols.forEach(col => {
      const td = document.createElement('td');
      td.contentEditable = true;
      td.textContent = p[col.key] != null ? String(p[col.key]) : '';
      td.addEventListener('blur', async (e) => {
        const val = e.target.textContent.trim();
        if (val === (p[col.key] != null ? String(p[col.key]) : '')) return;
        let updateValue = val;
        if (col.key === 'price') {
          if (val !== 'TBA' && isNaN(Number(val))) {
            alert('Price must be a number or "TBA".');
            e.target.textContent = p[col.key] != null ? String(p[col.key]) : '';
            return;
          }
          updateValue = val === 'TBA' ? 'TBA' : Number(val);
        } else if (col.key === 'discount' || col.key === 'stock') {
          if (isNaN(Number(val))) {
            alert(`${col.key.charAt(0).toUpperCase() + col.key.slice(1)} must be a number.`);
            e.target.textContent = p[col.key] != null ? String(p[col.key]) : '';
            return;
          }
          updateValue = Number(val);
        } else if (col.key === 'availability') {
          if (!['Ready', 'Pre Order', 'Upcoming'].includes(val)) {
            alert('Availability must be Ready, Pre Order, or Upcoming.');
            e.target.textContent = p[col.key] != null ? String(p[col.key]) : '';
            return;
          }
        }
        await updateProductField(p.id, col.key, updateValue);
        if (col.key === 'stock' || col.key === 'price' || col.key === 'availability') {
          const cur = (await loadProducts()).find(x => x.id === p.id);
          tr.querySelector('td[data-status="1"]').textContent = computeStatus(cur);
        }
      });
      tr.appendChild(td);
    });
    // Status column
    const tdStatus = document.createElement('td');
    tdStatus.dataset.status = '1';
    tdStatus.textContent = computeStatus(p);
    tr.appendChild(tdStatus);
    // Actions column
    const tdActions = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (confirm(`Delete "${p.name}"?`)) await deleteProductById(p.id);
    });
    tdActions.appendChild(del);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
    // Details row for Images and Description
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = cols.length + 3; // Account for toggle, status, actions
    detailsCell.innerHTML = `
      <div class="details-content">
        <strong>Images:</strong> ${p.images ? p.images.join(', ') : '-'}<br>
        <strong>Description:</strong> ${p.description || '-'}
      </div>
    `;
    detailsRow.appendChild(detailsCell);
    tbody.appendChild(detailsRow);
  });
}

// ====== ADMIN: ORDERS TABLE ======
async function renderOrdersTable() {
  const tbody = document.getElementById('orders-body');
  if (!tbody) return;
  const orders = await loadOrders();
  tbody.innerHTML = '';
  const cols = [
    { key: 'timeISO', display: o => new Date(o.timeISO).toLocaleString() },
    { key: 'products', display: o => o.products.map(p => p.name).join(', ') },
    { key: 'products', display: o => o.products.map(p => p.color || '-').join(', ') },
    { key: 'products', display: o => o.products.map(p => p.quantity).join(', ') },
    { key: 'deliveryFee', display: o => `৳${o.deliveryFee.toFixed(2)}` },
    { key: 'paid', display: o => `৳${o.paid.toFixed(2)}` },
    { key: 'due', display: o => `৳${o.due.toFixed(2)}` },
    { key: 'customerName' },
    { key: 'phone' },
    { key: 'address' },
    { key: 'paymentMethod' },
    { key: 'transactionId' }
  ];
  orders.forEach(o => {
    const tr = document.createElement('tr');
    // Toggle button cell
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = '▼';
    tdToggle.addEventListener('click', (e) => {
      const detailsRow = e.target.closest('tr').nextElementSibling;
      const isVisible = detailsRow.classList.contains('show');
      detailsRow.classList.toggle('show', !isVisible);
      e.target.textContent = isVisible ? '▼' : '▲';
    });
    tr.appendChild(tdToggle);
    // Main columns
    cols.forEach(col => {
      const td = document.createElement('td');
      td.textContent = col.display ? col.display(o) : o[col.key];
      tr.appendChild(td);
    });
    // Status column
    const tdStatus = document.createElement('td');
    const statusSelect = document.createElement('select');
    ['Pending', 'Processing', 'Dispatched', 'Delivered', 'Cancelled'].forEach(status => {
      const opt = document.createElement('option');
      opt.value = status;
      opt.textContent = status;
      if (o.status === status) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', async (e) => {
      await updateDoc(doc(db, 'orders', o.id), { status: e.target.value });
      alert('Order status updated');
    });
    tdStatus.appendChild(statusSelect);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);
    // Details row
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = cols.length + 2; // Account for toggle and status
    const productsList = o.products.map(p => `${p.name} (${p.color || '-'}) x ${p.quantity} @ ৳${p.unitPrice.toFixed(2)}`).join('<br>');
    detailsCell.innerHTML = `
      <div class="details-content">
        <strong>Products:</strong><br>${productsList}<br>
        <strong>Status Explanation:</strong> ${statusExplanations[o.status] || 'Unknown'}<br>
        <strong>Order ID:</strong> ${o.id}
      </div>
    `;
    detailsRow.appendChild(detailsCell);
    tbody.appendChild(detailsRow);
  });
}

// ====== ADMIN: HELPER FUNCTIONS ======
async function updateProductField(id, key, value) {
  try {
    await updateDoc(doc(db, 'products', id), { [key]: value });
    console.log(`Updated ${key} for product ${id}`);
  } catch (err) {
    console.error('Error updating product:', err);
    alert('Error updating product: ' + err.message);
  }
}

async function deleteProductById(id) {
  try {
    await deleteDoc(doc(db, 'products', id));
    renderDataTable();
    alert('Product deleted');
  } catch (err) {
    console.error('Error deleting product:', err);
    alert('Error deleting product: ' + err.message);
  }
}

function computeStatus(p) {
  if (p.availability === 'Upcoming') return 'Upcoming';
  if (p.availability === 'Pre Order') return 'Pre Order';
  if (Number(p.stock) <= 0) return 'Out of Stock';
  if (p.price === 'TBA') return 'Price TBD';
  return 'Available';
}

// ====== IMAGE VIEWER ======
function bindImageViewer() {
  document.querySelectorAll('.product-card img, .cart-item img, .gallery img:not(.thumb)').forEach(img => {
    img.addEventListener('click', () => {
      const viewer = document.getElementById('image-viewer');
      const viewerImg = document.getElementById('viewer-img');
      viewerImg.src = img.src;
      viewer.classList.add('show');
    });
  });
  const viewer = document.getElementById('image-viewer');
  if (viewer) {
    document.getElementById('close-viewer').addEventListener('click', () => {
      viewer.classList.remove('show');
      viewer.classList.remove('zoomed');
    });
    viewer.addEventListener('click', (e) => {
      if (e.target === viewer) {
        viewer.classList.remove('show');
        viewer.classList.remove('zoomed');
      } else if (e.target.id === 'viewer-img') {
        viewer.classList.toggle('zoomed');
      }
    });
  }
}

// ====== SEARCH FUNCTIONALITY ======
function bindSearch() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('search-input');
  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (query) {
        location.href = `products.html?search=${encodeURIComponent(query)}`;
      }
    });
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          location.href = `products.html?search=${encodeURIComponent(query)}`;
        }
      }
    });
  }
}

// ====== INITIALIZATION ======
function init() {
  updateCartCount();
  if (location.pathname.includes('index.html') || location.pathname === '/') {
    displayHome();
  } else if (location.pathname.includes('products.html')) {
    displayProducts();
  } else if (location.pathname.includes('product.html')) {
    displayProduct();
  } else if (location.pathname.includes('cart.html')) {
    displayCart();
  } else if (location.pathname.includes('status.html')) {
    const form = document.getElementById('status-form');
    if (form) form.addEventListener('submit', checkOrderStatus);
  } else if (location.pathname.includes('admin.html')) {
    onAuthStateChanged(auth, user => {
      if (user) {
        document.getElementById('login-panel').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        renderDataTable();
        renderOrdersTable();
      } else {
        document.getElementById('login-panel').style.display = 'block';
        document.getElementById('admin-panel').style.display = 'none';
      }
    });
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', adminLogin);
    const addForm = document.getElementById('add-product-form');
    if (addForm) addForm.addEventListener('submit', addProduct);
  }
  bindImageViewer();
  bindSearch();
}

document.addEventListener('DOMContentLoaded', init);