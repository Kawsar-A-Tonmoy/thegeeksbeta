// script.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// Initialize Firebase
const app = initializeApp firebaseConfig);
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

// ====== GLOBALS ======
let currentProduct = null;
let products = [];

// ====== DOM HELPERS ======
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelector(sel);
const $$$ = (sel) => document.querySelectorAll(sel);

// ====== UTILS ======
async function loadProducts() {
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return products;
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
function generateSlug(name, color = '') {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return color ? `${base}-${color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : base;
}
function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function navigate(url) {
  window.location.href = url;
}
function formatPrice(price, discount = 0) {
  const final = price - discount;
  return discount > 0 ? `<s>${price}</s> ${final} tk` : `${final} tk`;
}

// ====== PRODUCT PAGE DISPLAY ======
async function displayProducts() {
  const path = window.location.pathname;

  if (path.includes('index.html') || path === '/') {
    // Home page
    const interestContainer = $('interest-products');
    if (!interestContainer) return;
    const shuffled = [...products].sort(() => 0.5 - Math.random()).slice(0, 4);
    interestContainer.innerHTML = shuffled.map(p => createProductCard(p)).join('');
    attachCardListeners();
  } 
  else if (path.includes('category.html')) {
    // Category page
    const cat = getUrlParam('cat');
    const filtered = products.filter(p => p.mainCategory === cat);
    const container = $('category-products');
    if (container) {
      container.innerHTML = filtered.map(p => createProductCard(p)).join('');
      attachCardListeners();
    }
  } 
  else if (path.includes('product.html')) {
    // Product detail page
    const id = getUrlParam('id');
    if (!id) return navigate('index.html');
    currentProduct = products.find(p => p.id === id);
    if (!currentProduct) return navigate('index.html');
    renderProductDetail(currentProduct);
    attachOrderButton();
    renderRelatedProducts();
  } 
  else {
    // Original products page (all, new, hot)
    const sections = {
      new: $('new-products'),
      hot: $('hot-deals'),
      all: $('all-products'),
    };
    if (!sections.all) return;
    Object.values(sections).forEach(el => { if (el) el.innerHTML = ''; });
    products.forEach(p => {
      if (sections.new && p.category === 'new') sections.new.appendChild(createProductCard(p));
      if (sections.hot && p.category === 'hot') sections.hot.appendChild(createProductCard(p));
      if (sections.all) sections.all.appendChild(createProductCard(p));
    });
  }

  // Modal bindings
  const modal = $('checkout-modal');
  if (modal) {
    $('close-modal-btn').onclick = closeCheckoutModal;
    const form = $('checkout-form');
    form.addEventListener('submit', submitCheckoutOrder);
    $('co-payment').addEventListener('change', handlePaymentChange);
    $('co-qty').addEventListener('input', updateTotalInModal);
    $('co-address').addEventListener('input', updateDeliveryCharge);
  }

  // Image viewer
  const viewer = $('image-viewer');
  const viewerImg = $('viewer-img');
  const closeViewer = $('close-viewer');
  if (viewer && viewerImg && closeViewer) {
    $$$('.product-card img').forEach(img => {
      img.addEventListener('click', () => {
        viewerImg.src = img.src;
        viewerImg.alt = img.alt;
        viewer.classList.add('show');
      });
    });
    viewer.addEventListener('click', (e) => {
      if (e.target === viewer) {
        viewer.classList.remove('show');
        viewer.classList.remove('zoomed');
      }
    });
    closeViewer.addEventListener('click', () => {
      viewer.classList.remove('show');
      viewer.classList.remove('zoomed');
    });
    viewerImg.addEventListener('dblclick', () => {
      viewer.classList.toggle('zoomed');
    });
  }
}

// ====== PRODUCT CARD ======
function createProductCard(p) {
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const images = p.images || [p.image];
  const url = `product.html?id=${p.id}`;
  const buttonText = isPreOrder ? 'Pre Order Now' : 'Order Now';

  const card = document.createElement('div');
  card.className = 'card product-card';
  card.innerHTML = `
    <a href="${url}" class="image-link">
      <img src="${images[0]}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
    </a>
    <div class="badges">
      ${p.category === 'new' ? `<span class="badge new">NEW</span>` : ''}
      ${p.category === 'hot' ? `<span class="badge hot">HOT</span>` : ''}
      ${isOOS ? `<span class="badge oos">OUT OF STOCK</span>` : ''}
      ${isUpcoming ? `<span class="badge upcoming">UPCOMING</span>` : ''}
      ${isPreOrder ? `<span class="badge preorder">PRE ORDER</span>` : ''}
    </div>
    <h3>${p.name}</h3>
    <div class="muted">Color: ${p.color || '-'}</div>
    <div class="price">
      ${isUpcoming ? `TBA` : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ''}৳${finalPrice.toFixed(2)}`}
    </div>
    <p class="desc">${p.description || ''}</p>
    <div class="order-row">
      <button class="order-now-btn" data-id="${p.id}" ${isOOS || isUpcoming ? 'disabled' : ''}>${buttonText}</button>
    </div>
  `;
  return card;
}

function attachCardListeners() {
  // Image → product page
  $$$('.product-card .image-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    });
  });

  // Order button
  $$$('.order-now-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const prod = products.find(p => p.id === id);
      if (prod && !btn.disabled) {
        openCheckoutModal(prod.id, prod.availability === 'Pre Order');
      }
    });
  });
}

