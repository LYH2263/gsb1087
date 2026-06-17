const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { couponRedeemSchema } = require('../validators');
const { fromCents } = require('../utils/money');

const router = express.Router();

function calculateDiscount(coupon, subtotalCents) {
  if (subtotalCents < coupon.minAmountCents) {
    return { discountCents: 0, valid: false, reason: '未达使用门槛' };
  }

  let discountCents = 0;
  if (coupon.type === 'FIXED') {
    discountCents = coupon.valueCents || 0;
  } else if (coupon.type === 'PERCENT') {
    discountCents = Math.floor(subtotalCents * (coupon.percent || 0) / 100);
  }

  if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
    discountCents = coupon.maxDiscountCents;
  }

  if (discountCents > subtotalCents) {
    discountCents = subtotalCents;
  }

  return { discountCents, valid: true, reason: '' };
}

function mapUserCoupon(userCoupon, subtotalCents = 0) {
  const coupon = userCoupon.coupon;
  const now = new Date();
  let status = 'available';
  let reason = '';

  if (userCoupon.usedAt) {
    status = 'used';
    reason = '已使用';
  } else if (coupon.status !== 'ACTIVE') {
    status = 'disabled';
    reason = '已失效';
  } else if (coupon.startsAt && coupon.startsAt > now) {
    status = 'not_started';
    reason = '未到使用时间';
  } else if (coupon.expiresAt && coupon.expiresAt < now) {
    status = 'expired';
    reason = '已过期';
  }

  let discountInfo = { discountCents: 0, valid: false, reason: '' };
  if (status === 'available' && subtotalCents > 0) {
    discountInfo = calculateDiscount(coupon, subtotalCents);
    if (!discountInfo.valid) {
      status = 'not_eligible';
      reason = discountInfo.reason;
    }
  }

  return {
    id: userCoupon.id,
    couponId: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    value: coupon.valueCents ? fromCents(coupon.valueCents) : null,
    percent: coupon.percent,
    minAmount: fromCents(coupon.minAmountCents),
    maxDiscount: coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    status,
    reason,
    usedAt: userCoupon.usedAt,
    discount: discountInfo.valid ? fromCents(discountInfo.discountCents) : 0
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const userCoupons = await prisma.userCoupon.findMany({
    where: { userId: req.user.id },
    include: { coupon: true },
    orderBy: { createdAt: 'desc' }
  });

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { book: true }
  });

  const subtotalCents = cartItems.reduce(
    (sum, item) => sum + item.book.priceCents * item.quantity,
    0
  );

  res.json(userCoupons.map((uc) => mapUserCoupon(uc, subtotalCents)));
}));

router.post('/redeem', asyncHandler(async (req, res) => {
  const payload = couponRedeemSchema.parse(req.body);

  const coupon = await prisma.coupon.findUnique({
    where: { code: payload.code.toUpperCase() }
  });

  if (!coupon) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  if (coupon.status !== 'ACTIVE') {
    throw new ApiError(400, 'COUPON_INACTIVE');
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new ApiError(400, 'COUPON_NOT_STARTED');
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    throw new ApiError(400, 'COUPON_EXPIRED');
  }

  const existing = await prisma.userCoupon.findUnique({
    where: {
      userId_couponId: {
        userId: req.user.id,
        couponId: coupon.id
      }
    }
  });

  if (existing) {
    const userCount = await prisma.userCoupon.count({
      where: { userId: req.user.id, couponId: coupon.id }
    });
    if (userCount >= coupon.perUserLimit) {
      throw new ApiError(400, 'COUPON_ALREADY_REDEEMED');
    }
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError(400, 'COUPON_SOLD_OUT');
  }

  const userCoupon = await prisma.$transaction(async (tx) => {
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } }
    });

    return tx.userCoupon.create({
      data: {
        userId: req.user.id,
        couponId: coupon.id
      },
      include: { coupon: true }
    });
  });

  res.status(201).json(mapUserCoupon(userCoupon));
}));

router.post('/calculate', asyncHandler(async (req, res) => {
  const { userCouponId } = req.body;
  if (!userCouponId) {
    throw new ApiError(400, 'USER_COUPON_ID_REQUIRED');
  }

  const userCoupon = await prisma.userCoupon.findUnique({
    where: { id: userCouponId },
    include: { coupon: true }
  });

  if (!userCoupon || userCoupon.userId !== req.user.id) {
    throw new ApiError(404, 'USER_COUPON_NOT_FOUND');
  }

  if (userCoupon.usedAt) {
    throw new ApiError(400, 'COUPON_ALREADY_USED');
  }

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { book: true }
  });

  if (cartItems.length === 0) {
    throw new ApiError(400, 'CART_EMPTY');
  }

  const subtotalCents = cartItems.reduce(
    (sum, item) => sum + item.book.priceCents * item.quantity,
    0
  );

  const coupon = userCoupon.coupon;
  const result = calculateDiscount(coupon, subtotalCents);

  if (!result.valid) {
    throw new ApiError(400, 'COUPON_NOT_ELIGIBLE');
  }

  const finalCents = subtotalCents - result.discountCents;

  res.json({
    userCouponId: userCoupon.id,
    couponId: coupon.id,
    couponName: coupon.name,
    couponCode: coupon.code,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(result.discountCents),
    final: fromCents(finalCents < 0 ? 0 : finalCents)
  });
}));

module.exports = router;
module.exports.calculateDiscount = calculateDiscount;
