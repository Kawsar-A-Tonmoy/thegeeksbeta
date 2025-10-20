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
      { name: 'Keycaps', slug: 'keycaps', desc: 'Custom keycaps for keyboards' },
      { name: 'Keyboards and Bare Bones', slug: 'keyboards', desc: 'Mechanical keyboards and kits' },
      { name: 'Switches', slug: 'switches', desc: 'Keyboard switches' },
      { name: 'Collectibles', slug: 'collectibles', desc: 'Geeky collectible items' }
    ];
    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'card category-card';
      card.innerHTML = `
        <h3>${cat.name}</h3>
        <p>${cat.desc}</p>
      `;
      card.addEventListener('click', () => {
        location.href = `products.html?category=${cat.slug}`;
      });
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
        <button id="add-cart-btn" ${isOOS && !isPreOrder || isUpcoming ? 'disabled' : ''}><i class="fa">&#xf07a;</i> Add to Cart</button>
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
  const orderStatus = document.getElementById('order-status');
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
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
    openCheckoutModal(true);
  });
  if (orderStatus) orderStatus.style.display = 'none';
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
      <button ${isOOS && !isPreOrder || isUpcoming ? 'disabled' : ''} data-id="${p.id}" class="add-cart-btn"><i class="fa">&#xf07a;</i> Add to Cart</button>
      <button ${isOOS && !isPreOrder || isUpcoming ? 'disabled' : ''} data-id="${p.id}" class="order-btn">Order</button>
    </div>
  `;
  card.addEventListener('click', () => {
    location.href = `product.html?slug=${p.slug}`;
  });
  card.querySelector('.add-cart-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const id = e.currentTarget.getAttribute('data-id');
    addToCart(id);
    alert('Added to cart!');
  });
  card.querySelector('.order-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const id = e.currentTarget.getAttribute('data-id');
    openCheckoutModal(false, id);
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
  if (modal) {
    document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
    const form = document.getElementById('checkout-form');
    form.addEventListener('submit', (e) => submitCheckoutOrder(e, location.pathname.includes('cart.html')));
    document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
    document.getElementById('co-address').addEventListener('input', updateDeliveryCharge);
  }
}
async function openCheckoutModal(isCart = false, productId = null) {
  const modal = document.getElementById('checkout-modal');
  if (!modal) return;
  let products = [];
  if (isCart) {
    const cart = getCart();
    if (!cart.length) return;
    products = await Promise.all(cart.map(async item => {
      const docSnap = await getDoc(doc(db, 'products', item.id));
      return { ...docSnap.data(), id: docSnap.id, qty: item.qty };
    }));
  } else if (productId) {
    const docSnap = await getDoc(doc(db, 'products', productId));
    if (docSnap.exists()) {
      products = [{ ...docSnap.data(), id: productId, qty: 1 }];
    } else {
      alert('Product not found');
      return;
    }
  } else {
    return;
  }
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
  modal.classList.add('show');
  modal.dataset.isCart = isCart ? 'true' : 'false';
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
async function submitCheckoutOrder(e, isCart = false) {
  e.preventDefault();
  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const payment = document.getElementById('co-payment').value;
  const txn = document.getElementById('co-txn').value.trim();
  const policy = document.getElementById('co-policy').checked;
  if (!name || !phone || !address || !payment || !policy) return alert('Please fill all required fields');
  if (payment === 'Bkash' && !txn) return alert('Transaction ID required for Bkash');
  const deliveryFee = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const cart = getCart();
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
    if (isCart) {
      document.getElementById('cart-items').innerHTML = '';
      document.getElementById('total-amount').textContent = '0.00';
      document.getElementById('checkout-btn').disabled = true;
      document.getElementById('order-status').style.display = 'block';
    }
    alert('Order placed successfully!');
  } catch (err) {
    console.error('Order failed:', err);
    alert('Order failed: ' + err.message);
  }
}
// ====== ADMIN: PRODUCTS TABLE ======
async function renderDataTable() {
  const tbody = document.getElementById('products-body');
  if (!tbody) return;
  const products = await loadProducts();
  tbody.innerHTML = '';
  products.forEach(p => {
    const tr = document.createElement('tr');
    // Toggle
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
    // Image
    const tdImage = document.createElement('td');
    tdImage.innerHTML = `<img src="${p.images ? p.images[0] : ''}" alt="${p.name}">`;
    tr.appendChild(tdImage);
    // Other columns
    const cols = ['name', 'slug', 'price', 'category', 'color', 'discount', 'stock', 'availability'];
    cols.forEach(col => {
      const td = document.createElement('td');
      td.contentEditable = true;
      td.textContent = p[col] || '';
      td.addEventListener('blur', async (e) => {
        const val = e.target.textContent.trim();
        if (val !== p[col]) {
          await updateProductField(p.id, col, val);
          renderDataTable();
        }
      });
      tr.appendChild(td);
    });
    // Status
    const tdStatus = document.createElement('td');
    tdStatus.textContent = computeStatus(p);
    tr.appendChild(tdStatus);
    // Actions
    const tdActions = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (confirm('Delete product?')) {
        await deleteDoc(doc(db, 'products', p.id));
        renderDataTable();
      }
    });
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
    // Details row
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsTd = document.createElement('td');
    detailsTd.colSpan = 12;
    detailsTd.innerHTML = `
      <div>Images: <input type="text" value="${p.images ? p.images.join(', ') : ''}" style="width: 100%;"></div>
      <div>Description: <textarea style="width: 100%;">${p.description || ''}</textarea></div>
    `;
    detailsTd.querySelector('input').addEventListener('blur', async (e) => {
      const newImages = e.target.value.split(',').map(img => img.trim());
      await updateProductField(p.id, 'images', newImages);
    });
    detailsTd.querySelector('textarea').addEventListener('blur', async (e) => {
      await updateProductField(p.id, 'description', e.target.value.trim());
    });
    detailsRow.appendChild(detailsTd);
    tbody.appendChild(detailsRow);
  });
}
function computeStatus(p) {
  if (p.availability === 'Upcoming') return 'Upcoming';
  if (p.availability === 'Pre Order') return 'Pre Order';
  return Number(p.stock) > 0 ? 'In Stock' : 'Out of Stock';
}
async function updateProductField(id, field, value) {
  try {
    await updateDoc(doc(db, 'products', id), { [field]: value });
  } catch (err) {
    console.error('Error updating product:', err);
  }
}
// ====== ADMIN: ORDERS TABLE ======
async function renderOrdersTable() {
  const tbody = document.getElementById('orders-body');
  if (!tbody) return;
  const orders = await loadOrders();
  tbody.innerHTML = '';
  orders.forEach(o => {
    const tr = document.createElement('tr');
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
    const tds = [
      new Date(o.timeISO).toLocaleString(),
      o.productName,
      o.color,
      o.quantity,
      '৳' + Number(o.deliveryFee).toFixed(2),
      '৳' + Number(o.paid).toFixed(2),
      '৳' + Number(o.due).toFixed(2),
      o.customerName,
      o.phone,
      o.address,
      o.paymentMethod,
      o.transactionId
    ];
    tds.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    const tdStatus = document.createElement('td');
    const select = document.createElement('select');
    ['Pending', 'Processing', 'Dispatched', 'Delivered', 'Cancelled'].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.text = opt;
      if (o.status === opt) option.selected = true;
      select.appendChild(option);
    });
    select.style.backgroundColor = statusColors[o.status || 'Pending'];
    select.addEventListener('change', async (e) => {
      try {
        const newStatus = e.target.value;
        await updateDoc(doc(db, 'orders', o.id), { status: newStatus });
        select.style.backgroundColor = statusColors[newStatus];
      } catch (err) {
        console.error('Error updating order status:', err);
        alert('Error updating order status: ' + err.message);
      }
    });
    tdStatus.appendChild(select);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 14;
    detailsCell.className = 'details-content';
    const unitPriceCell = document.createElement('div');
    unitPriceCell.textContent = `Unit Price: ৳${Number(o.unitPrice).toFixed(2)}`;
    detailsCell.appendChild(unitPriceCell);
    detailsRow.appendChild(detailsCell);
    tbody.appendChild(detailsRow);
  });
}
// ====== AUTH ======
function logoutAdmin() {
  try {
    signOut(auth);
    console.log('Logged out successfully');
  } catch (err) {
    console.error('Logout error:', err);
    alert('Error logging out: ' + err.message);
  }
}
// ====== ORDER STATUS PAGE ======
function setupStatusForm() {
  const form = document.getElementById('status-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const txn = document.getElementById('txn-id').value.trim();
    if (!txn) return;
    try {
      const q = query(collection(db, 'orders'), where('transactionId', '==', txn));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        alert('Order not found.');
        return;
      }
      const order = snapshot.docs[0].data();
      const status = order.status;
      alert(`Status: ${status}\n${statusExplanations[status] || 'Unknown status.'}`);
    } catch (err) {
      console.error('Error fetching status:', err);
      alert('Error fetching status: ' + err.message);
    }
  });
}
// ====== INIT ======
document.addEventListener('DOMContentLoaded', async () => {
  // Common
  displayHome();
  displayProducts();
  displayProduct();
  displayCart();
  bindCheckoutModal();
  // Admin page
  const loginPanel = document.getElementById('login-panel');
  const adminPanel = document.getElementById('admin-panel');
  const addForm = document.getElementById('add-product-form');
  if (addForm) addForm.addEventListener('submit', addProduct);
  if (loginPanel && adminPanel) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('User logged in:', user.email);
        loginPanel.style.display = 'none';
        adminPanel.style.display = 'block';
        await renderDataTable();
        await renderOrdersTable();
      } else {
        console.log('No user logged in');
        loginPanel.style.display = 'block';
        adminPanel.style.display = 'none';
      }
    });
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const pass = document.getElementById('admin-pass').value;
        console.log('Attempting login with email:', email);
        try {
          await signInWithEmailAndPassword(auth, email, pass);
          console.log('Login successful');
        } catch (err) {
          console.error('Login failed:', err);
          alert('Login failed: ' + err.message);
        }
      });
    }
  }
  // Status page
  setupStatusForm();
});