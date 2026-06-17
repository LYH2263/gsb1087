const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { couponCheckoutSchema, reviewSchema } = require('../validators');
const { fromCents, toCents } = require('../utils/money');

const router = express.Router();

function mapOrder(order) {
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: fromCents(order.subtotalCents),
    discount: fromCents(order.discountCents),
    total: fromCents(order.totalCents),
    coupon: order.coupon ? {
      id: order.coupon.id,
      code: order.coupon.code,
      name: order.coupon.name,
      type: order.coupon.type
    } : null,
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

router.post('/checkout', asyncHandler(async (req, res) => {
  const payload = couponCheckoutSchema.parse(req.body);

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

  let discountCents = 0;
  let coupon = null;

  if (payload.couponId) {
    coupon = await prisma.coupon.findUnique({
      where: { id: payload.couponId },
      include: {
        _count: {
          select: { userCoupons: { where: { usedAt: { not: null } } } }
        }
      }
    });

    if (!coupon) {
      throw new ApiError(404, 'COUPON_NOT_FOUND');
    }

    const now = new Date();
    if (coupon.status !== 'ACTIVE') {
      throw new ApiError(400, 'COUPON_INACTIVE');
    }
    if (coupon.startsAt && new Date(coupon.startsAt) > now) {
      throw new ApiError(400, 'COUPON_NOT_STARTED');
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
      throw new ApiError(400, 'COUPON_EXPIRED');
    }
    if (subtotalCents < coupon.minAmountCents) {
      throw new ApiError(400, 'COUPON_BELOW_THRESHOLD');
    }
    if (coupon.usageLimit !== null && coupon._count.userCoupons >= coupon.usageLimit) {
      throw new ApiError(400, 'COUPON_USAGE_LIMIT_REACHED');
    }

    const userUsageCount = await prisma.userCoupon.count({
      where: {
        userId: req.user.id,
        couponId: coupon.id,
        usedAt: { not: null }
      }
    });

    if (coupon.perUserLimit !== null && userUsageCount >= coupon.perUserLimit) {
      throw new ApiError(400, 'COUPON_ALREADY_USED');
    }

    if (coupon.type === 'FIXED') {
      discountCents = coupon.value;
    } else if (coupon.type === 'PERCENTAGE') {
      discountCents = Math.floor(subtotalCents * coupon.value / 100);
      if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
        discountCents = coupon.maxDiscountCents;
      }
    }

    if (discountCents > subtotalCents) {
      discountCents = subtotalCents;
    }
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: req.user.id,
        paymentMethod: payload.paymentMethod,
        subtotalCents,
        discountCents,
        totalCents,
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

    await tx.cartItem.deleteMany({
      where: { userId: req.user.id }
    });

    if (coupon) {
      await tx.userCoupon.create({
        data: {
          userId: req.user.id,
          couponId: coupon.id,
          orderId: created.id,
          usedAt: new Date()
        }
      });
    }

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
