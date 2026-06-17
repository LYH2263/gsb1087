const { z } = require('zod');

const passwordRule = z
  .string()
  .min(8, '密码至少 8 位')
  .regex(/[A-Z]/, '至少包含一个大写字母')
  .regex(/[a-z]/, '至少包含一个小写字母')
  .regex(/[0-9]/, '至少包含一个数字');

const phoneRule = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确');

const registerSchema = z.object({
  username: z.string().min(2, '用户名过短').max(20, '用户名过长'),
  password: passwordRule,
  phone: phoneRule,
  email: z.string().email('邮箱格式不正确')
});

const loginSchema = z.object({
  account: z.string().min(2),
  password: z.string().min(6),
  remember: z.boolean().optional()
});

const forgotPasswordSchema = z.object({
  account: z.string().min(2),
  method: z.enum(['email', 'sms'])
});

const resetPasswordSchema = z.object({
  token: z.string().min(6),
  newPassword: passwordRule
});

const coverUrlRule = z
  .string()
  .min(1, '封面必填')
  .refine(
    (value) =>
      value.startsWith('/uploads/') ||
      value.startsWith('/covers/') ||
      /^https?:\/\//.test(value),
    '封面地址不合法'
  );

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  isbn: z.string().regex(/^[0-9X]{10,13}$/, 'ISBN 格式不正确'),
  description: z.string().min(10),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  coverUrl: coverUrlRule,
  categoryId: z.string().min(1)
});

const bookUpdateSchema = bookSchema.partial();

const categorySchema = z.object({
  name: z.string().min(1).max(20)
});

const cartAddSchema = z.object({
  bookId: z.string().min(1),
  quantity: z.number().int().min(1).max(99)
});

const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(99)
});

const addressSchema = z.object({
  recipient: z.string().min(1),
  phone: phoneRule,
  line1: z.string().min(3),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(4),
  isDefault: z.boolean().optional()
});

const checkoutSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(['WECHAT', 'ALIPAY', 'CARD', 'COD'])
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().min(3).max(200)
});

const couponBaseSchema = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z0-9_-]+$/, '券码仅支持大写字母、数字、下划线和短横线'),
  name: z.string().min(1).max(50),
  type: z.enum(['FIXED', 'PERCENT']),
  value: z.number().positive().optional(),
  percent: z.number().int().min(1).max(99).optional(),
  minAmount: z.number().min(0).optional(),
  maxDiscount: z.number().positive().optional(),
  totalQuantity: z.number().int().min(0).optional(),
  perUserLimit: z.number().int().min(1).optional(),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional()
});

const couponCreateSchema = couponBaseSchema.refine((data) => {
  if (data.type === 'FIXED') {
    return data.value !== undefined && data.value > 0;
  }
  return data.percent !== undefined && data.percent >= 1 && data.percent <= 99;
}, { message: '固定券需指定金额，折扣券需指定折扣比例', path: ['type'] });

const couponUpdateSchema = couponBaseSchema.partial().refine((data) => {
  if (data.type === 'FIXED') {
    return data.value !== undefined && data.value > 0;
  }
  if (data.type === 'PERCENT') {
    return data.percent !== undefined && data.percent >= 1 && data.percent <= 99;
  }
  return true;
}, { message: '固定券需指定金额，折扣券需指定折扣比例', path: ['type'] });

const applyCouponSchema = z.object({
  code: z.string().min(2, '请输入券码')
});

const checkoutCouponSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(['WECHAT', 'ALIPAY', 'CARD', 'COD']),
  couponId: z.string().optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  bookSchema,
  bookUpdateSchema,
  categorySchema,
  cartAddSchema,
  cartUpdateSchema,
  addressSchema,
  checkoutSchema,
  reviewSchema,
  couponCreateSchema,
  couponUpdateSchema,
  applyCouponSchema,
  checkoutCouponSchema
};
