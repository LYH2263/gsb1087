export const state = {
  user: null,
  view: 'books',
  books: [],
  categories: [],
  bookSearch: {
    title: '',
    author: '',
    isbn: '',
    categoryId: '',
    sort: '',
    minPrice: '',
    maxPrice: ''
  },
  cart: [],
  orders: [],
  addresses: [],
  userCoupons: [],
  selectedUserCouponId: null,
  couponCalculation: null,
  loading: {
    books: false,
    cart: false,
    orders: false,
    addresses: false,
    coupons: false,
    admin: false
  },
  admin: {
    tab: 'books',
    books: [],
    categories: [],
    coupons: [],
    orders: [],
    stats: null,
    editingBook: null,
    editingCoupon: null
  },
  profile: {
    editingAddress: null
  }
};

export function normalizeBookSearch(params = {}) {
  return {
    title: String(params.title || '').trim(),
    author: String(params.author || '').trim(),
    isbn: String(params.isbn || '').trim(),
    categoryId: String(params.categoryId || '').trim(),
    sort: String(params.sort || '').trim(),
    minPrice: String(params.minPrice || '').trim(),
    maxPrice: String(params.maxPrice || '').trim()
  };
}

export function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
