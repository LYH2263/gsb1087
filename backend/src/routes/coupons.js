const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { couponApplySchema } = require('../validators');

const router = express.Router();

function mapCoupon(coupon, available, unavailableReason) {
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountValue: coupon.discountValue,
    minOrderCents: coupon.minOrderCents,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
    status: coupon.status,
    available,
    unavailableReason
  };
}

function checkAvailability(coupon, now, usedCouponIds) {
  const isExpired = now > coupon.expiresAt;
  const isNotStarted = now < coupon.startsAt;
  const isUsedUp = coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;
  const isUsedByUser = usedCouponIds.has(coupon.id);

  if (isExpired) return { available: false, reason: 'expired' };
  if (isNotStarted) return { available: false, reason: 'not_started' };
  if (isUsedUp) return { available: false, reason: 'used_up' };
  if (isUsedByUser) return { available: false, reason: 'already_used' };
  return { available: true, reason: null };
}

router.get('/', asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' }
  });

  const usedCoupons = await prisma.order.findMany({
    where: {
      userId: req.user.id,
      couponId: { not: null },
      status: { not: 'CANCELED' }
    },
    select: { couponId: true }
  });
  const usedCouponIds = new Set(usedCoupons.map(o => o.couponId));

  const result = coupons.map(coupon => {
    const { available, reason } = checkAvailability(coupon, now, usedCouponIds);
    return mapCoupon(coupon, available, reason);
  });

  res.json(result);
}));

router.post('/apply', asyncHandler(async (req, res) => {
  const { code } = couponApplySchema.parse(req.body);

  const coupon = await prisma.coupon.findUnique({
    where: { code }
  });

  if (!coupon) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  if (coupon.status !== 'ACTIVE') {
    throw new ApiError(400, 'COUPON_NOT_ACTIVE');
  }

  const now = new Date();
  if (now > coupon.expiresAt) {
    throw new ApiError(400, 'COUPON_EXPIRED');
  }
  if (now < coupon.startsAt) {
    throw new ApiError(400, 'COUPON_NOT_STARTED');
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError(400, 'COUPON_USED_UP');
  }

  const existingUse = await prisma.order.findFirst({
    where: {
      userId: req.user.id,
      couponId: coupon.id,
      status: { not: 'CANCELED' }
    }
  });
  if (existingUse) {
    throw new ApiError(400, 'COUPON_ALREADY_USED');
  }

  res.json(mapCoupon(coupon, true, null));
}));

module.exports = router;
