import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

// Utility Functions
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

// React Components
const ProductCard = ({ product }) => {
  const isUpcoming = product.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(product.stock) <= 0 && product.availability !== 'Pre Order';
  const isPreOrder = product.availability === 'Pre Order';
  const hasDiscount = Number(product.discount) > 0;
  const price = Number(product.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(product.discount)) : price;
  const url = `/product/${product.name.toLowerCase().replace(/\s+/g, '-')}${product.color ? '-' + product.color.toLowerCase().replace(/\s+/g, '-') : ''}`;

  return (
    <div className="card product-card" onClick={() => window.location.href = url} role="button" tabIndex="0" aria-label={`View details for ${product.name}`}>
      <img src={product.featuredImage} alt={product.name} onError={(e) => { e.target.src = ''; e.target.alt = 'Image not available'; }} className="w-full h-48 object-cover rounded-lg" />
      <div className="badges">
        {product.category === 'new' && <span className="badge new">NEW</span>}
        {product.category === 'hot' && <span className="badge hot">HOT</span>}
        {isOOS && <span className="badge oos">OUT OF STOCK</span>}
        {isUpcoming && <span className="badge upcoming">UPCOMING</span>}
        {isPreOrder && <span className="badge preorder">PRE ORDER</span>}
      </div>
      <h3 className="text-lg font-medium">{product.name}</h3>
      <div className="muted">Color: {product.color || '-'}</div>
      <div className="price">
        {isUpcoming ? 'TBA' : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ''}৳${finalPrice.toFixed(2)}`}
      </div>
    </div>
  );
};

const ProductSlider = ({ products }) => {
  const shuffled = [...products].sort(() => Math.random() - 0.5).slice(0, 5);
  return (
    <div id="product-slider" className="flex">
      {shuffled.map(product => <ProductCard key={product.id} product={product} />)}
      {shuffled.map(product => <ProductCard key={`duplicate-${product.id}`} product={product} />)}
    </div>
  );
};

const ProductList = ({ products, category }) => {
  const filtered = category === 'all' ? products : products.filter(p => p.category === category);
  return (
    <div className="product-list">
      {filtered.map(product => <ProductCard key={product.id} product={product} />)}
    </div>
  );
};

// Product Page Logic
async function displayProductDetails() {
  const path = window.location.pathname;
  const match = path.match(/\/product\/([a-z0-9-]+)(?:-([a-z0-9-]+))?/);
  if (!match) return;

  const name = match[1].replace(/-/g, ' ');
  const color = match[2] ? match[2].replace(/-/g, ' ') : null;
  const products = await loadProducts();
  const product = products.find(p => p.name.toLowerCase() === name && (!color || p.color?.toLowerCase() === color));
  if (!product) return;

  document.title = `${product.name} - The Geek Shop`;
  const meta = document.createElement('meta');
  meta.name = 'canonical';
  meta.content = window.location.href;
  document.head.appendChild(meta);

  document.getElementById('product-name').textContent = product.name;
  document.getElementById('product-main-image').src = product.featuredImage;
  document.getElementById('product-main-image').alt = product.name;
  document.getElementById('product-color').textContent = `Color: ${product.color || '-'}`;
  document.getElementById('product-description').textContent = product.description || 'No description available.';
  const hasDiscount = Number(product.discount) > 0;
  const price = Number(product.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(product.discount)) : price;
  document.getElementById('product-price').innerHTML = product.availability === 'Upcoming' ? 'TBA' : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ''}৳${finalPrice.toFixed(2)}`;
  
  const badges = document.getElementById('product-badges');
  if (product.category === 'new') badges.innerHTML += '<span class="badge new">NEW</span>';
  if (product.category === 'hot') badges.innerHTML += '<span class="badge hot">HOT</span>';
  if (product.availability === 'Upcoming') badges.innerHTML += '<span class="badge upcoming">UPCOMING</span>';
  if (product.availability === 'Pre Order') badges.innerHTML += '<span class="badge preorder">PRE ORDER</span>';
  if (!product.availability === 'Upcoming' && Number(product.stock) <= 0 && product.availability !== 'Pre Order') {
    badges.innerHTML += '<span class="badge oos">OUT OF STOCK</span>';
  }

  const imagesContainer = document.getElementById('product-images');
  (product.images || []).forEach(img => {
    const imgEl = document.createElement('img');
    imgEl.src = img;
    imgEl.alt = `${product.name} additional image`;
    imgEl.className = 'w-20 h-20 object-cover rounded cursor-pointer';
    imgEl.addEventListener('click', () => {
      document.getElementById('product-main-image').src = img;
    });
    imagesContainer.appendChild(imgEl);
  });

  const orderBtn = document.getElementById('order-btn');
  const preorderBtn = document.getElementById('preorder-btn');
  if (product.availability === 'Pre Order') {
    preorderBtn.style.display = 'block';
    orderBtn.style.display = 'none';
    preorderBtn.addEventListener('click', () => openCheckoutModal(product.id, true));
  } else if (product.availability !== 'Upcoming' && Number(product.stock) > 0) {
    orderBtn.addEventListener('click', () => openCheckoutModal(product.id));
  } else {
    orderBtn.disabled = true;
  }
}

// Homepage and Products Page Logic
async function displayHomepage() {
  const slider = document.getElementById('product-slider');
  if (slider) {
    const products = await loadProducts();
    ReactDOM.render(<ProductSlider products={products} />, slider);
  }
}

async function displayProducts() {
  const productList = document.getElementById('product-list');
  if (productList) {
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category') || 'all';
    const filter = document.getElementById('category-filter');
    if (filter) filter.value = category;
    const products = await loadProducts();
    ReactDOM.render(<ProductList products={products} category={category} />, productList);

    filter.addEventListener('change', () => {
      window.location.search = `category=${filter.value}`;
    });
  }
}

// Delivery Charge Logic
function calculateDeliveryFee(address) {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr.includes("savar")) return 70;
  if (lowerAddr.includes("dhaka")) return 110;
  return 150;
}

