const express = require('express');
const prisma = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../errors');
const { applyCouponSchema } = require('../validators');
const { fromCents } = require('../utils/money');

const router = express.Router();

function mapCouponForUser(coupon, userUsageCount, isUsed) {
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    value: coupon.type === 'FIXED' ? fromCents(coupon.value) : coupon.value,
    minAmount: fromCents(coupon.minAmountCents),
    maxDiscount: coupon.maxDiscountCents ? fromCents(coupon.maxDiscountCents) : null,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    status: coupon.status,
    isUsed,
    userUsageCount
  };
}

function isCouponAvailable(coupon, userUsageCount, subtotalCents) {
  if (coupon.status !== 'ACTIVE') return false;

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return false;

  if (coupon.usageLimit !== null && coupon._count?.userCoupons >= coupon.usageLimit) return false;
  if (coupon.perUserLimit !== null && userUsageCount >= coupon.perUserLimit) return false;

  if (subtotalCents !== undefined && subtotalCents < coupon.minAmountCents) return false;

  return true;
}

router.get('/', asyncHandler(async (req, res) => {
  const now = new Date();

  const coupons = await prisma.coupon.findMany({
    where: {
      status: 'ACTIVE'
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { userCoupons: { where: { usedAt: { not: null } } } }
      }
    }
  });

  const userCoupons = await prisma.userCoupon.findMany({
    where: { userId: req.user.id, usedAt: { not: null } },
    select: { couponId: true }
  });

  const usedCouponIds = new Set(userCoupons.map((uc) => uc.couponId));

  const userUsageCountMap = {};
  for (const coupon of coupons) {
    const count = userCoupons.filter((uc) => uc.couponId === coupon.id).length;
    userUsageCountMap[coupon.id] = count;
  }

  const result = coupons.map((coupon) => {
    const userUsageCount = userUsageCountMap[coupon.id] || 0;
    const isUsed = usedCouponIds.has(coupon.id);
    return mapCouponForUser(coupon, userUsageCount, isUsed);
  });

  res.json(result);
}));

router.post('/validate', asyncHandler(async (req, res) => {
  const payload = applyCouponSchema.parse(req.body);
  const code = payload.code.toUpperCase();

  const coupon = await prisma.coupon.findUnique({
    where: { code },
    include: {
      _count: {
        select: { userCoupons: { where: { usedAt: { not: null } } } }
      }
    }
  });

  if (!coupon) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  const userUsageCount = await prisma.userCoupon.count({
    where: {
      userId: req.user.id,
      couponId: coupon.id,
      usedAt: { not: null }
    }
  });

  const isUsed = userUsageCount > 0 && coupon.perUserLimit !== null && userUsageCount >= coupon.perUserLimit;

  const now = new Date();
  let isValid = coupon.status === 'ACTIVE';
  let reason = '';

  if (coupon.status !== 'ACTIVE') {
    reason = '优惠券已停用';
    isValid = false;
  } else if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    reason = '优惠券尚未生效';
    isValid = false;
  } else if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    reason = '优惠券已过期';
    isValid = false;
  } else if (coupon.usageLimit !== null && coupon._count.userCoupons >= coupon.usageLimit) {
    reason = '优惠券已被领完';
    isValid = false;
  } else if (coupon.perUserLimit !== null && userUsageCount >= coupon.perUserLimit) {
    reason = '您已使用过该优惠券';
    isValid = false;
  }

  res.json({
    coupon: mapCouponForUser(coupon, userUsageCount, isUsed),
    isValid,
    reason
  });
}));

router.post('/calculate', asyncHandler(async (req, res) => {
  const { couponId, subtotal } = req.body;

  if (!couponId) {
    const subtotalCents = Math.round(Number(subtotal || 0) * 100);
    res.json({
      subtotal: fromCents(subtotalCents),
      discount: 0,
      total: fromCents(subtotalCents),
      coupon: null
    });
    return;
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    include: {
      _count: {
        select: { userCoupons: { where: { usedAt: { not: null } } } }
      }
    }
  });

  if (!coupon) {
    throw new ApiError(404, 'COUPON_NOT_FOUND');
  }

  const userUsageCount = await prisma.userCoupon.count({
    where: {
      userId: req.user.id,
      couponId: coupon.id,
      usedAt: { not: null }
    }
  });

  const subtotalCents = Math.round(Number(subtotal || 0) * 100);
  const available = isCouponAvailable(coupon, userUsageCount, subtotalCents);

  if (!available) {
    throw new ApiError(400, 'COUPON_NOT_APPLICABLE');
  }

  let discountCents = 0;
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

  const totalCents = subtotalCents - discountCents;

  res.json({
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    total: fromCents(Math.max(0, totalCents)),
    coupon: mapCouponForUser(coupon, userUsageCount, false)
  });
}));

module.exports = router;