// ====== PRODUCT DETAIL PAGE ======
function renderProductDetail(p) {
  $('product-name').textContent = p.name;
  $('product-desc').textContent = p.description || 'No description available.';
  $('product-price').innerHTML = formatPrice(p.price, p.discount);
  $('product-availability').textContent = `Availability: ${p.availability}`;

  const btn = $('order-btn');
  btn.textContent = p.availability === 'Pre Order' ? 'Pre Order Now' : 'Order Now';

  // Badges
  const badges = $('product-badges');
  badges.innerHTML = '';
  if (p.category === 'new') badges.innerHTML += '<span class="badge new">New</span>';
  if (p.category === 'hot') badges.innerHTML += '<span class="badge hot">Hot</span>';
  if (p.availability === 'Pre Order') badges.innerHTML += '<span class="badge preorder">Pre Order</span>';
  if (p.availability === 'Upcoming') badges.innerHTML += '<span class="badge upcoming">Upcoming</span>';

  // Images
  const images = p.images || [p.image];
  $('featured-img').src = images[0];
  const thumbs = $('thumbnails');
  thumbs.innerHTML = images.map((img, i) => `
    <img src="${img}" alt="Thumb ${i+1}" ${i===0 ? 'class="active"' : ''}>
  `).join('');
  thumbs.querySelectorAll('img').forEach((thumb, i) => {
    thumb.onclick = () => {
      $('featured-img').src = images[i];
      $$$('.thumbnails img').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    };
  });
}

function attachOrderButton() {
  $('order-btn').onclick = () => openCheckoutModal(currentProduct.id, currentProduct.availability === 'Pre Order');
}

function renderRelatedProducts() {
  const container = $('related-products');
  if (!container) return;
  const related = products
    .filter(p => p.id !== currentProduct.id && p.mainCategory === currentProduct.mainCategory)
    .sort(() => 0.5 - Math.random())
    .slice(0, 4);
  container.innerHTML = related.map(p => createProductCard(p)).join('');
  attachCardListeners();
}

// ====== DELIVERY CHARGE ======
function calculateDeliveryFee(address) {
  const lower = address.toLowerCase();
  if (lower.includes('savar')) return 70;
  if (lower.includes('dhaka')) return 110;
  return 150;
}
function updateDeliveryCharge() {
  const addr = $('co-address').value.trim();
  const fee = calculateDeliveryFee(addr);
  $('co-delivery').value = `Delivery Charge = ${fee}`;
  $('co-delivery').dataset.fee = fee;
  updateTotalInModal();
}

