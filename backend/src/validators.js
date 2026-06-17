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

const couponCreateSchema = z.object({
  code: z.string().min(2, '券码至少 2 位').max(20, '券码最长 20 位'),
  name: z.string().min(1, '优惠券名称必填').max(50, '名称最长 50 字'),
  type: z.enum(['FIXED', 'PERCENTAGE'], { required_error: '请选择优惠券类型' }),
  value: z.number().int().positive('面值必须大于 0'),
  minAmount: z.number().int().min(0, '最低消费不能为负').optional(),
  maxDiscount: z.number().int().positive('最大折扣需大于 0').optional(),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  usageLimit: z.number().int().positive('总使用次数需大于 0').optional(),
  perUserLimit: z.number().int().positive('每人限用次数需大于 0').optional()
});

const couponUpdateSchema = couponCreateSchema.partial();

const applyCouponSchema = z.object({
  code: z.string().min(1, '请输入券码')
});

const couponCheckoutSchema = checkoutSchema.extend({
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
  couponCheckoutSchema
};
