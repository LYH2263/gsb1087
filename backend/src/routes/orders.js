const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { checkoutSchema, checkoutCouponSchema, reviewSchema, applyCouponSchema } = require('../validators');
const { fromCents } = require('../utils/money');

const router = express.Router();

function mapOrder(order) {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    total: fromCents(order.totalCents),
    subtotal: order.subtotalCents ? fromCents(order.subtotalCents) : null,
    discount: order.discountCents ? fromCents(order.discountCents) : null,
    couponId: order.couponId,
    couponCode: order.coupon?.code || null,
    couponName: order.coupon?.name || null,
    recipient: order.recipient,
    phone: order.phone,
    line1: order.line1,
    city: order.city,
    state: order.state,
    postalCode: order.postalCode,
    rating: order.rating,
    reviewText: order.reviewText,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      price: fromCents(item.priceCents),
      quantity: item.quantity
    }))
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    include: { items: true, coupon: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(orders.map(mapOrder));
}));

function mapCouponForUser(coupon, usedCount, cartTotalCents) {
  const now = new Date();
  const isExpired = coupon.expiresAt && coupon.expiresAt < now;
  const notStarted = coupon.startsAt && coupon.startsAt > now;
  const belowThreshold = cartTotalCents < coupon.minAmountCents;
  const usedUp = coupon.totalQuantity > 0 && coupon.usedQuantity >= coupon.totalQuantity;
  const perUserUsed = usedCount >= coupon.perUserLimit;

  const isAvailable = coupon.status === 'ACTIVE'
    && !isExpired
    && !notStarted
    && !usedUp
    && !perUserUsed;

  const reason = !isAvailable
    ? [
        coupon.status !== 'ACTIVE' ? '已停用' : null,
        notStarted ? '未到生效时间' : null,
        isExpired ? '已过期' : null,
        usedUp ? '已领完' : null,
        perUserUsed ? '已使用' : null,
        belowThreshold ? '未满门槛' : null
      ].filter(Boolean).join('、')
    : null;

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    value: coupon.valueCents ? fromCents(coupon.valueCents) : null,
    percent: coupon.percent,
    minAmount: fromCents(coupon.minAmountCents),
    maxDiscount: coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    isAvailable,
    reason
  };
}

function calculateDiscount(coupon, totalCents) {
  let discountCents = 0;
  if (coupon.type === 'FIXED') {
    discountCents = coupon.valueCents || 0;
  } else if (coupon.type === 'PERCENT') {
    discountCents = Math.floor(totalCents * (coupon.percent || 0) / 100);
    if (coupon.maxDiscountCents) {
      discountCents = Math.min(discountCents, coupon.maxDiscountCents);
    }
  }
  if (discountCents > totalCents) {
    discountCents = totalCents;
  }
  return discountCents;
}

async function getCartTotalCents(userId) {
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: { book: true }
  });
  return cartItems.reduce((sum, item) => sum + item.book.priceCents * item.quantity, 0);
}

router.get('/coupons/available', asyncHandler(async (req, res) => {
  const [coupons, usedCoupons, cartTotalCents] = await Promise.all([
    prisma.coupon.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.userCoupon.findMany({
      where: { userId: req.user.id },
      select: { couponId: true }
    }),
    getCartTotalCents(req.user.id)
  ]);

  const usedCountMap = {};
  usedCoupons.forEach((uc) => {
    usedCountMap[uc.couponId] = (usedCountMap[uc.couponId] || 0) + 1;
  });

  const result = coupons.map((coupon) =>
    mapCouponForUser(coupon, usedCountMap[coupon.id] || 0, cartTotalCents)
  );

  res.json({
    coupons: result,
    cartTotal: fromCents(cartTotalCents)
  });
}));

router.post('/coupons/apply', asyncHandler(async (req, res) => {
  const payload = applyCouponSchema.parse(req.body);

  const coupon = await prisma.coupon.findUnique({
    where: { code: payload.code.toUpperCase() }
  });

  if (!coupon) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  const [usedCount, cartTotalCents] = await Promise.all([
    prisma.userCoupon.count({
      where: { userId: req.user.id, couponId: coupon.id }
    }),
    getCartTotalCents(req.user.id)
  ]);

  const mapped = mapCouponForUser(coupon, usedCount, cartTotalCents);
  const discountCents = calculateDiscount(coupon, cartTotalCents);

  res.json({
    coupon: mapped,
    cartTotal: fromCents(cartTotalCents),
    discount: fromCents(discountCents),
    finalTotal: fromCents(Math.max(0, cartTotalCents - discountCents))
  });
}));

