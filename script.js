// script.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global state
let currentUser = null;
let products = [];
let currentProduct = null;

// DOM Elements
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelector(selector);
const $$$ = (selector) => document.querySelectorAll(selector);

// Utility: Generate URL slug
function generateSlug(name, color = '') {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return color ? `${base}-${color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : base;
}

// Utility: Format price
function formatPrice(price, discount = 0) {
  const final = price - discount;
  return discount > 0 ? `<s>${price}</s> ${final} tk` : `${final} tk`;
}

// Utility: Get URL params
function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Utility: Navigate
function navigate(url) {
  window.location.href = url;
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (window.location.pathname.includes('admin.html')) {
      initAdmin();
    }
  });

  // Common modals
  if ($('close-modal-btn')) {
    $('close-modal-btn').onclick = () => $('#checkout-modal').classList.remove('show');
  }
  if ($('close-edit-btn')) {
    $('close-edit-btn').onclick = () => $('#edit-modal').classList.remove('show');
  }

  // Page-specific init
  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    await loadHomePage();
  } else if (window.location.pathname.includes('category.html')) {
    await loadCategoryPage();
  } else if (window.location.pathname.includes('product.html')) {
    await loadProductPage();
  } else if (window.location.pathname.includes('admin.html')) {
    initAdmin();
  } else if (window.location.pathname.includes('status.html')) {
    initStatusPage();
  }
});

// ======================
// ADMIN PANEL
// ======================
function initAdmin() {
  const loginPanel = $('#login-panel');
  const adminPanel = $('#admin-panel');

  if (currentUser) {
    loginPanel.style.display = 'none';
    adminPanel.style.display = 'block';
    loadAdminProducts();
    loadAdminOrders();
  } else {
    loginPanel.style.display = 'block';
    adminPanel.style.display = 'none';
  }

  // Prevent form submit refresh
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#admin-email').value;
    const pass = $('#admin-pass').value;
    signInWithEmailAndPassword(auth, email, pass)
      .then(() => {
        // onAuthStateChanged will handle UI
      })
      .catch((err) => {
        alert('Login failed: ' + err.message);
      });
  });

  $('#logout-btn').onclick = () => {
    signOut(auth).then(() => {
      // onAuthStateChanged will handle UI
    });
  };

  $('#add-product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const imagesInput = $('#add-image').value.trim();
    const images = imagesInput.split(',').map(url => url.trim()).filter(Boolean);
    if (images.length === 0) return alert('Add at least one image URL');

    const product = {
      name: $('#add-name').value.trim(),
      price: parseFloat($('#add-price').value),
      discount: parseFloat($('#add-discount').value) || 0,
      images: images,
      image: images[0],
      mainCategory: $('#add-main-category').value,
      category: $('#add-category').value,
      color: $('#add-color').value.trim() || null,
      stock: parseInt($('#add-stock').value) || 0,
      availability: $('#add-availability').value,
      description: $('#add-desc').value.trim(),
      slug: generateSlug($('#add-name').value, $('#add-color').value),
      timestamp: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'products'), product);
      alert('Product added!');
      e.target.reset();
      loadAdminProducts();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  $('#edit-product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#edit-id').value;
    const imagesInput = $('#edit-image').value.trim();
    const images = imagesInput.split(',').map(url => url.trim()).filter(Boolean);

    const updated = {
      name: $('#edit-name').value.trim(),
      price: parseFloat($('#edit-price').value),
      discount: parseFloat($('#edit-discount').value) || 0,
      images: images,
      image: images[0],
      mainCategory: $('#edit-main-category').value,
      category: $('#edit-category').value,
      color: $('#edit-color').value.trim() || null,
      stock: parseInt($('#edit-stock').value) || 0,
      availability: $('#edit-availability').value,
      description: $('#edit-desc').value.trim(),
      slug: generateSlug($('#edit-name').value, $('#edit-color').value)
    };

    try {
      await updateDoc(doc(db, 'products', id), updated);
      alert('Product updated!');
      $('#edit-modal').classList.remove('show');
      loadAdminProducts();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

async function loadAdminProducts() {
  await loadProducts();
  const tbody = $('#products-body');
  tbody.innerHTML = products.map(p => {
    const images = p.images || [p.image];
    return `
      <tr>
        <td><img src="${images[0]}" width="40" style="border-radius:4px"></td>
        <td>${p.name}</td>
        <td>${formatPrice(p.price, p.discount)}</td>
        <td>${p.mainCategory}</td>
        <td>${p.category}</td>
        <td>${p.color || '-'}</td>
        <td>${p.discount}</td>
        <td>${p.stock}</td>
        <td>${p.availability}</td>
        <td>
          <button onclick="openEditModal('${p.id}')" class="secondary">Edit</button>
          <button onclick="deleteProduct('${p.id}')" class="danger">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openEditModal = async (id) => {
  const product = products.find(p => p.id === id);
  if (!product) return;

  $('#edit-id').value = product.id;
  $('#edit-name').value = product.name;
  $('#edit-price').value = product.price;
  $('#edit-discount').value = product.discount || 0;
  $('#edit-image').value = (product.images || [product.image]).join(', ');
  $('#edit-main-category').value = product.mainCategory;
  $('#edit-category').value = product.category;
  $('#edit-color').value = product.color || '';
  $('#edit-stock').value = product.stock || 0;
  $('#edit-availability').value = product.availability;
  $('#edit-desc').value = product.description || '';

  $('#edit-modal').classList.add('show');
};

window.deleteProduct = async (id) => {
  if (confirm('Delete this product?')) {
    await deleteDoc(doc(db, 'products', id));
    loadAdminProducts();
  }
};

async function loadAdminOrders() {
  const snapshot = await getDocs(query(collection(db, 'orders'), orderBy('timestamp', 'desc')));
  const tbody = $('#orders-body');
  tbody.innerHTML = snapshot.docs.map(d => {
    const o = d.data();
    return `
      <tr>
        <td>${d.id.slice(0, 8)}</td>
        <td>${new Date(o.timestamp?.toDate()).toLocaleString()}</td>
        <td>${o.productName}</td>
        <td>${o.color}</td>
        <td>${o.qty}</td>
        <td>${o.payNow}</td>
        <td>${o.due}</td>
        <td>${o.customerName}</td>
        <td>${o.phone}</td>
        <td>
          <select onchange="updateOrderStatus('${d.id}', this.value)">
            <option ${o.status==='Pending'?'selected':''}>Pending</option>
            <option ${o.status==='Processing'?'selected':''}>Processing</option>
            <option ${o.status==='Shipped'?'selected':''}>Shipped</option>
            <option ${o.status==='Delivered'?'selected':''}>Delivered</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

window.updateOrderStatus = async (id, status) => {
  await updateDoc(doc(db, 'orders', id), { status });
};

// ======================
// HOME / CATEGORY / PRODUCT
// ======================
async function loadHomePage() {
  await loadProducts();
  renderInterestProducts();
}

function renderInterestProducts() {
  const container = $('interest-products');
  if (!container) return;
  const shuffled = [...products].sort(() => 0.5 - Math.random()).slice(0, 4);
  container.innerHTML = shuffled.map(p => createProductCard(p)).join('');
  attachCardListeners();
}

async function loadCategoryPage() {
  const cat = getUrlParam('cat');
  $('category-title').textContent = {
    'keycaps': 'Keycaps',
    'switches': 'Switches',
    'keyboard-barebones': 'Keyboard & Barebones',
    'collectables': 'Collectables'
  }[cat] || 'Category';

  await loadProducts();
  const filtered = products.filter(p => p.mainCategory === cat);
  $('category-products').innerHTML = filtered.map(p => createProductCard(p)).join('');
  attachCardListeners();
}

async function loadProductPage() {
  const id = getUrlParam('id');
  if (!id) return navigate('index.html');
  await loadProducts();
  currentProduct = products.find(p => p.id === id);
  if (!currentProduct) return navigate('index.html');

  renderProductDetail(currentProduct);
  attachOrderButton();
  renderRelatedProducts();
}

function renderProductDetail(product) {
  $('product-name').textContent = product.name;
  $('product-desc').textContent = product.description || 'No description available.';
  $('product-price').innerHTML = formatPrice(product.price, product.discount);
  $('product-availability').textContent = `Availability: ${product.availability}`;

  // Dynamic button text
  const btn = $('order-btn');
  btn.textContent = product.availability === 'Pre Order' ? 'Pre Order Now' : 'Order Now';

  // Badges
  const badges = $('product-badges');
  badges.innerHTML = '';
  if (product.category === 'new') badges.innerHTML += '<span class="badge new">New</span>';
  if (product.category === 'hot') badges.innerHTML += '<span class="badge hot">Hot</span>';
  if (product.availability === 'Pre Order') badges.innerHTML += '<span class="badge preorder">Pre Order</span>';
  if (product.availability === 'Upcoming') badges.innerHTML += '<span class="badge upcoming">Upcoming</span>';

  // Images
  const images = product.images || [product.image];
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

function attachOrderButton() {
  $('order-btn').onclick = () => openCheckoutModal(currentProduct);
}

// ======================
// PRODUCT CARD
// ======================
function createProductCard(product) {
  const images = product.images || [product.image];
  const url = `product.html?id=${product.id}`;
  const buttonText = product.availability === 'Pre Order' ? 'Pre Order Now' : 'Order Now';

  return `
    <div class="card product-card">
      <a href="${url}" class="image-link">
        <img src="${images[0]}" alt="${product.name}" loading="lazy">
      </a>
      <div class="badges">
        ${product.category === 'new' ? '<span class="badge new">New</span>' : ''}
        ${product.category === 'hot' ? '<span class="badge hot">Hot</span>' : ''}
        ${product.availability === 'Pre Order' ? '<span class="badge preorder">Pre Order</span>' : ''}
        ${product.availability === 'Upcoming' ? '<span class="badge upcoming">Upcoming</span>' : ''}
      </div>
      <div class="price">${formatPrice(product.price, product.discount)}</div>
      <p class="name">${product.name}</p>
      ${product.color ? `<p class="muted">Color: ${product.color}</p>` : ''}
      <button class="order-now-btn" onclick="event.stopPropagation(); openCheckoutFromCard('${product.id}')">${buttonText}</button>
    </div>
  `;
}

function attachCardListeners() {
  $$$('.product-card .image-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    });
  });
}

window.openCheckoutFromCard = (id) => {
  const product = products.find(p => p.id === id);
  if (product) openCheckoutModal(product);
};

// ======================
// CHECKOUT MODAL
// ======================
function openCheckoutModal(product) {
  currentProduct = product;
  const modal = $('#checkout-modal');
  const form = $('checkout-form');

  $('co-product-id').value = product.id;
  $('co-product-name').value = product.name;
  $('co-color').value = product.color || 'N/A';
  $('co-unit-price-raw').value = product.price - (product.discount || 0);
  $('co-available-stock').value = product.stock || 0;

  const updateTotal = () => {
    const qty = parseInt($('co-qty').value) || 1;
    const unit = parseFloat($('co-unit-price-raw').value);
    const total = unit * qty + DELIVERY_FEE;
    $('co-price').value = `${unit} tk`;
    $('co-delivery').value = `${DELIVERY_FEE} tk`;
    $('co-total').value = `${total} tk`;

    const payMethod = $('co-payment').value;
    if (payMethod === 'Bkash') {
      $('co-pay-now').value = `${total} tk`;
      $('co-due-amount').value = '0 tk';
      $('co-payment-number').value = BKASH_NUMBER;
    } else if (payMethod === 'Cash on Delivery') {
      $('co-pay-now').value = '0 tk';
      $('co-due-amount').value = `${total} tk`;
      $('co-payment-number').value = COD_NUMBER;
    }
  };

  $('co-qty').oninput = updateTotal;
  $('co-payment').onchange = () => {
    $('co-payment-number').value = $('co-payment').value === 'Bkash' ? BKASH_NUMBER : COD_NUMBER;
    updateTotal();
  };

  updateTotal();
  modal.classList.add('show');

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!$('co-policy').checked) return alert('Please agree to the policy.');

    const order = {
      productId: product.id,
      productName: product.name,
      color: product.color || 'N/A',
      qty: parseInt($('co-qty').value),
      unitPrice: parseFloat($('co-unit-price-raw').value),
      deliveryFee: DELIVERY_FEE,
      total: parseFloat($('co-total').value.replace(/[^0-9.]/g, '')),
      customerName: $('co-name').value,
      phone: $('co-phone').value,
      address: $('co-address').value,
      paymentMethod: $('co-payment').value,
      payNow: parseFloat($('co-pay-now').value.replace(/[^0-9.]/g, '')) || 0,
      due: parseFloat($('co-due-amount').value.replace(/[^0-9.]/g, '')) || 0,
      txnId: $('co-txn').value.trim(),
      status: 'Pending',
      timestamp: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'orders'), order);
      alert('Order placed successfully!');
      modal.classList.remove('show');
      form.reset();
    } catch (err) {
      alert('Error placing order: ' + err.message);
    }
  };
}

// ======================
// STATUS PAGE
// ======================
function initStatusPage() {
  $('#status-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const txn = $('#txn-id').value.trim();
    if (!txn) return;

    const q = query(collection(db, 'orders'), where('txnId', '==', txn));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      alert('No order found with this Transaction ID.');
      return;
    }

    const order = snapshot.docs[0].data();
    alert(`
Order Found!
Product: ${order.productName}
Status: ${order.status}
Qty: ${order.qty}
Total: ${order.total} tk
Paid: ${order.payNow} tk
Due: ${order.due} tk
    `);
  });
}

// ======================
// LOAD PRODUCTS
// ======================
async function loadProducts() {
  const snapshot = await getDocs(collection(db, 'products'));
  products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}