import { z } from 'zod';

const passwordRule = z
  .string()
  .min(8, '密码至少 8 位')
  .regex(/[A-Z]/, '需包含大写字母')
  .regex(/[a-z]/, '需包含小写字母')
  .regex(/[0-9]/, '需包含数字');

export const loginSchema = z.object({
  account: z.string().min(2, '请输入账号'),
  password: z.string().min(6, '请输入密码'),
  remember: z.boolean().optional()
});

export const registerSchema = z.object({
  username: z.string().min(2, '用户名至少 2 位'),
  email: z.string().email('邮箱格式不正确'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  password: passwordRule
});

export const forgotSchema = z.object({
  account: z.string().min(2, '请输入账号'),
  method: z.enum(['email', 'sms'], { required_error: '请选择验证码接收方式' })
});

export const resetSchema = z.object({
  token: z.string().min(6, '验证码无效'),
  newPassword: passwordRule
});

export const addressSchema = z.object({
  recipient: z.string().min(1, '请输入收件人'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  line1: z.string().min(3, '请输入详细地址'),
  city: z.string().min(1, '请输入城市'),
  state: z.string().min(1, '请输入省份'),
  postalCode: z.string().min(4, '请输入邮编'),
  isDefault: z.boolean().optional()
});

export const checkoutSchema = z.object({
  addressId: z.string().min(1, '请选择配送地址'),
  paymentMethod: z.string().min(1, '请选择支付方式'),
  userCouponId: z.string().optional()
});

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export const adminBookSchema = z.object({
  title: z.string().min(1, '请输入书名'),
  author: z.string().min(1, '请输入作者'),
  isbn: z.string().regex(/^[0-9X]{10,13}$/, 'ISBN 格式不正确'),
  description: z.string().min(10, '描述至少 10 字'),
  price: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入价格' }).positive('价格需大于 0')
  ),
  stock: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入库存' }).int('库存需为整数').min(0, '库存不能为负数')
  ),
  coverUrl: z
    .string()
    .min(1, '请上传封面')
    .refine(
      (value) =>
        value.startsWith('/uploads/') ||
        value.startsWith('/covers/') ||
        /^https?:\/\//.test(value),
      '封面地址不合法'
    ),
  categoryId: z.string().min(1, '请选择分类')
});

export const adminCategorySchema = z.object({
  name: z.string().min(1, '请输入分类名称')
});

export const reviewSchema = z.object({
  rating: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入评分' }).int().min(1, '最低 1 分').max(5, '最高 5 分')
  ),
  reviewText: z.string().min(3, '至少 3 个字').max(200, '最多 200 字')
});

export const couponRedeemSchema = z.object({
  code: z.string().min(2, '兑换码至少 2 位').max(32, '兑换码最长 32 位')
});

export const adminCouponSchema = z.object({
  code: z.string().min(2, '券码至少 2 位').max(32, '券码最长 32 位'),
  name: z.string().min(1, '请输入优惠券名称').max(64, '名称最长 64 位'),
  type: z.enum(['FIXED', 'PERCENT'], { required_error: '请选择优惠券类型' }),
  value: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入减免金额' }).positive('减免金额需大于 0').optional()
  ),
  percent: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入折扣比例' }).int('折扣需为整数').min(1, '最低 1 折').max(99, '最高 99 折').optional()
  ),
  minAmount: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入使用门槛' }).min(0, '门槛不能为负')
  ),
  maxDiscount: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入最高优惠' }).positive('最高优惠需大于 0').optional()
  ),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  usageLimit: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入总使用次数' }).int('次数需为整数').min(1, '至少 1 次').optional()
  ),
  perUserLimit: z.preprocess(
    toNumber,
    z.number({ invalid_type_error: '请输入每人限领次数' }).int('次数需为整数').min(1, '至少 1 次').optional()
  )
}).refine((data) => {
  if (data.type === 'FIXED') return data.value !== undefined && !Number.isNaN(data.value);
  if (data.type === 'PERCENT') return data.percent !== undefined && !Number.isNaN(data.percent);
  return false;
}, { message: '请填写对应类型的优惠值', path: ['value'] });

export const COVER_MAX_SIZE = 2 * 1024 * 1024;
export const COVER_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml'
];
