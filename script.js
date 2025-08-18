import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js'; // [FIX] Added setPersistence and browserSessionPersistence
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
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

// ====== PRODUCT PAGE ======
async function displayProducts() {
  const sections = {
    new: document.getElementById('new-products'),
    hot: document.getElementById('hot-deals'),
    all: document.getElementById('all-products'),
  };
  if (!sections.all) return; // Not on product page
  Object.values(sections).forEach(el => { if (el) el.innerHTML = ''; });

  const products = await loadProducts();
  products.forEach(p => {
    if (sections.new && p.category === 'new') sections.new.appendChild(createProductCard(p));
    if (sections.hot && p.category === 'hot') sections.hot.appendChild(createProductCard(p));
    if (sections.all) sections.all.appendChild(createProductCard(p));
  });

  // Bind modal if on product page
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
    const form = document.getElementById('checkout-form');
    form.addEventListener('submit', submitCheckoutOrder);
    document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
    document.getElementById('co-qty').addEventListener('input', updateTotalInModal);
    document.getElementById('co-address').addEventListener('input', updateDeliveryCharge);
  }
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
    <img src="${p.image}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
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
      <button ${isOOS || isUpcoming ? 'disabled' : ''} data-id="${p.id}" class="order-btn">Order</button>
    </div>
  `;

  if (!isOOS && !isUpcoming) {
    card.querySelector('.order-btn').addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openCheckoutModal(id);
    });
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
  // Ensure anonymous authentication for guest users
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
      console.log('Guest signed in anonymously');
    } catch (err) {
      console.error('Anonymous sign-in failed:', err);
      alert('Error signing in as guest: ' + err.message);
      return;
    }
  }

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

  document.getElementById('co-delivery').value = `Delivery Charge = ${DELIVERY_FEE Ascending
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
    note.textContent = `Contact ${COD_NUMBER} for confirmation.`;
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
  const delivery = Number(document.getElementById('co-delivery').dataset.fee);
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
    status: 'Pending',
    userId: auth.currentUser?.uid || null // Include userId for tracking
  };

  if (!orderData.customerName || !orderData.phone || !orderData.address || !orderData.paymentMethod) {
    alert('Please fill all required fields.');
    btn.disabled = false;
    return;
  }

  if (orderData.paymentMethod === 'Bkash' && (!orderData.paymentNumber || !orderData.transactionId)) {
    alert('Please provide payment number and transaction ID for Bkash.');
    btn.disabled = false;
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'orders'), orderData);
    await updateStockAfterOrder(productId, qty);
    alert('Order placed successfully! Txn ID: ' + orderData.transactionId);
    closeCheckoutModal();
    displayProducts();
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ====== FIXED: UPDATE STOCK WITH TRANSACTION ======
async function updateStockAfterOrder(productId, qty) {
  const productRef = doc(db, 'products', productId);
  try {
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists()) {
        throw new Error("Product does not exist!");
      }

      const currentStock = Number(productDoc.data().stock) || 0;
      if (currentStock < qty) {
        throw new Error(`Not enough stock available. Only ${currentStock} left.`);
      }

      transaction.update(productRef, {
        stock: Math.floor(currentStock - qty) // Ensure stock is an integer
      });
    });
  } catch (err) {
    console.error("Error updating stock in transaction:", err);
    throw err;
  }
}

// ====== ADMIN: ADD PRODUCT ======
async function addProduct(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    name: form['add-name'].value.trim(),
    price: form['add-price'].value.trim(),
    discount: form['add-discount'].value.trim() || '0',
    image: form['add-image'].value.trim(),
    category: form['add-category'].value,
    color: form['add-color'].value.trim(),
    stock: form['add-stock'].value.trim() || '0',
    description: form['add-desc'].value.trim()
  };

  if (!data.name || !data.price || !data.image || !data.category) {
    alert('Please fill required fields.');
    return;
  }

  if (data.price !== 'TBA' && isNaN(Number(data.price))) {
    alert('Price must be a number or "TBA".');
    return;
  }

  try {
    await addDoc(collection(db, 'products'), data);
    form.reset();
    renderDataTable();
    alert('Product added successfully!');
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
    { key: 'name', editable: true },
    { key: 'price', editable: true },
    { key: 'image', editable: true },
    { key: 'category', editable: true },
    { key: 'color', editable: true },
    { key: 'discount', editable: true },
    { key: 'stock', editable: true },
    { key: 'description', editable: true }
  ];

  products.forEachElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;
  updateTotalInModal();
}