function updateDeliveryCharge() {
  const address = document.getElementById('co-address').value.trim();
  const deliveryFee = calculateDeliveryFee(address);
  document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;
  updateTotalInModal();
}

// Checkout Modal Logic
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
  document.getElementById('checkout-modal').classList.add('show');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('show');
}

function updateTotalInModal() {
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const delivery = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const subtotal = qty * unit;
  const total = subtotal + delivery;
  document.getElementById('co-total').value = total.toFixed(2);
}

function handlePaymentChange() {
  const payment = document.getElementById('co-payment').value;
  const payNumber = document.getElementById('co-payment-number');
  const note = document.getElementById('co-note');
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const delivery = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const total = qty * unit + delivery;

  if (payment === 'Bkash') {
    payNumber.value = BKASH_NUMBER;
    note.textContent = `Send money to ${BKASH_NUMBER} and provide transaction ID.`;
    document.getElementById('co-pay-now').value = total.toFixed(2);
    document.getElementById('co-due-amount').value = '0.00';
    document.getElementById('co-pay-now').style.display = 'block';
    document.getElementById('co-due-amount').style.display = 'block';
  } else if (payment === 'Cash on Delivery') {
    payNumber.value = COD_NUMBER;
    note.textContent = '';
    document.getElementById('co-pay-now').style.display = 'none';
    document.getElementById('co-due-amount').style.display = 'none';
  } else {
    payNumber.value = '';
    note.textContent = '';
    document.getElementById('co-pay-now').style.display = 'none';
    document.getElementById('co-due-amount').style.display = 'none';
  }
}

async function submitCheckoutOrder(e) {
  e.preventDefault();
  const productId = document.getElementById('co-product-id').value;
  const qty = Number(document.getElementById('co-qty').value);
  const paymentMethod = document.getElementById('co-payment').value;
  const transactionId = document.getElementById('co-txn').value.trim();
  const customerName = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const policy = document.getElementById('co-policy').checked;

  if (!policy) {
    alert('Please agree to the order policy.');
    return;
  }
  if (!customerName || !phone || !address || !paymentMethod) {
    alert('Please fill in all required fields.');
    return;
  }
  if (paymentMethod === 'Bkash' && !transactionId) {
    alert('Please provide a transaction ID for Bkash payment.');
    return;
  }

  try {
    const product = (await loadProducts()).find(p => p.id === productId);
    if (!product) {
      alert('Product not found.');
      return;
    }
    const unitPrice = Number(product.price) - (Number(product.discount) || 0);
    const deliveryFee = calculateDeliveryFee(address);
    const total = qty * unitPrice + deliveryFee;
    const paid = paymentMethod === 'Bkash' ? total : 0;
    const due = paymentMethod === 'Bkash' ? 0 : total;

    await runTransaction(db, async (transaction) => {
      const productRef = doc(db, 'products', productId);
      const productSnap = await transaction.get(productRef);
      const productData = productSnap.data();
      if (productData.availability !== 'Pre Order' && productData.stock < qty) {
        throw new Error('Insufficient stock.');
      }
      if (productData.availability !== 'Upcoming' && productData.availability !== 'Pre Order') {
        transaction.update(productRef, { stock: productData.stock - qty });
      }
      transaction.set(doc(collection(db, 'orders')), {
        productId,
        productName: product.name,
        color: product.color || '',
        quantity: qty,
        unitPrice,
        deliveryFee,
        paid,
        due,
        customerName,
        phone,
        address,
        paymentMethod,
        transactionId: paymentMethod === 'Bkash' ? transactionId : '',
        status: 'Pending',
        timeISO: new Date().toISOString()
      });
    });

    alert('Order placed successfully!');
    closeCheckoutModal();
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  }
}

