import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
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

/* -------------------------------------------------
   DOM HELPERS (added $$$ that was missing)
------------------------------------------------- */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);
const $$$ = sel => document.querySelectorAll(sel);

/* -------------------------------------------------
   UTIL
------------------------------------------------- */
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
function generateSlug(name, color = '') {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return color ? `${base}-${color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : base;
}
function formatPrice(price, discount = 0) {
  const final = price - discount;
  return discount > 0 ? `<s>${price}</s> ${final} tk` : `${final} tk`;
}
function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function navigate(url) {
  window.location.href = url;
}

/* -------------------------------------------------
   PRODUCT PAGE
------------------------------------------------- */
let products = [];               // keep global for card listeners
let currentProduct = null;

async function displayProducts() {
  const sections = {
    new: document.getElementById('new-products'),
    hot: document.getElementById('hot-deals'),
    all: document.getElementById('all-products'),
  };
  const path = window.location.pathname;
  products = await loadProducts();

  /* ---------- HOME ---------- */
  if (path.includes('index.html') || path === '/') {
    const interest = document.getElementById('interest-products');
    if (interest) {
      const shuffled = [...products].sort(() => 0.5 - Math.random()).slice(0, 4);
      interest.innerHTML = shuffled.map(p => createProductCard(p)).join('');
      attachCardListeners();
    }
  }
  /* ---------- CATEGORY ---------- */
  else if (path.includes('category.html')) {
    const cat = getUrlParam('cat');
    const titleMap = {
      keycaps: 'Keycaps',
      switches: 'Switches',
      'keyboard-barebones': 'Keyboard & Barebones',
      collectables: 'Collectables'
    };
    const titleEl = document.getElementById('category-title');
    if (titleEl) titleEl.textContent = titleMap[cat] || 'Category';

    const container = document.getElementById('category-products');
    if (container) {
      const filtered = products.filter(p => p.mainCategory === cat);
      container.innerHTML = filtered.map(p => createProductCard(p)).join('');
      attachCardListeners();
    }
  }
  /* ---------- PRODUCT DETAIL ---------- */
  else if (path.includes('product.html')) {
    const id = getUrlParam('id');
    if (!id) return navigate('index.html');
    currentProduct = products.find(p => p.id === id);
    if (!currentProduct) return navigate('index.html');
    renderProductDetail(currentProduct);
    attachOrderButton();
    renderRelatedProducts(products);
  }
  /* ---------- ORIGINAL PRODUCTS PAGE ---------- */
  else if (sections.all) {
    Object.values(sections).forEach(el => { if (el) el.innerHTML = ''; });
    products.forEach(p => {
      if (sections.new && p.category === 'new') sections.new.appendChild(createProductCard(p));
      if (sections.hot && p.category === 'hot') sections.hot.appendChild(createProductCard(p));
      if (sections.all) sections.all.appendChild(createProductCard(p));
    });
    attachCardListeners();
  }

  /* ---------- MODAL & VIEWER ---------- */
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
    const form = document.getElementById('checkout-form');
    form.addEventListener('submit', submitCheckoutOrder);
    document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
    document.getElementById('co-qty').addEventListener('input', updateTotalInModal);
    document.getElementById('co-address').addEventListener('input', updateDeliveryCharge);
  }
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  const closeViewer = document.getElementById('close-viewer');
  if (viewer && viewerImg && closeViewer) {
    document.querySelectorAll('.product-card img').forEach(img => {
      img.addEventListener('click', () => {
        viewerImg.src = img.src;
        viewerImg.alt = img.alt;
        viewer.classList.add('show');
      });
    });
    viewer.addEventListener('click', e => {
      if (e.target === viewer) {
        viewer.classList.remove('show');
        viewer.classList.remove('zoomed');
      }
    });
    closeViewer.addEventListener('click', () => {
      viewer.classList.remove('show');
      viewer.classList.remove('zoomed');
    });
    viewerImg.addEventListener('dblclick', () => viewer.classList.toggle('zoomed'));
  }
}

/* ---------- CARD ---------- */
function createProductCard(p) {
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const url = `product.html?id=${p.id}`;
  const btnTxt = isPreOrder ? 'Pre Order Now' : 'Order Now';

  const card = document.createElement('div');
  card.className = 'card product-card';
  card.innerHTML = `
    <a href="${url}" class="image-link">
      <img src="${p.image}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
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
      <button class="order-now-btn" data-id="${p.id}" ${isOOS || isUpcoming ? 'disabled' : ''}>${btnTxt}</button>
    </div>
  `;
  return card;
}

/* ---------- CARD LISTENERS ---------- */
function attachCardListeners() {
  $$$('.product-card .image-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    });
  });

  $$$('.order-now-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const prod = products.find(p => p.id === id);
      if (prod && !btn.disabled) openCheckoutModal(id, prod.availability === 'Pre Order');
    });
  });
}

/* ---------- PRODUCT DETAIL ---------- */
function renderProductDetail(p) {
  $('product-name').textContent = p.name;
  $('product-desc').textContent = p.description || 'No description available.';
  $('product-price').innerHTML = formatPrice(p.price, p.discount);
  $('product-availability').textContent = `Availability: ${p.availability}`;

  const btn = $('order-btn');
  btn.textContent = p.availability === 'Pre Order' ? 'Pre Order Now' : 'Order Now';

  const badges = $('product-badges');
  badges.innerHTML = '';
  if (p.category === 'new') badges.innerHTML += '<span class="badge new">New</span>';
  if (p.category === 'hot') badges.innerHTML += '<span class="badge hot">Hot</span>';
  if (p.availability === 'Pre Order') badges.innerHTML += '<span class="badge preorder">Pre Order</span>';
  if (p.availability === 'Upcoming') badges.innerHTML += '<span class="badge upcoming">Upcoming</span>';

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
function renderRelatedProducts(allProducts) {
  const container = $('related-products');
  if (!container) return;
  const related = allProducts
    .filter(p => p.id !== currentProduct.id && p.mainCategory === currentProduct.mainCategory)
    .sort(() => 0.5 - Math.random())
    .slice(0, 4);
  container.innerHTML = related.map(p => createProductCard(p)).join('');
  attachCardListeners();
}

/* ---------- DELIVERY ---------- */
function calculateDeliveryFee(address) {
  const lower = address.toLowerCase();
  if (lower.includes('savar')) return 70;
  if (lower.includes('dhaka')) return 110;
  return 150;
}
function updateDeliveryCharge() {
  const addr = document.getElementById('co-address').value.trim();
  const fee = calculateDeliveryFee(addr);
  document.getElementById('co-delivery').value = `Delivery Charge = ${fee}`;
  document.getElementById('co-delivery').dataset.fee = fee;
  updateTotalInModal();
}

/* ---------- CHECKOUT MODAL ---------- */
async function openCheckoutModal(productId, isPreOrder = false) {
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
  document.getElementById('co-payment').value = isPreOrder ? 'Bkash' : '';
  document.getElementById('co-payment').disabled = isPreOrder;
  document.getElementById('co-payment-number').value = '';
  document.getElementById('co-txn').value = '';
  document.getElementById('co-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-note').textContent = isPreOrder ? '25% advance payment is required for pre-orders.' : '';
  document.getElementById('co-policy').checked = false;
  document.getElementById('co-pay-now').style.display = 'none';
  document.getElementById('co-due-amount').style.display = 'none';
  document.getElementById('co-delivery').value = `Delivery Charge = ${DELIVERY_FEE}`;
  document.getElementById('co-delivery').dataset.fee = DELIVERY_FEE;

  updateTotalInModal();
  document.getElementById('checkout-modal').classList.add('show');
}
function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('show');
}
function handlePaymentChange() {
  const method = document.getElementById('co-payment').value;
  document.getElementById('co-payment-number').value = method === 'Bkash' ? BKASH_NUMBER : COD_NUMBER;
  updateTotalInModal();
}
function updateTotalInModal() {
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const delivery = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const total = unit * qty + delivery;
  document.getElementById('co-total').value = total.toFixed(2);

  const isPreOrder = document.getElementById('co-payment').disabled;
  const method = document.getElementById('co-payment').value;
  const payNowEl = document.getElementById('co-pay-now');
  const dueEl = document.getElementById('co-due-amount');

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
  if (!document.getElementById('co-policy').checked) return alert('You must agree to the order policy.');

  const productId = document.getElementById('co-product-id').value;
  const qty = Number(document.getElementById('co-qty').value);
  const stock = Number(document.getElementById('co-available-stock').value);
  const isPreOrder = document.getElementById('co-payment').disabled;

  if (!isPreOrder && qty > stock) return alert(`Only ${stock} in stock.`);

  const order = {
    productId,
    productName: document.getElementById('co-product-name').value,
    color: document.getElementById('co-color').value,
    quantity: qty,
    unitPrice: Number(document.getElementById('co-unit-price-raw').value),
    deliveryFee: Number(document.getElementById('co-delivery').dataset.fee),
    total: Number(document.getElementById('co-total').value),
    paid: Number(document.getElementById('co-pay-now').value) || 0,
    due: Number(document.getElementById('co-due-amount').value) || Number(document.getElementById('co-total').value),
    customerName: document.getElementById('co-name').value,
    phone: document.getElementById('co-phone').value,
    address: document.getElementById('co-address').value,
    paymentMethod: document.getElementById('co-payment').value,
    transactionId: document.getElementById('co-txn').value,
    status: 'Pending',
    timeISO: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'orders'), order);
    if (!isPreOrder) {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'products', productId);
        const snap = await tx.get(ref);
        const newStock = snap.data().stock - qty;
        tx.update(ref, { stock: newStock });
      });
    }
    alert('Order placed successfully!');
    closeCheckoutModal();
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  }
}

/* ---------- ADMIN: ADD PRODUCT ---------- */
function addProduct(e) {
  e.preventDefault();
  const imagesInput = document.getElementById('add-image').value.trim();
  const images = imagesInput.split(',').map(s => s.trim()).filter(Boolean);
  if (!images.length) return alert('Add at least one image URL');

  const product = {
    name: document.getElementById('add-name').value.trim(),
    price: parseFloat(document.getElementById('add-price').value),
    discount: parseFloat(document.getElementById('add-discount').value) || 0,
    images,
    image: images[0],
    mainCategory: document.getElementById('add-main-category').value,
    category: document.getElementById('add-category').value,
    color: document.getElementById('add-color').value.trim() || null,
    stock: parseInt(document.getElementById('add-stock').value) || 0,
    availability: document.getElementById('add-availability').value,
    description: document.getElementById('add-desc').value.trim(),
    slug: generateSlug(document.getElementById('add-name').value, document.getElementById('add-color').value),
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

/* ---------- ADMIN: PRODUCTS TABLE ---------- */
async function renderDataTable() {
  const tbody = document.getElementById('products-body');
  if (!tbody) return;
  const prods = await loadProducts();
  tbody.innerHTML = '';
  prods.forEach(p => {
    const tr = document.createElement('tr');
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = 'Down Arrow';
    tdToggle.onclick = () => {
      const details = tr.nextElementSibling;
      details.classList.toggle('show');
      tdToggle.textContent = details.classList.contains('show') ? 'Up Arrow' : 'Down Arrow';
    };
    tr.appendChild(tdToggle);

    ['name','price','category','color','discount','stock','availability'].forEach(f => {
      const td = document.createElement('td');
      td.contentEditable = true;
      td.textContent = p[f] ?? '';
      td.onblur = async () => {
        const val = td.textContent.trim();
        if (val !== String(p[f] ?? '')) await updateProductField(p.id, f, val);
      };
      tr.appendChild(td);
    });

    const tdStatus = document.createElement('td');
    tdStatus.textContent = computeStatus(p);
    tr.appendChild(tdStatus);

    const tdAct = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.onclick = () => confirm(`Delete "${p.name}"?`) && deleteProductById(p.id);
    tdAct.appendChild(del);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);

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
  try { await updateDoc(doc(db, 'products', id), { [field]: value }); }
  catch (err) { alert('Update failed: ' + err.message); }
}
async function deleteProductById(id) {
  try { await deleteDoc(doc(db, 'products', id)); renderDataTable(); }
  catch (err) { alert('Delete failed: ' + err.message); }
}

/* ---------- ADMIN: ORDERS TABLE ---------- */
async function renderOrdersTable() {
  const tbody = document.getElementById('orders-body');
  if (!tbody) return;
  const orders = await loadOrders();
  tbody.innerHTML = '';
  orders.forEach(o => {
    const tr = document.createElement('tr');
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = 'Down Arrow';
    tdToggle.onclick = () => {
      const details = tr.nextElementSibling;
      details.classList.toggle('show');
      tdToggle.textContent = details.classList.contains('show') ? 'Up Arrow' : 'Down Arrow';
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
    const sel = document.createElement('select');
    ['Pending','Processing','Dispatched','Delivered','Cancelled'].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if (o.status === s) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.style.backgroundColor = statusColors[o.status || 'Pending'];
    sel.onchange = async () => {
      await updateDoc(doc(db, 'orders', o.id), { status: sel.value });
      sel.style.backgroundColor = statusColors[sel.value];
    };
    tdStatus.appendChild(sel);
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

/* ---------- AUTH ---------- */
function logoutAdmin() {
  signOut(auth).catch(err => alert('Logout failed: ' + err.message));
}

/* ---------- STATUS PAGE ---------- */
function setupStatusForm() {
  const form = document.getElementById('status-form');
  if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const txn = document.getElementById('txn-id').value.trim();
    if (!txn) return;
    const q = query(collection(db, 'orders'), where('transactionId', '==', txn));
    const snap = await getDocs(q);
    if (snap.empty) return alert('Order not found.');
    const o = snap.docs[0].data();
    alert(`Status: ${o.status}\n${statusExplanations[o.status] || ''}`);
  };
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  displayProducts();

  const loginPanel = document.getElementById('login-panel');
  const adminPanel = document.getElementById('admin-panel');
  const addForm = document.getElementById('add-product-form');
  if (addForm) addForm.addEventListener('submit', addProduct);

  if (loginPanel && adminPanel) {
    onAuthStateChanged(auth, async user => {
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

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async e => {
        e.preventDefault();               // prevents page reload
        const email = document.getElementById('admin-email').value;
        const pass = document.getElementById('admin-pass').value;
        try {
          await signInWithEmailAndPassword(auth, email, pass);
        } catch (err) {
          alert('Login failed: ' + err.message);
        }
      });
    }
  }

  setupStatusForm();
});
