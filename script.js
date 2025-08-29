import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction, limit, startAfter, endBefore } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
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
    const snapshot = await getDocs(query(collection(db, 'products'), orderBy('name')));
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

// ====== PRODUCT PAGE ======
async function initProducts() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('product');
  const sectionsContainer = document.querySelector('.product-sections');
  const detailContainer = document.getElementById('product-detail');

  if (slug) {
    const q = query(collection(db, 'products'), where('slug', '==', slug));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const p = { id: snap.docs[0].id, ...snap.docs[0].data() };
      renderProductDetail(p);
      if (sectionsContainer) sectionsContainer.style.display = 'none';
      detailContainer.style.display = 'block';

      // Add canonical tag
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = `${location.origin}/product/${slug}`;
      document.head.appendChild(link);

      // Update title
      document.title = `${p.name} | The Geek Shop`;
    } else {
      showProductList();
    }
  } else {
    showProductList();
  }
}

function showProductList() {
  const sectionsContainer = document.querySelector('.product-sections');
  const detailContainer = document.getElementById('product-detail');
  if (sectionsContainer) sectionsContainer.style.display = 'block';
  detailContainer.style.display = 'none';
  document.title = 'Products | The Geek Shop';
  loadAndDisplayProductList();
}

async function loadAndDisplayProductList() {
  const sections = {
    new: document.getElementById('new-products'),
    hot: document.getElementById('hot-deals'),
    all: document.getElementById('all-products'),
  };
  if (!sections.all) return;
  Object.values(sections).forEach(el => { if (el) el.innerHTML = ''; });

  const products = await loadProducts();
  products.forEach(p => {
    if (sections.new && p.category === 'new') sections.new.appendChild(createProductCard(p));
    if (sections.hot && p.category === 'hot') sections.hot.appendChild(createProductCard(p));
    if (sections.all) sections.all.appendChild(createProductCard(p));
  });
}

function renderProductDetail(p) {
  const isUpcoming = p.price === 'TBA';
  const isOOS = !isUpcoming && Number(p.stock) <= 0;
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;

  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-color').textContent = p.color || '-';
  document.getElementById('detail-desc').textContent = p.description || '';
  document.getElementById('detail-price').innerHTML = isUpcoming ? 'TBA' : (hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : '') + `৳${finalPrice.toFixed(2)}`;

  const badges = document.getElementById('detail-badges');
  badges.innerHTML = '';
  if (p.category === 'new') badges.innerHTML += `<span class="badge new">NEW</span>`;
  if (p.category === 'hot') badges.innerHTML += `<span class="badge hot">HOT</span>`;
  if (isOOS) badges.innerHTML += `<span class="badge oos">OUT OF STOCK</span>`;
  if (isUpcoming) badges.innerHTML += `<span class="badge upcoming">UPCOMING</span>`;

  const mainImage = document.getElementById('main-image');
  mainImage.src = p.featuredImage || '';
  mainImage.alt = p.name;

  const thumbnails = document.querySelector('.thumbnails');
  thumbnails.innerHTML = '';
  (p.images || []).forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = p.name;
    img.onclick = () => { mainImage.src = url; };
    thumbnails.appendChild(img);
  });

  const orderBtn = document.getElementById('detail-order-btn');
  orderBtn.disabled = isOOS || isUpcoming;
  orderBtn.onclick = () => openCheckoutModal(p.id);

  document.getElementById('back-to-list').onclick = () => {
    history.pushState({}, '', 'index.html');
    showProductList();
  };
}