// Admin Logic
async function addProduct(e) {
  e.preventDefault();
  const name = document.getElementById('add-name').value.trim();
  const price = document.getElementById('add-price').value.trim();
  const discount = document.getElementById('add-discount').value.trim();
  const featuredImage = document.getElementById('add-featured-image').value.trim();
  const images = document.getElementById('add-images').value.trim().split(',').map(img => img.trim()).filter(img => img);
  const category = document.getElementById('add-category').value;
  const color = document.getElementById('add-color').value.trim();
  const stock = Number(document.getElementById('add-stock').value);
  const availability = document.getElementById('add-availability').value;
  const description = document.getElementById('add-desc').value.trim();

  if (!name || !featuredImage || !category || !availability) {
    alert('Please fill in all required fields.');
    return;
  }
  if (price !== 'TBA' && isNaN(Number(price))) {
    alert('Price must be a number or "TBA".');
    return;
  }
  if (isNaN(Number(discount)) || isNaN(stock)) {
    alert('Discount and stock must be numbers.');
    return;
  }

  try {
    await addDoc(collection(db, 'products'), {
      name,
      price: price === 'TBA' ? 'TBA' : Number(price),
      discount: Number(discount),
      featuredImage,
      images,
      category,
      color: color || null,
      stock,
      availability,
      description
    });
    alert('Product added successfully!');
    document.getElementById('add-product-form').reset();
    renderDataTable();
  } catch (err) {
    console.error('Error adding product:', err);
    alert('Error adding product: ' + err.message);
  }
}

async function renderDataTable() {
  const tbody = document.getElementById('products-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const products = await loadProducts();
  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'price', label: 'Price' },
    { key: 'category', label: 'Category' },
    { key: 'color', label: 'Color' },
    { key: 'discount', label: 'Discount (tk)' },
    { key: 'stock', label: 'Stock' },
    { key: 'availability', label: 'Availability' }
  ];

  products.forEach(p => {
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

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = cols.length + 3;
    detailsCell.className = 'details-content';
    const imageCell = document.createElement('div');
    imageCell.contentEditable = true;
    imageCell.textContent = p.featuredImage != null ? p.featuredImage : '';
    imageCell.addEventListener('blur', async (e) => {
      const val = e.target.textContent.trim();
      if (val === (p.featuredImage != null ? String(p.featuredImage) : '')) return;
      await updateProductField(p.id, 'featuredImage', val);
    });
    const imagesCell = document.createElement('div');
    imagesCell.contentEditable = true;
    imagesCell.textContent = p.images ? p.images.join(', ') : '';
    imagesCell.addEventListener('blur', async (e) => {
      const val = e.target.textContent.trim();
      if (val === (p.images ? p.images.join(', ') : '')) return;
      await updateProductField(p.id, 'images', val.split(',').map(img => img.trim()).filter(img => img));
    });
    const descCell = document.createElement('div');
    descCell.contentEditable = true;
    descCell.textContent = p.description != null ? p.description : '';
    descCell.addEventListener('blur', async (e) => {
      const val = e.target.textContent.trim();
      if (val === (p.description != null ? String(p.description) : '')) return;
      await updateProductField(p.id, 'description', val);
    });
    detailsCell.innerHTML = `<strong>Featured Image URL:</strong> `;
    detailsCell.appendChild(imageCell);
    detailsCell.innerHTML += `<br><strong>Additional Images:</strong> `;
    detailsCell.appendChild(imagesCell);
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

async function renderOrdersTable() {
  const tbody = document.getElementById('orders-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const orders = await loadOrders();
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

function logoutAdmin() {
  try {
    signOut(auth);
    console.log('Logged out successfully');
  } catch (err) {
    console.error('Logout error:', err);
    alert('Error logging out: ' + err.message);
  }
}

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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  displayHomepage();
  displayProducts();
  displayProductDetails();

  const modal = document.getElementById('checkout-modal');
  if (modal) {
    document.getElementById('close-modal-btn').onclick = closeCheckoutModal;
    document.getElementById('checkout-form').addEventListener('submit', submitCheckoutOrder);
    document.getElementById('co-payment').addEventListener('change', handlePaymentChange);
    document.getElementById('co-qty').addEventListener('input', updateTotalInModal