// ====== CHECKOUT MODAL ======
async function openCheckoutModal(productId, isPreOrder = false) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  const price = p.price === 'TBA' ? 0 : Number(p.price) || 0;
  const discount = Number(p.discount) || 0;
  const unit = price - discount;

  $('co-product-id').value = p.id;
  $('co-product-name').value = p.name;
  $('co-color').value = p.color || '';
  $('co-price').value = unit.toFixed(2);
  $('co-unit-price-raw').value = unit.toString();
  $('co-available-stock').value = String(p.stock);
  $('co-qty').value = 1;
  $('co-qty').max = p.stock;
  $('co-payment').value = isPreOrder ? 'Bkash' : '';
  $('co-payment').disabled = isPreOrder;
  $('co-payment-number').value = '';
  $('co-txn').value = '';
  $('co-name').value = '';
  $('co-phone').value = '';
  $('co-address').value = '';
  $('co-note').textContent = isPreOrder ? '25% advance payment required.' : '';
  $('co-policy').checked = false;
  $('co-pay-now').style.display = 'none';
  $('co-due-amount').style.display = 'none';
  $('co-delivery').value = `Delivery Charge = ${DELIVERY_FEE}`;
  $('co-delivery').dataset.fee = DELIVERY_FEE;

  updateTotalInModal();
  $('checkout-modal').classList.add('show');
}
function closeCheckoutModal() {
  $('checkout-modal').classList.remove('show');
}
function handlePaymentChange() {
  const method = $('co-payment').value;
  $('co-payment-number').value = method === 'Bkash' ? BKASH_NUMBER : COD_NUMBER;
  updateTotalInModal();
}
function updateTotalInModal() {
  const qty = Number($('co-qty').value) || 1;
  const unit = Number($('co-unit-price-raw').value) || 0;
  const delivery = Number($('co-delivery').dataset.fee) || DELIVERY_FEE;
  const total = unit * qty + delivery;
  $('co-total').value = total.toFixed(2);

  const isPreOrder = $('co-payment').disabled;
  const method = $('co-payment').value;
  const payNowEl = $('co-pay-now');
  const dueEl = $('co-due-amount');

  if (isPreOrder || method === 'Bkash') {
    payNowEl.style.display = 'block';
    dueEl.style.display = 'block';
    const payNow = isPreOrder ? total * 0.25 : total;
    const due = total - payNow;
    payNowEl.value = payNow.toFixed(2);
    dueEl.value = due.toFixed(2);
  } else {
    payNowEl.style.display = 'none';
    dueEl.style.display = 'none';
  }
}
async function submitCheckoutOrder(e) {
  e.preventDefault();
  if (!$('co-policy').checked) return alert('You must agree to the policy.');

  const productId = $('co-product-id').value;
  const qty = Number($('co-qty').value);
  const stock = Number($('co-available-stock').value);
  const isPreOrder = $('co-payment').disabled;

  if (!isPreOrder && qty > stock) return alert(`Only ${stock} in stock.`);

  const order = {
    productId,
    productName: $('co-product-name').value,
    color: $('co-color').value,
    quantity: qty,
    unitPrice: Number($('co-unit-price-raw').value),
    deliveryFee: Number($('co-delivery').dataset.fee),
    total: Number($('co-total').value),
    paid: Number($('co-pay-now').value) || 0,
    due: Number($('co-due-amount').value) || Number($('co-total').value),
    customerName: $('co-name').value,
    phone: $('co-phone').value,
    address: $('co-address').value,
    paymentMethod: $('co-payment').value,
    transactionId: $('co-txn').value,
    status: 'Pending',
    timeISO: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'orders'), order);
    if (!isPreOrder) {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'products', productId);
        const snap = await tx.get(ref);
        const newStock = snap.data().stock - qty;
        tx.update(ref, { stock: newStock });
      });
    }
    alert('Order placed!');
    closeCheckoutModal();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ====== ADMIN: ADD PRODUCT ======
function addProduct(e) {
  e.preventDefault();
  const imagesInput = $('add-image').value.trim();
  const images = imagesInput.split(',').map(s => s.trim()).filter(Boolean);
  if (!images.length) return alert('Add at least one image URL');

  const product = {
    name: $('add-name').value.trim(),
    price: parseFloat($('add-price').value),
    discount: parseFloat($('add-discount').value) || 0,
    images,
    image: images[0],
    mainCategory: $('add-main-category').value,
    category: $('add-category').value,
    color: $('add-color').value.trim() || null,
    stock: parseInt($('add-stock').value) || 0,
    availability: $('add-availability').value,
    description: $('add-desc').value.trim(),
    slug: generateSlug($('add-name').value, $('add-color').value),
    timestamp: serverTimestamp()
  };

  addDoc(collection(db, 'products'), product)
    .then(() => {
      alert('Product added!');
      e.target.reset();
      renderDataTable();
    })
    .catch(err => alert('Error: ' + err.message));
}

