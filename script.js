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
async function generateUniqueSlug(name, color) {
  let base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let slug = base;
  let q = query(collection(db, 'products'), where('slug', '==', slug));
  let exists = await getDocs(q);
  if (!exists.empty) {
    slug = `${base}-${color.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    q = query(collection(db, 'products'), where('slug', '==', slug));
    exists = await getDocs(q);
    if (!exists.empty) {
      throw new Error('Slug conflict even with color appended.');
    }
  }
  return slug;
}
// ====== HOME PAGE ======
async function displayHomeProducts() {
  const grid = document.querySelector('#may-interest-you .product-grid');
  if (!grid) return;
  let products = await loadProducts();
  products = products.sort(() => 0.5 - Math.random()).slice(0, 5);
  products.forEach(p => grid.appendChild(createProductCard(p)));
}
// ====== PRODUCTS PAGE ======
async function displayAllProducts() {
  const grid = document.getElementById('all-products');
  if (!grid) return;
  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get('category');
  const search = urlParams.get('search');
  let products = await loadProducts();
  if (category) {
    products = products.filter(p => p.mainCategory === category);
  }
  if (search) {
    const lowerSearch = search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(lowerSearch) || (p.description || '').toLowerCase().includes(lowerSearch));
  }
  products.forEach(p => grid.appendChild(createProductCard(p)));
}
// ====== PRODUCT DETAIL PAGE ======
async function displayProductDetail() {
  const nameEl = document.getElementById('product-name');
  if (!nameEl) return;
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  if (!slug) {
    nameEl.textContent = 'Product not found';
    return;
  }
  const q = query(collection(db, 'products'), where('slug', '==', slug));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    nameEl.textContent = 'Product not found';
    return;
  }
  const p = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  document.title = `${p.name} - The Geek Shop`;
  nameEl.textContent = p.name;
  document.getElementById('product-description').textContent = p.description || '';
  document.getElementById('product-color').textContent = `Color: ${p.color || '-'}`;
  const isUpcoming = p.availability === 'Upcoming';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  document.getElementById('product-price').innerHTML = isUpcoming ? `TBA` : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ``}৳${finalPrice.toFixed(2)}`;
  const badgesEl = document.getElementById('product-badges');
  badgesEl.innerHTML = `
    ${p.category === 'new' ? `<span class="badge new">NEW</span>` : ``}
    ${p.category === 'hot' ? `<span class="badge hot">HOT</span>` : ``}
  `;
  // Images
  const featuredImg = document.getElementById('featured-img');
  featuredImg.src = p.images[0] || '';
  featuredImg.alt = p.name;
  const thumbnails = document.querySelector('.thumbnails');
  p.images.forEach((imgUrl, index) => {
    const thumb = document.createElement('img');
    thumb.src = imgUrl;
    thumb.alt = `${p.name} ${index + 1}`;
    thumb.addEventListener('click', () => {
      featuredImg.src = imgUrl;
    });
    thumbnails.appendChild(thumb);
  });
  // Order button
  const orderBtn = document.getElementById('order-btn');
  if (p.availability === 'Pre Order') {
    orderBtn.classList.add('preorder-btn');
    orderBtn.textContent = 'Pre Order';
  }
  orderBtn.disabled = (Number(p.stock) <= 0 && p.availability !== 'Pre Order') || p.availability === 'Upcoming';
  orderBtn.addEventListener('click', () => openCheckoutModal(p.id, p.availability === 'Pre Order'));
  // Other Products
  const otherGrid = document.querySelector('#other-products .product-grid');
  let otherProducts = await loadProducts();
  otherProducts = otherProducts.filter(op => op.id !== p.id).sort(() => 0.5 - Math.random()).slice(0, 5);
  otherProducts.forEach(op => otherGrid.appendChild(createProductCard(op)));
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
    <img src="${p.images ? p.images[0] : ''}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
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
      ${isPreOrder ? `<button class="preorder-btn">Pre Order</button>` : `<button ${isOOS || isUpcoming ? 'disabled' : ''} data-id="${p.id}" class="order-btn">Order</button>`}
    </div>
  `;
  card.addEventListener('click', () => {
    location.href = `product.html?slug=${p.slug}`;
  });
  const orderBtn = card.querySelector(isPreOrder ? '.preorder-btn' : '.order-btn');
  if (orderBtn) {
    orderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCheckoutModal(p.id, isPreOrder);
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
async function openCheckoutModal(productId, isPreOrder = false) {
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
  document.getElementById('co-payment').value = isPreOrder ? 'Bkash' : '';
  document.getElementById('co-payment').disabled = isPreOrder;
  document.getElementById('co-payment-number').value = '';
  document.getElementById('co-txn').value = '';
  document.getElementById('co-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-note').textContent = '';
  document.getElementById('co-policy').checked = false;
  document.getElementById('co-pay-now').style.display = 'none';
  document.getElementById('co-due-amount').style.display = 'none';
  document.getElementById('co-delivery').value = `Delivery Charge = ${DELIVERY_FEE}`;
  document.getElementById('co-delivery').dataset.fee = DELIVERY_FEE;
  if (isPreOrder) {
    const preOrderPrice = Math.round((unit * 0.25) / 5) * 5;
    const deliveryFee = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
    document.getElementById('co-pay-now').value = preOrderPrice.toFixed(2);
    document.getElementById('co-due-amount').value = (unit - preOrderPrice + deliveryFee).toFixed(2);
    document.getElementById('co-payment-number').value = BKASH_NUMBER;
    document.getElementById('co-note').textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID.`;
    document.getElementById('co-pay-now').style.display = 'block';
    document.getElementById('co-due-amount').style.display = 'block';
  }
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
  const subtotal = qty * unit;
  const total = subtotal + delivery;
  document.getElementById('co-total').value = total.toFixed(2);
  const paymentMethod = document.getElementById('co-payment').value;
  const isPreOrderMode = paymentMethod === 'Bkash' && document.getElementById('co-payment').disabled;
  const payNowEl = document.getElementById('co-pay-now');
  const dueEl = document.getElementById('co-due-amount');
  if (isPreOrderMode) {
    const preOrderPrice = Math.round((subtotal * 0.25) / 5) * 5;
    payNowEl.value = preOrderPrice.toFixed(2);
    dueEl.value = (subtotal - preOrderPrice + delivery).toFixed(2);
  }
}
async function submitCheckoutOrder(e) {
  e.preventDefault();
  const productId = document.getElementById('co-product-id').value;
  const qty = Number(document.getElementById('co-qty').value);
  const payment = document.getElementById('co-payment').value;
  const txn = document.getElementById('co-txn').value.trim();
  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const deliveryFee = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const subtotal = qty * unit;
  const total = subtotal + deliveryFee;
  const isPreOrder = document.getElementById('co-payment').disabled;
  let paid = 0;
  let due = total;
  if (isPreOrder || payment === 'Bkash') {
    if (!txn) {
      alert('Transaction ID required for this payment.');
      return;
    }
    paid = isPreOrder ? Number(document.getElementById('co-pay-now').value) : total;
    due = isPreOrder ? Number(document.getElementById('co-due-amount').value) : 0;
  }
  try {
    await runTransaction(db, async (transaction) => {
      const productDoc = doc(db, 'products', productId);
      const product = await transaction.get(productDoc);
      if (!product.exists()) throw new Error('Product not found');
      const data = product.data();
      const newStock = Number(data.stock) - qty;
      if (newStock < 0) throw new Error('Insufficient stock');
      transaction.update(productDoc, { stock: newStock });
      const now = new Date();
      const orderData = {
        timeISO: now.toISOString(),
        productId,
        productName: data.name,
        color: data.color || '',
        unitPrice: unit,
        quantity: qty,
        deliveryFee,
        paid,
        due,
        customerName: name,
        phone,
        address,
        paymentMethod: payment,
        transactionId: txn,
        status: 'Pending'
      };
      await addDoc(collection(db, 'orders'), orderData);
    });
    alert('Order placed successfully!');
    closeCheckoutModal();
  } catch (err) {
    console.error('Order error:', err);
    alert('Error placing order: ' + err.message);
  }
}
function handlePaymentChange(e) {
  const method = e.target.value;
  const numberEl = document.getElementById('co-payment-number');
  const txnEl = document.getElementById('co-txn');
  const noteEl = document.getElementById('co-note');
  const payNowEl = document.getElementById('co-pay-now');
  const dueEl = document.getElementById('co-due-amount');
  payNowEl.style.display = 'none';
  dueEl.style.display = 'none';
  if (method === 'Bkash') {
    numberEl.value = BKASH_NUMBER;
    noteEl.textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID.`;
    txnEl.required = true;
  } else if (method === 'Cash on Delivery') {
    numberEl.value = COD_NUMBER;
    noteEl.textContent = '';
    txnEl.required = false;
  } else {
    numberEl.value = '';
    noteEl.textContent = '';
    txnEl.required = false;
  }
  updateTotalInModal();
}
// ====== ADMIN: ADD PRODUCT ======
async function addProduct(e) {
  e.preventDefault();
  const name = document.getElementById('add-name').value.trim();
  const price = document.getElementById('add-price').value.trim();
  const discount = Number(document.getElementById('add-discount').value) || 0;
  const images = document.getElementById('add-image').value.split(',').map(s => s.trim()).filter(s => s);
  const category = document.getElementById('add-category').value;
  const mainCategory = document.getElementById('add-main-category').value;
  const color = document.getElementById('add-color').value.trim();
  const stock = Number(document.getElementById('add-stock').value) || 0;
  const availability = document.getElementById('add-availability').value;
  const desc = document.getElementById('add-desc').value.trim();
  if (!name || images.length === 0 || !category || !mainCategory || !availability) {
    alert('Required fields missing.');
    return;
  }
  try {
    const slug = await generateUniqueSlug(name, color);
    const data = {
      name,
      price: price === 'TBA' ? 'TBA' : Number(price),
      discount,
      images,
      category,
      mainCategory,
      color,
      stock,
      availability,
      description: desc,
      slug
    };
    await addDoc(collection(db, 'products'), data);
    alert('Product added!');
    e.target.reset();
    renderDataTable();
  } catch (err) {
    console.error('Add error:', err);
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
    { label: 'Name', key: 'name', editable: true },
    { label: 'Price', key: 'price', editable: true },
    { label: 'Badge Category', key: 'category', editable: true },
    { label: 'Main Category', key: 'mainCategory', editable: true },
    { label: 'Color', key: 'color', editable: true },
    { label: 'Discount (tk)', key: 'discount', editable: true },
    { label: 'Stock', key: 'stock', editable: true },
    { label: 'Availability', key: 'availability', editable: true },
    { label: 'Slug', key: 'slug', editable: false }
  ];
  products.forEach(p => {
    const tr = document.createElement('tr');
    // Toggle details
    const tdToggle = document.createElement('td');
    tdToggle.className = 'toggle-details';
    tdToggle.innerHTML = '▼';
    tdToggle.addEventListener('click', (e) => {
      const detailsRow = e.target.closest('tr').nextElementSibling;
      detailsRow.classList.toggle('show');
      e.target.innerHTML = detailsRow.classList.contains('show') ? '▲' : '▼';
    });
    tr.appendChild(tdToggle);
    // Main columns
    cols.forEach(col => {
      const td = document.createElement('td');
      td.textContent = p[col.key] != null ? String(p[col.key]) : '';
      if (col.editable) {
        td.contentEditable = true;
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
      }
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
    detailsCell.colSpan = cols.length + 3; // toggle, cols, status, actions
    detailsCell.className = 'details-content';
    const imageCell = document.createElement('div');
    imageCell.contentEditable = true;
    imageCell.textContent = p.images ? p.images.join(', ') : '';
    imageCell.addEventListener('blur', async (e) => {
      const val = e.target.textContent.trim();
      const images = val.split(',').map(s => s.trim()).filter(s => s);
      await updateProductField(p.id, 'images', images);
    });
    const descCell = document.createElement('div');
    descCell.contentEditable = true;
    descCell.textContent = p.description != null ? p.description : '';
    descCell.addEventListener('blur', async (e) => {
      const val = e.target.textContent.trim();
      await updateProductField(p.id, 'description', val);
    });
    detailsCell.innerHTML = `<strong>Image URLs (comma-separated):</strong> `;
    detailsCell.appendChild(imageCell);
    detailsCell.innerHTML += `<br><strong>Description:</strong> `;
    detailsCell.appendChild(descCell);
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
    // Details row for Unit Price
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 14; // Span across toggle, main columns, and status
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
// ====== Search setup ======
function setupSearch() {
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
        searchBtn.click();
      }
    });
  }
}
// ====== INIT ======
document.addEventListener('DOMContentLoaded', async () => {
  // Common
  setupSearch();
  const modal = document.getElementById('checkout-modal');
  if (modal) {
    document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
    const form = document.getElementById('checkout-form');
    form.addEventListener('submit', submitCheckoutOrder);
    document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
    document.getElementById('co-qty').addEventListener('input', updateTotalInModal);
    document.getElementById('co-address').addEventListener('input', updateDeliveryCharge);
  }
  // Page-specific
  if (document.querySelector('#may-interest-you')) {
    await displayHomeProducts();
  } else if (document.getElementById('all-products')) {
    await displayAllProducts();
  } else if (document.getElementById('product-name')) {
    await displayProductDetail();
  }
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