function createProductCard(p) {
  const isUpcoming = p.price === 'TBA';
  const isOOS = !isUpcoming && Number(p.stock) <= 0;
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;

  const card = document.createElement('div');
  card.className = 'card product-card';
  card.innerHTML = `
    <img src="${p.featuredImage || ''}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
    <div class="badges">
      ${p.category === 'new' ? `<span class="badge new">NEW</span>` : ``}
      ${p.category === 'hot' ? `<span class="badge hot">HOT</span>` : ``}
      ${isOOS ? `<span class="badge oos">OUT OF STOCK</span>` : ``}
      ${isUpcoming ? `<span class="badge upcoming">UPCOMING</span>` : ``}
    </div>
    <h3>${p.name}</h3>
    <div class="muted">Color: ${p.color || '-'}</div>
    <div class="price">
      ${isUpcoming ? `TBA` : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ``}৳${finalPrice.toFixed(2)}`}
    </div>
    <p class="desc">${p.description || ''}</p>
    <div class="order-row">
      <button class="view-details-btn">View Details</button>
      <button ${isOOS || isUpcoming ? 'disabled' : ''} class="order-btn">Order</button>
    </div>
  `;

  card.querySelector('.view-details-btn').addEventListener('click', () => {
    history.pushState({ product: p.slug }, '', `?product=${p.slug}`);
    renderProductDetail(p);
    document.querySelector('.product-sections').style.display = 'none';
    document.getElementById('product-detail').style.display = 'block';
  });

  if (!isOOS && !isUpcoming) {
    card.querySelector('.order-btn').addEventListener('click', () => openCheckoutModal(p.id));
  }

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

function updateDeliveryCharge() {
  const address = document.getElementById('co-address').value.trim();
  const deliveryFee = calculateDeliveryFee(address);
  document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;
  updateTotalInModal();
}

// ====== CHECKOUT MODAL FLOW ======
async function openCheckoutModal(productId) {
  const products = await loadProducts();
  const p = products.find(x => x.id === productId);
  if (!p) return;

  const price = p.price === 'TBA' ? 0 : Number(p.price) || 0;
  const discount = Number(p.discount) || 0;
  const unit = price - discount;

  document.getElementById('co-product-id').value = p.id;
  document.getElementById('co-product-name').value = p.name;
  document.getElementById('co-color').value = p.color || '';
  document.getElementById('co-price').value = unit.toFixed(2);
  document.getElementById('co-unit-price-raw').value = unit.toString();
  document.getElementById('co-available-stock').value = String(p.stock);
  document.getElementById('co-qty').value = 1;
  document.getElementById('co-qty').max = p.stock;
  document.getElementById('co-payment').value = '';
  document.getElementById('co-payment-number').value = '';
  document.getElementById('co-txn').value = '';
  document.getElementById('co-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-note').textContent = '';

  document.getElementById('co-delivery').value = `Delivery Charge = ${DELIVERY_FEE}`;
  document.getElementById('co-delivery').dataset.fee = DELIVERY_FEE;

  updateTotalInModal();

  const modal = document.getElementById('checkout-modal');
  modal.classList.add('show');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  modal.classList.remove('show');
}

function updateTotalInModal() {
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const delivery = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const total = (qty * unit) + delivery;
  document.getElementById('co-total').value = total.toFixed(2);
}

function handlePaymentChange(e) {
  const method = e.target.value;
  const note = document.getElementById('co-note');
  const paymentNumberInput = document.getElementById('co-payment-number');
  if (method === 'Bkash') {
    note.textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID.`;
    paymentNumberInput.value = BKASH_NUMBER;
  } else if (method === 'Cash on Delivery') {
    note.textContent = `Send the delivery charge to ${COD_NUMBER} and provide transaction ID.`;
    paymentNumberInput.value = COD_NUMBER;
  } else {
    note.textContent = '';
    paymentNumberInput.value = '';
  }
}

