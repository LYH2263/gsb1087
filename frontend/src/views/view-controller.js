export function createViewController({
  state,
  viewContent,
  viewTitle,
  loginBtn,
  logoutBtn,
  userChip,
  adminNavBtn,
  adminNavSection,
  escapeHtmlAttr,
  showToast
}) {
  function formatCurrency(value) {
    return `¥${Number(value).toFixed(2)}`;
  }

  function formatStatus(status) {
    const map = {
      PENDING_PAYMENT: '待支付',
      PAID: '已支付',
      SHIPPED: '已发货',
      COMPLETED: '已完成',
      CANCELED: '已取消',
      REFUNDED: '已退款'
    };
    return map[status] || status;
  }

  function setNavActive(view) {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('bg-slate-200', active);
      btn.classList.toggle('text-slate-900', active);
    });
  }

  function updateAuthUI() {
    if (state.user) {
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      userChip.classList.remove('hidden');
      userChip.textContent = `${state.user.username} · ${state.user.role === 'ADMIN' ? '管理员' : '用户'}`;
    } else {
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      userChip.classList.add('hidden');
      userChip.textContent = '';
    }
    if (adminNavBtn) {
      adminNavBtn.classList.toggle('hidden', !state.user || state.user.role !== 'ADMIN');
    }
    if (adminNavSection) {
      adminNavSection.classList.toggle('hidden', !state.user || state.user.role !== 'ADMIN');
    }
  }

  function renderSkeleton(count = 6) {
    return `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${Array.from({ length: count })
      .map(
        () => `
        <div class="card p-4 animate-pulse space-y-4">
          <div class="h-40 bg-slate-200 rounded-xl"></div>
          <div class="h-4 bg-slate-200 rounded"></div>
          <div class="h-3 bg-slate-100 rounded w-2/3"></div>
          <div class="h-8 bg-slate-200 rounded"></div>
        </div>
      `
      )
      .join('')}</div>`;
  }

  function renderBooks() {
    const search = state.bookSearch;
    const categoryOptions = state.categories
      .map((cat) => `<option value="${cat.id}" ${search.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`)
      .join('');

    const bookCards = state.books
      .map(
        (book) => `
        <div class="card hover-card p-4 flex flex-col gap-3">
          <div class="rounded-xl overflow-hidden h-44 bg-slate-100">
            <img src="${book.coverUrl}" alt="${book.title}" class="w-full h-full object-contain" />
          </div>
          <div>
            <h3 class="font-semibold text-lg">${book.title}</h3>
            <p class="text-sm text-slate-500">${book.author}</p>
            <div class="flex flex-wrap gap-2 mt-2">
              <span class="badge">${book.category?.name || '未分类'}</span>
              <span class="badge">库存 ${book.stock}</span>
              <span class="badge">销量 ${book.sales}</span>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <p class="text-lg font-semibold text-slate-900">${formatCurrency(book.price)}</p>
            <button class="btn-primary" data-action="add-to-cart" data-id="${book.id}">加入购物车</button>
          </div>
        </div>
      `
      )
      .join('');

    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">书籍查询</h2>
        <p class="text-sm text-slate-500">支持多条件筛选与排序</p>
      </div>
    `;

    viewContent.innerHTML = `
      <div class="card p-5">
        <form class="grid md:grid-cols-6 gap-3" data-form="book-search" novalidate>
          <input class="input md:col-span-2" name="title" placeholder="书名" value="${escapeHtmlAttr(search.title)}" />
          <input class="input" name="author" placeholder="作者" value="${escapeHtmlAttr(search.author)}" />
          <input class="input" name="isbn" placeholder="ISBN" value="${escapeHtmlAttr(search.isbn)}" />
          <select class="input" name="categoryId">
            <option value="">全部分类</option>
            ${categoryOptions}
          </select>
          <select class="input" name="sort">
            <option value="" ${search.sort === '' ? 'selected' : ''}>默认排序</option>
            <option value="sales_desc" ${search.sort === 'sales_desc' ? 'selected' : ''}>销量最高</option>
            <option value="price_asc" ${search.sort === 'price_asc' ? 'selected' : ''}>价格最低</option>
            <option value="price_desc" ${search.sort === 'price_desc' ? 'selected' : ''}>价格最高</option>
          </select>
          <input class="input" name="minPrice" placeholder="最低价" value="${escapeHtmlAttr(search.minPrice)}" />
          <input class="input" name="maxPrice" placeholder="最高价" value="${escapeHtmlAttr(search.maxPrice)}" />
          <div class="md:col-span-6 flex flex-wrap justify-end gap-2">
            <button class="btn-primary" type="submit">查询</button>
            <button class="btn-outline" type="button" data-action="reset-search">重置</button>
          </div>
        </form>
      </div>
      ${state.loading.books ? renderSkeleton() : `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${bookCards || '<div class="text-slate-500">暂无书籍</div>'}</div>`}
    `;
  }

  function isCouponUsable(coupon, subtotal) {
    const now = new Date();
    if (coupon.status !== 'ACTIVE') return false;
    if (coupon.startsAt && new Date(coupon.startsAt) > now) return false;
    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return false;
    if (coupon.isUsed) return false;
    if (subtotal !== undefined && subtotal < coupon.minAmount) return false;
    return true;
  }

  function getCouponUnavailableReason(coupon, subtotal) {
    const now = new Date();
    if (coupon.status !== 'ACTIVE') return '已停用';
    if (coupon.startsAt && new Date(coupon.startsAt) > now) return '尚未生效';
    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return '已过期';
    if (coupon.isUsed) return '已使用';
    if (subtotal !== undefined && subtotal < coupon.minAmount) return `未满 ${formatCurrency(coupon.minAmount)}`;
    return '';
  }

  function formatCouponValue(coupon) {
    if (coupon.type === 'FIXED') {
      return formatCurrency(coupon.value);
    }
    return `${coupon.value}%`;
  }

  function renderCouponList(subtotal) {
    if (state.coupons.length === 0) {
      return '<p class="text-sm text-slate-500">暂无可用优惠券</p>';
    }

    return state.coupons
      .map((coupon) => {
        const usable = isCouponUsable(coupon, subtotal);
        const reason = getCouponUnavailableReason(coupon, subtotal);
        const selected = state.selectedCoupon?.id === coupon.id;

        return `
        <div class="border rounded-xl p-3 ${usable ? 'border-slate-200 hover:border-teal-400 cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-60'} ${selected ? 'border-teal-500 bg-teal-50' : ''}"
             data-action="${usable ? 'select-coupon' : ''}" data-id="${coupon.id}">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold text-teal-600">${formatCouponValue(coupon)}</span>
                <span class="text-sm font-medium">${coupon.name}</span>
              </div>
              <p class="text-xs text-slate-500 mt-1">券码：${coupon.code}</p>
              ${coupon.minAmount > 0 ? `<p class="text-xs text-slate-500">满 ${formatCurrency(coupon.minAmount)} 可用</p>` : ''}
              ${coupon.expiresAt ? `<p class="text-xs text-slate-400">有效期至 ${new Date(coupon.expiresAt).toLocaleDateString()}</p>` : ''}
            </div>
            ${!usable ? `<span class="text-xs text-slate-400 whitespace-nowrap">${reason}</span>` : ''}
          </div>
        </div>
      `;
      })
      .join('');
  }

  function renderCart() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">购物车</h2>
        <p class="text-sm text-slate-500">管理选购书籍并批量结算</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看购物车。</div>`;
      return;
    }

    const subtotal = state.cart.reduce((sum, item) => sum + item.book.price * item.quantity, 0);
    const discount = state.couponDiscount || 0;
    const total = Math.max(0, subtotal - discount);

    const cartList = state.cart
      .map(
        (item) => `
      <div class="flex flex-col md:flex-row md:items-center gap-4 border-b border-slate-200 pb-4">
        <img src="${item.book.coverUrl}" alt="${item.book.title}" class="w-24 h-24 object-contain rounded-xl bg-white" />
        <div class="flex-1">
          <h3 class="font-semibold">${item.book.title}</h3>
          <p class="text-sm text-slate-500">${item.book.author}</p>
          <p class="text-sm text-slate-500">单价 ${formatCurrency(item.book.price)}</p>
        </div>
        <div class="flex items-center gap-3">
          <input class="input w-20" type="number" min="1" value="${item.quantity}" data-action="update-qty" data-id="${item.id}" />
          <button class="btn-outline" data-action="remove-cart" data-id="${item.id}">删除</button>
        </div>
      </div>
    `
      )
      .join('');

    const addressOptions = state.addresses
      .map(
        (addr) => `
        <option value="${addr.id}" ${addr.isDefault ? 'selected' : ''}>
          ${addr.recipient} ${addr.phone} ${addr.state}${addr.city}${addr.line1}
        </option>
      `
      )
      .join('');

    viewContent.innerHTML = `
      <div class="card p-6 space-y-4">
        ${state.cart.length === 0 ? '<p class="text-slate-500">购物车为空</p>' : cartList}
        ${state.cart.length > 0 ? `<div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-lg font-semibold">小计 ${formatCurrency(subtotal)}</p>
          <div class="flex gap-2">
            <button class="btn-outline" data-action="clear-cart">清空购物车</button>
          </div>
        </div>` : ''}
      </div>

      ${state.cart.length > 0 ? `
      <div class="card p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">优惠券</h3>
          <button class="text-sm text-teal-600" data-action="toggle-coupon-list">${state.coupons.length > 0 ? '选择优惠券' : ''}</button>
        </div>

        <form data-form="apply-coupon" class="flex gap-2" novalidate>
          <input class="input flex-1" name="couponCode" placeholder="输入券码" />
          <button class="btn-outline" type="submit">使用</button>
        </form>

        <div id="coupon-list-container" class="space-y-2 hidden">
          ${renderCouponList(subtotal)}
        </div>

        ${state.selectedCoupon ? `
          <div class="bg-teal-50 rounded-lg p-3 flex items-center justify-between">
            <div>
              <span class="font-medium text-teal-700">${state.selectedCoupon.name}</span>
              <span class="text-sm text-teal-600 ml-2">-${formatCurrency(discount)}</span>
            </div>
            <button class="text-sm text-slate-500" data-action="clear-coupon">不使用</button>
          </div>
        ` : ''}
      </div>
      ` : ''}

      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">订单确认</h3>
        <form data-form="checkout" class="space-y-3" novalidate>
          ${state.selectedCoupon ? `<input type="hidden" name="couponId" value="${state.selectedCoupon.id}" />` : ''}
          <div class="space-y-1">
            <select class="input input-lg" name="addressId" required>
              <option value="">选择配送地址</option>
              ${addressOptions}
            </select>
          </div>
          <div class="grid md:grid-cols-3 gap-3" data-error-group="paymentMethod">
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="WECHAT" checked /> 微信支付
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="ALIPAY" /> 支付宝
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="COD" /> 货到付款
            </label>
          </div>

          <div class="border-t border-slate-200 pt-4 space-y-2">
            <div class="flex justify-between text-sm text-slate-600">
              <span>商品小计</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            <div class="flex justify-between text-sm text-teal-600">
              <span>优惠券抵扣</span>
              <span>-${formatCurrency(discount)}</span>
            </div>
            <div class="flex justify-between text-lg font-semibold">
              <span>应付金额</span>
              <span class="text-teal-600">${formatCurrency(total)}</span>
            </div>
          </div>

          <div class="flex justify-end">
            <button class="btn-primary" type="submit" ${state.cart.length === 0 ? 'disabled' : ''}>生成待支付订单</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderOrders() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">订单管理</h2>
        <p class="text-sm text-slate-500">跟踪订单状态与售后服务</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看订单。</div>`;
      return;
    }

    if (state.orders.length === 0) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">暂无订单</div>`;
      return;
    }

    viewContent.innerHTML = state.orders
      .map(
        (order) => `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs text-slate-400">订单号 ${order.id}</p>
              <h3 class="text-lg font-semibold">${formatStatus(order.status)}</h3>
            </div>
            <div class="text-right">
              <p class="text-sm text-slate-500">金额</p>
              <p class="text-lg font-semibold">${formatCurrency(order.total)}</p>
              ${order.coupon ? `<p class="text-xs text-teal-600">已用券：${order.coupon.name}</p>` : ''}
              ${order.discount > 0 ? `<p class="text-xs text-slate-400">优惠 ${formatCurrency(order.discount)}</p>` : ''}
            </div>
          </div>
          <div class="space-y-3">
            ${order.items
              .map(
                (item) => `
              <div class="flex items-center gap-3">
                <img src="${item.coverUrl}" alt="${item.title}" class="w-16 h-16 rounded-lg object-contain bg-white" />
                <div class="flex-1">
                  <p class="font-medium">${item.title}</p>
                  <p class="text-xs text-slate-500">${item.author} · ${item.quantity} 本</p>
                </div>
                <p class="text-sm font-semibold">${formatCurrency(item.price)}</p>
              </div>
            `
              )
              .join('')}
          </div>
          <div class="flex flex-wrap gap-2">
            ${order.status === 'PENDING_PAYMENT' ? `<button class="btn-primary" data-action="pay-order" data-id="${order.id}">立即支付（模拟）</button>` : ''}
            ${order.status === 'PENDING_PAYMENT' ? `<button class="btn-outline" data-action="cancel-order" data-id="${order.id}">取消订单</button>` : ''}
            ${order.status === 'SHIPPED' ? `<button class="btn-primary" data-action="confirm-order" data-id="${order.id}">确认收货</button>` : ''}
            ${order.status === 'COMPLETED' && !order.reviewText ? `<button class="btn-outline" data-action="review-order" data-id="${order.id}">评价订单</button>` : ''}
            ${order.reviewText ? `<span class="badge">已评价 ${order.rating}⭐</span>` : ''}
          </div>
        </div>
      `
      )
      .join('');
  }

  function renderProfile() {
    viewTitle.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">个人中心</h2>
          <p class="text-sm text-slate-500">管理账户与地址信息</p>
        </div>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看个人信息。</div>`;
      return;
    }

    const editingAddress = state.profile.editingAddress;
    const addressList = state.addresses
      .map(
        (addr) => `
        <div class="border border-slate-200 rounded-xl p-3 flex flex-col gap-2 ${addr.isDefault ? 'address-default' : ''}">
          <p class="font-semibold">${addr.recipient} <span class="text-xs text-slate-500">${addr.phone}</span></p>
          <p class="text-sm text-slate-500">${addr.state}${addr.city}${addr.line1} ${addr.postalCode}</p>
          <div class="flex gap-2">
            <button class="btn-outline" data-action="set-default" data-id="${addr.id}">${addr.isDefault ? '默认地址' : '设为默认'}</button>
            <button class="btn-outline" data-action="edit-address" data-id="${addr.id}">编辑</button>
            <button class="btn-outline" data-action="delete-address" data-id="${addr.id}">删除</button>
          </div>
        </div>
      `
      )
      .join('');

    viewContent.innerHTML = `
      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">账号信息</h3>
        <div class="grid md:grid-cols-3 gap-3">
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-xs text-slate-400">用户名</p>
            <p class="font-semibold">${state.user.username}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-xs text-slate-400">邮箱</p>
            <p class="font-semibold">${state.user.email}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-xs text-slate-400">手机号</p>
            <p class="font-semibold">${state.user.phone}</p>
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">${editingAddress ? '编辑配送地址' : '新增配送地址'}</h3>
        <div class="grid md:grid-cols-2 gap-3">${addressList || '<p class="text-slate-500">暂无地址</p>'}</div>
        <form data-form="address" class="grid md:grid-cols-2 gap-3" novalidate>
          <input type="hidden" name="addressId" value="${editingAddress?.id || ''}" />
          <div class="space-y-1">
            <input class="input" name="recipient" placeholder="收件人" value="${editingAddress?.recipient || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="phone" placeholder="手机号" value="${editingAddress?.phone || ''}" required />
          </div>
          <div class="space-y-1 md:col-span-2">
            <input class="input" name="line1" placeholder="详细地址" value="${editingAddress?.line1 || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="city" placeholder="城市" value="${editingAddress?.city || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="state" placeholder="省份" value="${editingAddress?.state || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="postalCode" placeholder="邮编" value="${editingAddress?.postalCode || ''}" required />
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="isDefault" ${editingAddress?.isDefault ? 'checked' : ''} /> 设为默认地址
          </label>
          <div class="md:col-span-2 flex justify-end gap-2">
            <button class="btn-primary" type="submit">${editingAddress ? '保存地址' : '新增地址'}</button>
            ${editingAddress ? '<button class="btn-outline" type="button" data-action="cancel-edit-address">取消编辑</button>' : ''}
          </div>
        </form>
      </div>
    `;
  }

  function renderAdmin() {
    viewTitle.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">管理控制台</h2>
          <p class="text-sm text-slate-500">书籍、分类与订单运营</p>
        </div>
      </div>
    `;

    if (!state.user || state.user.role !== 'ADMIN') {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">仅管理员可访问。</div>`;
      return;
    }

    const adminTabs = `
      <div class="flex flex-wrap gap-2">
        <button class="btn-outline" data-action="admin-tab" data-tab="books">书籍管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="categories">分类管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="coupons">优惠券管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="orders">订单管理</button>
      </div>
    `;

    let content = '';
    if (state.admin.tab === 'books') {
      const categoryOptions = state.admin.categories
        .map(
          (cat) =>
            `<option value="${cat.id}" ${state.admin.editingBook?.category?.id === cat.id ? 'selected' : ''}>${cat.name}</option>`
        )
        .join('');

      const bookRows = state.admin.books
        .map(
          (book) => `
        <div class="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover-card">
          <div class="flex justify-between">
            <div>
              <h4 class="font-semibold">${book.title}</h4>
              <p class="text-sm text-slate-500">${book.author} · ${book.isbn}</p>
            </div>
            <span class="badge ${book.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${book.status === 'ACTIVE' ? '上架中' : '已下架'}</span>
          </div>
          <div class="flex flex-wrap gap-2 text-sm text-slate-600">
            <span>价格：${formatCurrency(book.price)}</span>
            <span>库存：${book.stock}</span>
            <span>分类：${book.category?.name || '-'}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-outline" data-action="edit-book" data-id="${book.id}">编辑</button>
            ${book.status === 'ACTIVE'
              ? `<button class="btn-outline" data-action="deactivate-book" data-id="${book.id}">下架</button>`
              : `<button class="btn-outline" data-action="restore-book" data-id="${book.id}">上架</button>`}
          </div>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">${state.admin.editingBook ? '编辑书籍' : '新增书籍'}</h3>
          <form data-form="admin-book" class="grid md:grid-cols-2 gap-3" novalidate>
            <div class="space-y-1">
              <input class="input" name="title" placeholder="书名" value="${state.admin.editingBook?.title || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="author" placeholder="作者" value="${state.admin.editingBook?.author || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="isbn" placeholder="ISBN" value="${state.admin.editingBook?.isbn || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="price" placeholder="价格" value="${state.admin.editingBook?.price || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="stock" placeholder="库存" value="${state.admin.editingBook?.stock || ''}" required />
            </div>
            <div class="space-y-1">
              <select class="input" name="categoryId" required>
                <option value="">选择分类</option>
                ${categoryOptions}
              </select>
            </div>
            <div class="space-y-2">
              <input class="input" type="file" name="coverFile" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" />
              ${state.admin.editingBook?.coverUrl ? `<div class="flex items-center gap-3 text-xs text-slate-500"><img src="${state.admin.editingBook.coverUrl}" alt="cover" class="w-16 h-16 rounded-lg object-contain bg-white border border-slate-200" /><span>当前封面</span></div>` : '<p class="text-xs text-slate-500">支持 jpg/png/webp/gif/svg，最大 2MB</p>'}
            </div>
            <div class="space-y-1 md:col-span-2">
              <textarea class="input" name="description" placeholder="书籍简介" rows="3" required>${state.admin.editingBook?.description || ''}</textarea>
            </div>
            <div class="md:col-span-2 flex justify-end">
              <button class="btn-primary" type="submit">${state.admin.editingBook ? '保存修改' : '添加书籍'}</button>
            </div>
          </form>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">${bookRows || '<div class="text-slate-500">暂无书籍</div>'}</div>
      `;
    }

    if (state.admin.tab === 'categories') {
      const categoryList = state.admin.categories
        .map(
          (cat) => `
        <div class="border border-slate-200 rounded-xl p-4 flex items-center justify-between hover-card">
          <span>${cat.name}</span>
          <button class="btn-outline" data-action="delete-category" data-id="${cat.id}">删除</button>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">新增分类</h3>
          <form data-form="admin-category" class="flex flex-col md:flex-row gap-3" novalidate>
            <div class="flex-1 space-y-1">
              <input class="input" name="name" placeholder="分类名称" required />
            </div>
            <button class="btn-primary" type="submit">添加</button>
          </form>
        </div>
        <div class="grid md:grid-cols-2 gap-4">${categoryList || '<div class="text-slate-500">暂无分类</div>'}</div>
      `;
    }

    if (state.admin.tab === 'coupons') {
      const editingCoupon = state.admin.editingCoupon;
      const couponRows = state.admin.coupons
        .map(
          (coupon) => `
        <div class="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover-card">
          <div class="flex justify-between items-start">
            <div>
              <h4 class="font-semibold">${coupon.name}</h4>
              <p class="text-sm text-slate-500">券码：${coupon.code}</p>
            </div>
            <span class="badge ${coupon.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${coupon.status === 'ACTIVE' ? '启用中' : '已停用'}</span>
          </div>
          <div class="flex flex-wrap gap-2 text-sm text-slate-600">
            <span>类型：${coupon.type === 'FIXED' ? '固定减免' : '折扣'}</span>
            <span>面值：${coupon.type === 'FIXED' ? formatCurrency(coupon.value) : `${coupon.value}%`}</span>
            <span>门槛：${formatCurrency(coupon.minAmount)}</span>
            <span>已用：${coupon.usedCount || 0} 次</span>
          </div>
          ${coupon.expiresAt ? `<p class="text-xs text-slate-400">有效期至 ${new Date(coupon.expiresAt).toLocaleDateString()}</p>` : ''}
          <div class="flex flex-wrap gap-2">
            <button class="btn-outline" data-action="edit-coupon" data-id="${coupon.id}">编辑</button>
            ${coupon.status === 'ACTIVE'
              ? `<button class="btn-outline" data-action="deactivate-coupon" data-id="${coupon.id}">停用</button>`
              : `<button class="btn-outline" data-action="activate-coupon" data-id="${coupon.id}">启用</button>`}
          </div>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">${editingCoupon ? '编辑优惠券' : '新增优惠券'}</h3>
          <form data-form="admin-coupon" class="grid md:grid-cols-2 gap-3" novalidate>
            <input type="hidden" name="couponId" value="${editingCoupon?.id || ''}" />
            <div class="space-y-1">
              <input class="input" name="code" placeholder="券码（如 SAVE10）" value="${escapeHtmlAttr(editingCoupon?.code || '')}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="name" placeholder="优惠券名称" value="${escapeHtmlAttr(editingCoupon?.name || '')}" required />
            </div>
            <div class="space-y-1">
              <select class="input" name="type" required>
                <option value="">选择类型</option>
                <option value="FIXED" ${editingCoupon?.type === 'FIXED' ? 'selected' : ''}>固定减免</option>
                <option value="PERCENTAGE" ${editingCoupon?.type === 'PERCENTAGE' ? 'selected' : ''}>折扣</option>
              </select>
            </div>
            <div class="space-y-1">
              <input class="input" name="value" placeholder="面值（元 或 百分比）" value="${editingCoupon?.value || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="minAmount" placeholder="最低消费（元）" value="${editingCoupon?.minAmount || ''}" />
            </div>
            <div class="space-y-1">
              <input class="input" name="maxDiscount" placeholder="最大折扣金额（元，仅折扣券）" value="${editingCoupon?.maxDiscount || ''}" />
            </div>
            <div class="space-y-1">
              <input class="input" type="datetime-local" name="startsAt" placeholder="生效时间" value="${editingCoupon?.startsAt ? new Date(editingCoupon.startsAt).toISOString().slice(0, 16) : ''}" />
            </div>
            <div class="space-y-1">
              <input class="input" type="datetime-local" name="expiresAt" placeholder="过期时间" value="${editingCoupon?.expiresAt ? new Date(editingCoupon.expiresAt).toISOString().slice(0, 16) : ''}" />
            </div>
            <div class="space-y-1">
              <input class="input" name="usageLimit" placeholder="总使用次数限制" value="${editingCoupon?.usageLimit || ''}" />
            </div>
            <div class="space-y-1">
              <input class="input" name="perUserLimit" placeholder="每人限用次数" value="${editingCoupon?.perUserLimit || ''}" />
            </div>
            <div class="md:col-span-2 flex justify-end gap-2">
              <button class="btn-primary" type="submit">${editingCoupon ? '保存修改' : '添加优惠券'}</button>
              ${editingCoupon ? '<button class="btn-outline" type="button" data-action="cancel-edit-coupon">取消编辑</button>' : ''}
            </div>
          </form>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">${couponRows || '<div class="text-slate-500">暂无优惠券</div>'}</div>
      `;
    }

    if (state.admin.tab === 'orders') {
      const stats = state.admin.stats || { statusCounts: {}, revenue: 0 };
      const orderCards = state.admin.orders
        .map(
          (order) => `
        <div class="border border-slate-200 rounded-xl p-4 space-y-3 hover-card">
          <div class="flex justify-between">
            <div>
              <p class="text-xs text-slate-400">订单号 ${order.id}</p>
              <p class="font-semibold">${order.user.username} · ${formatStatus(order.status)}</p>
            </div>
            <p class="font-semibold">${formatCurrency(order.total)}</p>
          </div>
          <div class="text-xs text-slate-500">${order.recipient} ${order.phone}</div>
          <div class="flex flex-wrap gap-2">
            ${order.status === 'PENDING_PAYMENT' ? `<button class="btn-outline" data-action="admin-accept" data-id="${order.id}">接单</button>` : ''}
            ${order.status === 'PAID' ? `<button class="btn-outline" data-action="admin-ship" data-id="${order.id}">发货</button>` : ''}
            ${['PAID', 'SHIPPED'].includes(order.status) ? `<button class="btn-outline" data-action="admin-refund" data-id="${order.id}">退款</button>` : ''}
          </div>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold">订单统计</h3>
              <p class="text-sm text-slate-500">实时订单数据与收入</p>
            </div>
            <button class="btn-outline" data-action="export-orders">导出报表</button>
          </div>
          <div class="grid md:grid-cols-4 gap-3">
            ${Object.entries(stats.statusCounts)
              .map(
                ([key, value]) => `
              <div class="bg-slate-50 rounded-xl p-3">
                <p class="text-xs text-slate-400">${formatStatus(key)}</p>
                <p class="text-lg font-semibold">${value}</p>
              </div>
            `
              )
              .join('')}
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-xs text-slate-400">累计收入</p>
              <p class="text-lg font-semibold">${formatCurrency(stats.revenue)}</p>
            </div>
          </div>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">${orderCards || '<div class="text-slate-500">暂无订单</div>'}</div>
      `;
    }

    viewContent.innerHTML = `${adminTabs}${content}`;
  }

  const viewRenderers = {
    books: renderBooks,
    cart: renderCart,
    orders: renderOrders,
    profile: renderProfile,
    admin: renderAdmin
  };

  function renderView() {
    setNavActive(state.view);
    const renderer = viewRenderers[state.view];
    if (renderer) renderer();
  }

  function safeRender() {
    try {
      renderView();
    } catch (error) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">页面渲染失败，请刷新重试。</div>`;
      showToast('页面渲染失败', 'error');
    }
  }

  return {
    formatCurrency,
    formatStatus,
    setNavActive,
    updateAuthUI,
    renderView,
    safeRender
  };
}
