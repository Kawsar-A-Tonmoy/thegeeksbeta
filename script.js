import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
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
  const products = await loadProducts();
  const p = products.find(x => x.id === productId);
  if (!p) return;

  const price = p.price === 'TBA' ? 0 : Number(p.price) || 0;
  const discount = Number(p.discount) || 0;
  const finalPrice = discount > 0 ? (price - discount) : price;

  document.getElementById('co-product').textContent = p.name;
  document.getElementById('co-color').textContent = p.color || '-';
  document.getElementById('co-price').textContent = `৳${finalPrice.toFixed(2)}`;
  document.getElementById('co-qty').value = 1;
  document.getElementById('co-qty').max = p.stock || 1;
  document.getElementById('co-delivery').value = `Delivery Charge = ${DELIVERY_FEE}`;
  document.getElementById('co-delivery').dataset.fee = DELIVERY_FEE;
  document.getElementById('co-total').textContent = `৳${(finalPrice + DELIVERY_FEE).toFixed(2)}`;
  document.getElementById('co-product-id').value = p.id;

  document.getElementById('checkout-modal').classList.add('show');
}

async function submitCheckoutOrder(e) {
  e.preventDefault();

  const productId = document.getElementById('co-product-id').value;
  const quantity = Number(document.getElementById('co-qty').value);
  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const paymentMethod = document.getElementById('co-payment').value;
  const paymentNumber = document.getElementById('co-pay-number').value.trim();
  const transactionId = document.getElementById('co-txn-id').value.trim();

  if (!name || !phone || !address || !paymentMethod) {
    alert('Please fill all required fields.');
    return;
  }

  const products = await loadProducts();
  const product = products.find(p => p.id === productId);
  if (!product || product.stock < quantity) {
    alert('Insufficient stock or product not found.');
    return;
  }

  const deliveryFee = Number(document.getElementById('co-delivery').dataset.fee);
  const price = Number(product.price) || 0;
  const discount = Number(product.discount) || 0;
  const finalPrice = discount > 0 ? (price - discount) : price;
  const total = (finalPrice * quantity) + deliveryFee;

  try {
    const docRef = await addDoc(collection(db, 'orders'), {
      productName: product.name,
      color: product.color || '-',
      unitPrice: finalPrice,
      quantity: quantity,
      deliveryFee: deliveryFee,
      total: total,
      customerName: name,
      phone: phone,
      address: address,
      paymentMethod: paymentMethod,
      paymentNumber: paymentNumber || '',
      transactionId: transactionId || '',
      status: 'Pending',
      timeISO: new Date().toISOString()
    });

    // Update stock in products collection
    const newStock = Number(product.stock) - quantity;
    await updateDoc(doc(db, 'products', productId), { stock: newStock });

    alert('Order placed successfully! Transaction ID: ' + docRef.id);
    closeCheckoutModal();
    displayProducts(); // Refresh product display
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  }
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('show');
  document.getElementById('checkout-form').reset();
}

function handlePaymentChange(e) {
  const payNumber = document.getElementById('co-pay-number');
  payNumber.required = e.target.value !== 'Cash on Delivery';
  payNumber.value = e.target.value === 'Cash on Delivery' ? '' : payNumber.value;
  updateTotalInModal();
}

function updateTotalInModal() {
  const price = Number(document.getElementById('co-price').textContent.replace('৳', '')) || 0;
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const deliveryFee = Number(document.getElementById('co-delivery').dataset.fee) || 0;
  const total = (price * qty) + deliveryFee;
  document.getElementById('co-total').textContent = `৳${total.toFixed(2)}`;
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
      '৳' + (Number(p.price) || 0).toFixed(2),
      p.image,
      p.category || '-',
      p.color || '-',
      '৳' + (Number(p.discount) || 0).toFixed(2),
      p.stock || 0,
      p.description || ''
    ];
    tds.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      if (['name', 'price', 'image', 'category', 'color', 'discount', 'stock', 'description'].includes(tds.indexOf(v))) {
        td.setAttribute('contenteditable', 'true');
        td.addEventListener('blur', (e) => {
          const field = ['name', 'price', 'image', 'category', 'color', 'discount', 'stock', 'description'][tds.indexOf(v)];
          updateProductField(p.id, field, e.target.textContent);
        });
      }
      tr.appendChild(td);
    });

    const tdActions = document.createElement('td');
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      tds.forEach((_, i) => {
        if (i < tds.length - 1) tr.children[i].setAttribute('contenteditable', 'true');
      });
    });
    tdActions.appendChild(edit);

    const del = document.createElement('button');
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
});