async function submitCheckoutOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;

  const productId = document.getElementById('co-product-id').value;
  const qty = Number(document.getElementById('co-qty').value);
  const available = Number(document.getElementById('co-available-stock').value);

  if (!productId) {
    alert('Product ID is missing.');
    btn.disabled = false;
    return;
  }
  if (qty <= 0) {
    alert('Quantity must be at least 1.');
    btn.disabled = false;
    return;
  }
  if (qty > available) {
    alert(`Quantity exceeds available stock of ${available}.`);
    btn.disabled = false;
    return;
  }

  const unit = Number(document.getElementById('co-unit-price-raw').value);
  if (isNaN(unit)) {
    alert('Invalid unit price.');
    btn.disabled = false;
    return;
  }
  const delivery = Number(document.getElementById('co-delivery').dataset.fee);
  if (isNaN(delivery)) {
    alert('Invalid delivery fee.');
    btn.disabled = false;
    return;
  }
  const total = (qty * unit) + delivery;

  const orderData = {
    timeISO: new Date().toISOString(),
    productId,
    productName: document.getElementById('co-product-name').value,
    color: document.getElementById('co-color').value,
    unitPrice: unit,
    quantity: qty,
    deliveryFee: delivery,
    total,
    customerName: document.getElementById('co-name').value.trim(),
    phone: document.getElementById('co-phone').value.trim(),
    address: document.getElementById('co-address').value.trim(),
    paymentMethod: document.getElementById('co-payment').value,
    paymentNumber: document.getElementById('co-payment-number').value.trim(),
    transactionId: document.getElementById('co-txn').value.trim().toUpperCase(),
    status: 'Pending'
  };

  console.log('Order Data:', orderData);

  if (!orderData.customerName || !orderData.phone || !orderData.address || !orderData.paymentMethod) {
    alert('Please fill all required fields.');
    btn.disabled = false;
    return;
  }

  try {
    const productRef = doc(db, 'products', orderData.productId);
    await runTransaction(db, async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) throw new Error('Product not found');
      const newStock = productSnap.data().stock - orderData.quantity;
      if (newStock < 0) throw new Error('Insufficient stock');

      console.log('New Stock:', newStock);

      transaction.update(productRef, { stock: Number(newStock) });

      const orderRef = doc(collection(db, 'orders'));
      transaction.set(orderRef, orderData);
    });

    alert('Order placed successfully! Txn ID: ' + orderData.transactionId);
    closeCheckoutModal();
    initProducts();
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ====== ADMIN: ADD PRODUCT ======
async function addProduct(e) {
  e.preventDefault();
  const form = e.target;
  const stockStr = form['add-stock'].value.trim() || '0';
  const discountStr = form['add-discount'].value.trim() || '0';
  const priceStr = form['add-price'].value.trim();
  const name = form['add-name'].value.trim();

  if (isNaN(Number(stockStr))) {
    alert('Stock must be a number.');
    return;
  }
  if (isNaN(Number(discountStr))) {
    alert('Discount must be a number.');
    return;
  }

  const featuredImage = form['add-featured-image'].value.trim();
  const image2 = form['add-image2'].value.trim();
  const image3 = form['add-image3'].value.trim();
  const images = [featuredImage];
  if (image2) images.push(image2);
  if (image3) images.push(image3);

  let baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let slug = baseSlug;
  let count = 1;
  while (true) {
    const q = query(collection(db, 'products'), where('slug', '==', slug));
    const snap = await getDocs(q);
    if (snap.empty) break;
    slug = `${baseSlug}-${++count}`;
  }

  const data = {
    name,
    price: priceStr === 'TBA' ? 'TBA' : Number(priceStr),
    discount: Number(discountStr),
    featuredImage,
    images,
    category: form['add-category'].value,
    color: form['add-color'].value.trim(),
    stock: Number(stockStr),
    description: form['add-desc'].value.trim(),
    slug
  };

  if (!data.name || (typeof data.price === 'undefined' || data.price === null) || !data.featuredImage || !data.category) {
    alert('Please fill required fields.');
    return;
  }

  if (data.price !== 'TBA' && isNaN(data.price)) {
    alert('Price must be a number or "TBA".');
    return;
  }

  try {
    await addDoc(collection(db, 'products'), data);
    form.reset();
    renderDataTable('init');
    alert('Product added successfully!');
  } catch (err) {
    console.error('Error adding product:', err);
    alert('Error adding product: ' + err.message);
  }
}

// ====== ADMIN: PRODUCTS TABLE ======
let productsFirstDoc = null;
let productsLastDoc = null;
let productsHasPrev = false;
let productsHasNext = false;

async function renderDataTable(direction = 'init') {
  const tbody = document.getElementById('products-body');
  if (!tbody) return;

  const pageSize = 20;
  let q = query(collection(db, 'products'), orderBy('name'), limit(pageSize));

  if (direction === 'next' && productsLastDoc) {
    q = query(collection(db, 'products'), orderBy('name'), startAfter(productsLastDoc), limit(pageSize));
  } else if (direction === 'prev' && productsFirstDoc) {
    q = query(collection(db, 'products'), orderBy('name'), endBefore(productsFirstDoc), limit(pageSize));
  }

  const snap = await getDocs(q);
  const docs = snap.docs;

  if (docs.length === 0) return;

  productsFirstDoc = docs[0];
  productsLastDoc = docs[docs.length - 1];
  productsHasNext = docs.length === pageSize;
  if (direction === 'init') {
    productsHasPrev = false;
  } else if (direction === 'next') {
    productsHasPrev = true;
  } else if (direction === 'prev') {
    productsHasPrev = docs.length === pageSize;
  }

  document.getElementById('prev-products').disabled = !productsHasPrev;
  document.getElementById('next-products').disabled = !productsHasNext;

  tbody.innerHTML = '';

  const cols = [
    { key: 'name', editable: true },
    { key: 'price', editable: true },
    { key: 'featuredImage', editable: true },
    { key: 'images', editable: true },
    { key: 'category', editable: true },
    { key: 'color', editable: true },
    { key: 'discount', editable: true },
    { key: 'stock', editable: true },
    { key: 'description', editable: true }
  ];

  const products = docs.map(d => ({ id: d.id, ...d.data() }));
  products.forEach(p => {
    const tr = document.createElement('tr');

    cols.forEach(col => {
      const td = document.createElement('td');
      td.contentEditable = col.editable;
      if (col.key === 'images') {
        td.textContent = p.images ? p.images.join(', ') : '';
      } else {
        td.textContent = p[col.key] != null ? p[col.key] : '';
      }
      td.addEventListener('blur', async (e) => {
        let val = e.target.textContent.trim();
        if (val === (col.key === 'images' ? (p.images ? p.images.join(', ') : '') : (p[col.key] != null ? String(p[col.key]) : ''))) return;

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
        } else if (col.key === 'images') {
          updateValue = val.split(',').map(s => s.trim()).filter(Boolean);
        }

        await updateProductField(p.id, col.key, updateValue);
        if (col.key === 'stock' || col.key === 'price') {
          const cur = (await getDoc(doc(db, 'products', p.id))).data();
          tr.querySelector('td[data-status="1"]').textContent = computeStatus(cur);
        }
      });
      tr.appendChild(td);
    });

    const tdStatus = document.createElement('td');
    tdStatus.dataset.status = '1';
    tdStatus.textContent = computeStatus(p);
    tr.appendChild(tdStatus);

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
  });
}