router.post('/checkout', asyncHandler(async (req, res) => {
  const payload = checkoutCouponSchema.parse(req.body);

  const address = await prisma.address.findUnique({
    where: { id: payload.addressId }
  });

  if (!address || address.userId !== req.user.id) {
    throw new ApiError(404, 'ADDRESS_NOT_FOUND');
  }

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { book: true }
  });

  if (cartItems.length === 0) {
    throw new ApiError(400, 'CART_EMPTY');
  }

  for (const item of cartItems) {
    if (item.book.status !== 'ACTIVE') {
      throw new ApiError(400, 'BOOK_NOT_AVAILABLE');
    }
    if (item.book.stock < item.quantity) {
      throw new ApiError(400, 'INSUFFICIENT_STOCK');
    }
  }

  const subtotalCents = cartItems.reduce(
    (sum, item) => sum + item.book.priceCents * item.quantity,
    0
  );

  let coupon = null;
  let discountCents = 0;
  let totalCents = subtotalCents;

  if (payload.couponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: payload.couponId }
    });

    if (!coupon) {
      throw new ApiError(404, 'COUPON_NOT_FOUND');
    }

    const usedCount = await prisma.userCoupon.count({
      where: { userId: req.user.id, couponId: coupon.id }
    });

    const now = new Date();
    if (coupon.status !== 'ACTIVE') {
      throw new ApiError(400, 'COUPON_INACTIVE');
    }
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new ApiError(400, 'COUPON_NOT_STARTED');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new ApiError(400, 'COUPON_EXPIRED');
    }
    if (coupon.totalQuantity > 0 && coupon.usedQuantity >= coupon.totalQuantity) {
      throw new ApiError(400, 'COUPON_SOLD_OUT');
    }
    if (usedCount >= coupon.perUserLimit) {
      throw new ApiError(400, 'COUPON_ALREADY_USED');
    }
    if (subtotalCents < coupon.minAmountCents) {
      throw new ApiError(400, 'COUPON_BELOW_THRESHOLD');
    }

    discountCents = calculateDiscount(coupon, subtotalCents);
    totalCents = Math.max(0, subtotalCents - discountCents);
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: req.user.id,
        paymentMethod: payload.paymentMethod,
        totalCents,
        subtotalCents,
        discountCents,
        couponId: coupon?.id || null,
        recipient: address.recipient,
        phone: address.phone,
        line1: address.line1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        status: 'PENDING_PAYMENT'
      }
    });

    const orderItems = cartItems.map((item) => ({
      orderId: created.id,
      bookId: item.bookId,
      title: item.book.title,
      author: item.book.author,
      coverUrl: item.book.coverUrl,
      priceCents: item.book.priceCents,
      quantity: item.quantity
    }));

    await tx.orderItem.createMany({ data: orderItems });

    for (const item of cartItems) {
      await tx.book.update({
        where: { id: item.bookId },
        data: { stock: { decrement: item.quantity } }
      });
    }

    if (coupon) {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedQuantity: { increment: 1 } }
      });
      await tx.userCoupon.create({
        data: {
          userId: req.user.id,
          couponId: coupon.id,
          orderId: created.id
        }
      });
    }

    await tx.cartItem.deleteMany({
      where: { userId: req.user.id }
    });

    return created;
  });

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true, coupon: true }
  });

  res.status(201).json(mapOrder(fullOrder));
}));

router.post('/:id/pay', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'ORDER_NOT_PAYABLE');
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'PAID' }
    });

    for (const item of order.items) {
      await tx.book.update({
        where: { id: item.bookId },
        data: { sales: { increment: item.quantity } }
      });
    }
  });

  const updated = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true }
  });

  res.json(mapOrder(updated));
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'PENDING_PAYMENT') {
    throw new ApiError(400, 'ORDER_NOT_CANCELABLE');
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELED' }
    });

    for (const item of order.items) {
      await tx.book.update({
        where: { id: item.bookId },
        data: { stock: { increment: item.quantity } }
      });
    }
  });

  res.json({ message: 'order canceled' });
}));

router.post('/:id/confirm', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'SHIPPED') {
    throw new ApiError(400, 'ORDER_NOT_SHIPPED');
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'COMPLETED' }
  });

  res.json({ message: 'order completed' });
}));

router.post('/:id/review', asyncHandler(async (req, res) => {
  const payload = reviewSchema.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: req.params.id }
  });

  if (!order || order.userId !== req.user.id) {
    throw new ApiError(404, 'ORDER_NOT_FOUND');
  }

  if (order.status !== 'COMPLETED') {
    throw new ApiError(400, 'ORDER_NOT_COMPLETED');
  }

  if (order.reviewedAt) {
    throw new ApiError(400, 'ORDER_ALREADY_REVIEWED');
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      rating: payload.rating,
      reviewText: payload.reviewText,
      reviewedAt: new Date()
    }
  });

  res.json({ message: 'review submitted' });
}));

module.exports = router;
