import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
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

// New functions for message modal
function showMessageModal(title, text) {
  const modal = document.getElementById('message-modal');
  if (!modal) return; // Modal not present on this page
  document.querySelector('#message-modal h3').textContent = title;
  document.getElementById('message-text').innerHTML = text.replace(/\n/g, '<br>');
  modal.classList.add('show');
}

function closeMessageModal() {
  const modal = document.getElementById('message-modal');
  if (modal) modal.classList.remove('show');
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
  const address = document.getElementById('co-address').value;
  const deliveryFee = calculateDeliveryFee(address);
  document.getElementById('co-delivery').value = deliveryFee;
  updateTotalInModal();
}

function updateTotalInModal() {
  const price = Number(document.getElementById('co-price').value) || 0;
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const delivery = Number(document.getElementById('co-delivery').value) || 0;
  document.getElementById('co-total').value = (price * qty + delivery).toFixed(2);
}

function handlePaymentChange() {
  const payment = document.getElementById('co-payment').value;
  const payNumberField = document.getElementById('co-pay-number');
  payNumberField.required = payment === 'Bkash';
  payNumberField.value = payment === 'Bkash' ? '' : payNumberField.value;
}

function openCheckoutModal(id) {
  const modal = document.getElementById('checkout-modal');
  const product = products.find(p => p.id === id);
  if (!modal || !product) return;

  document.getElementById('co-name').value = product.name;
  document.getElementById('co-color').value = product.color || '-';
  document.getElementById('co-price').value = Number(product.price) || 0;
  document.getElementById('co-qty').value = 1;
  document.getElementById('co-delivery').value = DELIVERY_FEE;
  document.getElementById('co-total').value = Number(product.price) || 0;
  document.getElementById('co-customer-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-payment').value = '';
  document.getElementById('co-pay-number').value = '';
  document.getElementById('co-txn-id').value = '';
  modal.classList.add('show');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.remove('show');
}

async function submitCheckoutOrder(e) {
  e.preventDefault();
  const form = document.getElementById('checkout-form');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const productId = document.querySelector('.order-btn[data-id]:focus')?.getAttribute('data-id') || products[0]?.id;
  const product = products.find(p => p.id === productId);
  const qty = Number(document.getElementById('co-qty').value);
  const deliveryFee = Number(document.getElementById('co-delivery').value);
  const total = Number(document.getElementById('co-total').value);
  const txnId = document.getElementById('co-txn-id').value || `GEEK${Date.now()}`;

  try {
    await runTransaction(db, async (transaction) => {
      const productRef = doc(db, 'products', productId);
      const productDoc = await transaction.get(productRef);
      const productData = productDoc.data();
      if (Number(productData.stock) < qty) throw new Error('Insufficient stock');
      await transaction.update(productRef, { stock: String(Number(productData.stock) - qty) });

      const orderRef = await addDoc(collection(db, 'orders'), {
        timeISO: new Date().toISOString(),
        productName: product.name,
        color: product.color || '-',
        unitPrice: product.price,
        quantity: qty,
        deliveryFee: deliveryFee,
        total: total,
        customerName: document.getElementById('co-customer-name').value,
        phone: document.getElementById('co-phone').value,
        address: document.getElementById('co-address').value,
        paymentMethod: document.getElementById('co-payment').value,
        paymentNumber: document.getElementById('co-pay-number').value || null,
        transactionId: txnId,
        status: 'Pending'
      });
      return orderRef.id;
    });
    showMessageModal('Order Confirmation', 'Order placed successfully! Your Transaction ID is: ' + txnId);
    closeCheckoutModal();
    form.reset();
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
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
    const tds = [
      p.name,
      '৳' + Number(p.price).toFixed(2),
      p.image,
      p.category,
      p.color || '-',
      '৳' + Number(p.discount).toFixed(2),
      p.stock,
      p.description || '-',
      p.status || 'Active'
    ];
    tds.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      if (['name', 'price', 'image', 'category', 'color', 'discount', 'stock', 'description'].includes(tds.indexOf(v))) {
        td.setAttribute('contenteditable', 'true');
      }
      tr.appendChild(td);
    });

    const tdActions = document.createElement('td');
    tdActions.innerHTML = `
      <button class="secondary" onclick="updateProductById('${p.id}')">Save</button>
      <button class="danger" onclick="deleteProductById('${p.id}')">Delete</button>
    `;
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

async function updateProductById(id) {
  try {
    const tr = document.querySelector(`tr:has(button[onclick="updateProductById('${id}')"])`);
    const [name, price, image, category, color, discount, stock, description] = [...tr.querySelectorAll('td[contenteditable="true"]')].map(td => td.textContent);
    await updateDoc(doc(db, 'products', id), { name, price, image, category, color, discount, stock, description });
    renderDataTable();
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

async function addProduct(e) {
  e.preventDefault();
  const form = document.getElementById('add-product-form');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const data = {
    name: document.getElementById('ap-name').value,
    price: document.getElementById('ap-price').value,
    image: document.getElementById('ap-image').value,
    category: document.getElementById('ap-category').value,
    color: document.getElementById('ap-color').value,
    discount: document.getElementById('ap-discount').value,
    stock: document.getElementById('ap-stock').value,
    description: document.getElementById('ap-description').value,
    status: 'Active'
  };
  try {
    await addDoc(collection(db, 'products'), data);
    form.reset();
    renderDataTable();
  } catch (err) {
    console.error('Error adding product:', err);
    alert('Error adding product: ' + err.message);
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
      showMessageModal('Order Status', `Status: ${status}<br>${statusExplanations[status] || 'Unknown status.'}`);
    } catch (err) {
      console.error('Error fetching status:', err);
      alert('Error fetching status: ' + err.message);
    }
  });
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', async () => {
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

  // Bind message modal close button if present
  const closeMessageBtn = document.getElementById('close-message-btn');
  if (closeMessageBtn) {
    closeMessageBtn.onclick = closeMessageModal;
  }
});