function computeStatus(p) { 
  if (p.price === 'TBA') return 'Upcoming';
  return Number(p.stock) > 0 ? 'In Stock' : 'Out of Stock'; 
}

async function updateProductField(id, field, value) {
  try {
    await updateDoc(doc(db, 'products', id), { [field]: value });
  } catch (err) {
    console.error('Error updating product:', err);
    alert('Error updating product: ' + err.message);
  }
}

async function deleteProductById(id) {
  try {
    await deleteDoc(doc(db, 'products', id));
    renderDataTable('init');
  } catch (err) {
    console.error('Error deleting product:', err);
    alert('Error deleting product: ' + err.message);
  }
}

// ====== ADMIN: ORDERS TABLE ======
let ordersFirstDoc = null;
let ordersLastDoc = null;
let ordersHasPrev = false;
let ordersHasNext = false;

async function renderOrdersTable(direction = 'init') {
  const tbody = document.getElementById('orders-body');
  if (!tbody) return;

  const pageSize = 20;
  let q = query(collection(db, 'orders'), orderBy('timeISO', 'desc'), limit(pageSize));

  if (direction === 'next' && ordersLastDoc) {
    q = query(collection(db, 'orders'), orderBy('timeISO', 'desc'), startAfter(ordersLastDoc), limit(pageSize));
  } else if (direction === 'prev' && ordersFirstDoc) {
    q = query(collection(db, 'orders'), orderBy('timeISO', 'desc'), endBefore(ordersFirstDoc), limit(pageSize));
  }

  const snap = await getDocs(q);
  const docs = snap.docs;

  if (docs.length === 0) return;

  ordersFirstDoc = docs[0];
  ordersLastDoc = docs[docs.length - 1];
  ordersHasNext = docs.length === pageSize;
  if (direction === 'init') {
    ordersHasPrev = false;
  } else if (direction === 'next') {
    ordersHasPrev = true;
  } else if (direction === 'prev') {
    ordersHasPrev = docs.length === pageSize;
  }

  document.getElementById('prev-orders').disabled = !ordersHasPrev;
  document.getElementById('next-orders').disabled = !ordersHasNext;

  tbody.innerHTML = '';

  const orders = docs.map(d => ({ id: d.id, ...d.data() }));
  orders.forEach(o => {
    const tr = document.createElement('tr');
    const tds = [
      new Date(o.timeISO).toLocaleString(),
      o.productName,
      o.color,
      '৳' + Number(o.unitPrice).toFixed(2),
      o.quantity,
      '৳' + Number(o.deliveryFee).toFixed(2),
      '৳' + Number(o.total).toFixed(2),
      o.customerName,
      o.phone,
      o.address,
      o.paymentMethod,
      o.paymentNumber,
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
  initProducts();
  window.addEventListener('popstate', initProducts);

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
        await renderDataTable('init');
        await renderOrdersTable('init');
        document.getElementById('prev-products').addEventListener('click', () => renderDataTable('prev'));
        document.getElementById('next-products').addEventListener('click', () => renderDataTable('next'));
        document.getElementById('prev-orders').addEventListener('click', () => renderOrdersTable('prev'));
        document.getElementById('next-orders').addEventListener('click', () => renderOrdersTable('next'));
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

  const modal = document.getElementById('checkout-modal');
  if (modal) {
    document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
    const form = document.getElementById('checkout-form');
    form.addEventListener('submit', submitCheckoutOrder);
    document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
    document.getElementById('co-qty').addEventListener('input', updateTotalInModal);
    document.getElementById('co-address').addEventListener('input', updateDeliveryCharge);
  }

  setupStatusForm();
});