// ====== ADMIN: PRODUCTS TABLE ======
async function renderDataTable() {
  const tbody = $('products-body');
  if (!tbody) return;
  await loadProducts();
  tbody.innerHTML = '';
  products.forEach(p => {
    const tr = document.createElement('tr');
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = '▼';
    tdToggle.onclick = () => {
      const row = tr.nextElementSibling;
      row.classList.toggle('show');
      tdToggle.textContent = row.classList.contains('show') ? '▲' : '▼';
    };
    tr.appendChild(tdToggle);

    ['name', 'price', 'category', 'color', 'discount', 'stock', 'availability'].forEach(field => {
      const td = document.createElement('td');
      td.contentEditable = true;
      td.textContent = p[field] ?? '';
      td.onblur = async () => {
        const val = td.textContent.trim();
        if (val !== String(p[field] ?? '')) {
          await updateProductField(p.id, field, val);
        }
      };
      tr.appendChild(td);
    });

    const tdStatus = document.createElement('td');
    tdStatus.textContent = computeStatus(p);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => confirm(`Delete "${p.name}"?`) && deleteProductById(p.id);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);

    // Details row
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 10;
    detailsCell.className = 'details-content';

    const imgDiv = document.createElement('div');
    imgDiv.contentEditable = true;
    imgDiv.textContent = p.image || '';
    imgDiv.onblur = () => updateProductField(p.id, 'image', imgDiv.textContent.trim());

    const descDiv = document.createElement('div');
    descDiv.contentEditable = true;
    descDiv.textContent = p.description || '';
    descDiv.onblur = () => updateProductField(p.id, 'description', descDiv.textContent.trim());

    detailsCell.innerHTML = `<strong>Image URL:</strong> `;
    detailsCell.appendChild(imgDiv);
    detailsCell.innerHTML += `<br><strong>Description:</strong> `;
    detailsCell.appendChild(descDiv);
    detailsRow.appendChild(detailsCell);
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
    alert('Update failed: ' + err.message);
  }
}
async function deleteProductById(id) {
  try {
    await deleteDoc(doc(db, 'products', id));
    renderDataTable();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ====== ADMIN: ORDERS TABLE ======
async function renderOrdersTable() {
  const tbody = $('orders-body');
  if (!tbody) return;
  const orders = await loadOrders();
  tbody.innerHTML = '';
  orders.forEach(o => {
    const tr = document.createElement('tr');
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = '▼';
    tdToggle.onclick = () => {
      const row = tr.nextElementSibling;
      row.classList.toggle('show');
      tdToggle.textContent = row.classList.contains('show') ? '▲' : '▼';
    };
    tr.appendChild(tdToggle);

    const fields = [
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
    fields.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });

    const tdStatus = document.createElement('td');
    const select = document.createElement('select');
    ['Pending', 'Processing', 'Dispatched', 'Delivered', 'Cancelled'].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if (o.status === s) opt.selected = true;
      select.appendChild(opt);
    });
    select.style.backgroundColor = statusColors[o.status || 'Pending'];
    select.onchange = async () => {
      await updateDoc(doc(db, 'orders', o.id), { status: select.value });
      select.style.backgroundColor = statusColors[select.value];
    };
    tdStatus.appendChild(select);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 14;
    detailsCell.innerHTML = `Unit Price: ৳${Number(o.unitPrice).toFixed(2)}`;
    detailsRow.appendChild(detailsCell);
    tbody.appendChild(detailsRow);
  });
}

// ====== ADMIN: AUTH ======
function logoutAdmin() {
  signOut(auth).catch(err => alert('Logout failed: ' + err.message));
}

// ====== STATUS PAGE ======
function setupStatusForm() {
  const form = $('status-form');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const txn = $('txn-id').value.trim();
    if (!txn) return;
    const q = query(collection(db, 'orders'), where('transactionId', '==', txn));
    const snap = await getDocs(q);
    if (snap.empty) return alert('Order not found.');
    const o = snap.docs[0].data();
    alert(`Status: ${o.status}\n${statusExplanations[o.status] || ''}`);
  };
}

// ====== EDIT MODAL (stub – implement UI as needed) ======
window.openEditModal = (id) => {
  const p = products.find(x => x.id === id);
  if (!p) return;
  $('edit-id').value = p.id;
  $('edit-name').value = p.name;
  $('edit-price').value = p.price;
  $('edit-discount').value = p.discount || 0;
  $('edit-image').value = (p.images || [p.image]).join(', ');
  $('edit-main-category').value = p.mainCategory;
  $('edit-category').value = p.category;
  $('edit-color').value = p.color || '';
  $('edit-stock').value = p.stock || 0;
  $('edit-availability').value = p.availability;
  $('edit-desc').value = p.description || '';
  $('edit-modal').classList.add('show');
};

// ====== INIT ======
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  displayProducts();

  const loginPanel = $('login-panel');
  const adminPanel = $('admin-panel');
  const addForm = $('add-product-form');

  if (addForm) addForm.onsubmit = addProduct;

  if (loginPanel && adminPanel) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        loginPanel.style.display = 'none';
        adminPanel.style.display = 'block';
        await renderDataTable();
        await renderOrdersTable();
      } else {
        loginPanel.style.display = 'block';
        adminPanel.style.display = 'none';
      }
    });

    const loginForm = $('login-form');
    if (loginForm) {
      loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = $('admin-email').value;
        const pass = $('admin-pass').value;
        try {
          await signInWithEmailAndPassword(auth, email, pass);
        } catch (err) {
          alert('Login failed: ' + err.message);
        }
      };
    }
  }

  setupStatusForm();
});