// ====== CHECKOUT MODAL FLOW ======
async function openCheckoutModal(productId) {
  // [FIX] Ensure anonymous authentication for guest users
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
      console.log('Guest signed in anonymously');
    } catch (err) {
      console.error('Anonymous sign-in failed:', err);
      alert('Error signing in as guest: ' + err.message);
      return;
    }
  }

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
  if (method === 'Bkash Steiner) {
    note.textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID.`;
    paymentNumberInput.value = BKASH_NUMBER;
  } else if (method === 'Cash on Delivery') {
    note.textContent = `Contact ${COD_NUMBER} for confirmation.`;
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
  const delivery = Number(document.getElementById('co-delivery').dataset.fee);
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
    status: 'Pending',
    userId: auth.currentUser?.uid || null // [FIX] Added userId for tracking
  };

  if (!orderData.customerName || !orderData.phone || !orderData.address || !orderData.paymentMethod) {
    alert('Please fill all required fields.');
    btn.disabled = false;
    return;
  }

  if (orderData.paymentMethod === 'Bkash' && (!orderData.paymentNumber || !orderData.transactionId)) {
    alert('Please provide payment number and transaction ID for Bkash.');
    btn.disabled = false;
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'orders'), orderData);
    await updateStockAfterOrder(productId, qty);
    alert('Order placed successfully! Txn ID: ' + orderData.transactionId);
    closeCheckoutModal();
    displayProducts();
();
  try {
    await addDoc(collection(db, 'products'), data);
    form.reset();
    renderDataTable();
    alert('Product added successfully!');
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
    { key: 'name', editable: true },
    { key: 'price', editable: true },
    { key: 'image', editable: true },
    { key: 'category', editable: true },
    { key: 'color', editable: true },
    { key: 'discount', editable: true },
    { key: 'stock', editable: true },
    { key: 'description', editable: true }
  ];

  products.forEach(p => {
    const tr = document.createElement('tr');

    cols.forEach(col => {
      const td = document.createElement('td');
      td.contentEditable = col.editable;
      td.textContent = p[col.key] || '';
      td.addEventListener('blur', async (e) => {
        const val = e.target.textContent.trim();
        if (val === p[col.key]) return;
        if (col.key === 'price' && val !== 'TBA' && isNaN(Number(val))) {
          alert('Price must be a number or "TBA".');
          e.target.textContent = p[col.key];
          return;
        }
        await updateProductField(p.id, col.key, val);
        if (col.key === 'stock' || col.key === 'price') {
          const cur = (await loadProducts()).find(x => x.id令 p.id);
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
    renderDataTable();
  } catch (err) {
    console.error('Error deleting product:', err);
    alert('Error deleting product: ' + err.message);
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

    // Status dropdown
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
    }
  });
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', async () => {
  // [FIX] Enable anonymous authentication with correct persistence
  try {
    await setPersistence(auth, browserSessionPersistence); // Updated to modular SDK
    if (!auth.currentUser) {
      await signInAnonymously(auth);
      console.log('Initialized anonymous user');
    }
  } catch (err) {
    console.error('Error initializing anonymous auth:', err);
    alert('Error initializing anonymous auth: ' + err.message); // Improved user feedback
  }

  // Common
  displayProducts();

  // Admin page
  const loginPanel = document.getElementById('login-panel');
  const adminPanel = document.getElementById('admin-panel');
  const addForm = document.getElementById('add-product-form');
  if (addForm) addForm.addEventListener('submit', addProduct);

  if (loginPanel && adminPanel) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('User logged in:', user.email || 'Anonymous');
        loginPanel.style.display = 'none';
        adminPanel.style.display = 'block';
        await renderDataTable();
        await renderOrdersTable();
      } else {
        console.log('No user logged in, signing in anonymously');
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error('Anonymous sign-in failed:', err);
          alert('Error signing in anonymously: ' + err.message);
        }
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
