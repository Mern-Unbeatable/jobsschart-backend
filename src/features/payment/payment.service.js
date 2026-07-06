import axios from 'axios';
import { prisma } from '../../config/db.js';
import { config } from '../../config/config.js';
import { Logger } from '../../config/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('PaymentService');
const MOLLIE_API_BASE = 'https://api.mollie.com/v2';

// Flat delivery fee — WEBSHOP checkouts only.
const WEBSHOP_DELIVERY_FEE = 15.00;

class PaymentService {
  _assertMollieConfigured() {
    if (!config.MOLLIE_API_KEY) {
      throw new Error('Mollie API key is missing. Set MOLLIE_API_KEY_LIVE or MOLLIE_API_KEY_TEST');
    }
  }

  _mollieMode() {
    if (typeof config.MOLLIE_API_KEY !== 'string') return 'none';
    if (config.MOLLIE_API_KEY.startsWith('test_')) return 'test';
    if (config.MOLLIE_API_KEY.startsWith('live_')) return 'live';
    return 'unknown';
  }

  _mollieHeaders() {
    return {
      Authorization: `Bearer ${config.MOLLIE_API_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  _toMollieAmount(value) {
    const num = Number(value || 0);
    return num.toFixed(2);
  }

  _normalizePaymentAmountFromSession(payment) {
    const total = Number(payment?.amount?.value ?? 0);
    return Number.isFinite(total) ? total : 0;
  }

  _buildWebhookUrl() {
    if (config.MOLLIE_WEBHOOK_URL) return config.MOLLIE_WEBHOOK_URL;
    if (config.BACKEND_URL) return `${config.BACKEND_URL}/api/v1/payments/webhook`;
    return 'http://localhost:5000/api/v1/payments/webhook';
  }

  _extractWebhookPaymentId(rawBody) {
    if (!rawBody) return null;

    if (Buffer.isBuffer(rawBody)) {
      const asText = rawBody.toString('utf8').trim();
      if (!asText) return null;
      try {
        const parsed = JSON.parse(asText);
        return parsed?.id || null;
      } catch {
        const params = new URLSearchParams(asText);
        return params.get('id');
      }
    }

    if (typeof rawBody === 'string') {
      const trimmed = rawBody.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        return parsed?.id || null;
      } catch {
        const params = new URLSearchParams(trimmed);
        return params.get('id');
      }
    }

    if (typeof rawBody === 'object') {
      return rawBody.id || null;
    }

    return null;
  }

  async _createMolliePayment({ amount, description, redirectUrl, webhookUrl, metadata }) {
    this._assertMollieConfigured();

    try {
      const response = await axios.post(
        `${MOLLIE_API_BASE}/payments`,
        {
          amount: {
            currency: 'CHF',
            value: this._toMollieAmount(amount),
          },
          description,
          redirectUrl,
          webhookUrl,
          metadata,
        },
        {
          headers: this._mollieHeaders(),
        },
      );

      return response.data;
    } catch (error) {
      const mollieMessage = error?.response?.data?.detail || error?.response?.data?.title || error.message;
      log.error(`Mollie create payment failed [mode=${this._mollieMode()}]: ${mollieMessage}`);
      throw new BadRequestError(`Mollie payment create failed: ${mollieMessage}`);
    }
  }

  async _getMolliePayment(paymentId) {
    this._assertMollieConfigured();

    try {
      const response = await axios.get(`${MOLLIE_API_BASE}/payments/${paymentId}`, {
        headers: this._mollieHeaders(),
      });

      return response.data;
    } catch (error) {
      const mollieMessage = error?.response?.data?.detail || error?.response?.data?.title || error.message;
      log.error(`Mollie get payment failed [mode=${this._mollieMode()}] paymentId=${paymentId}: ${mollieMessage}`);
      throw new BadRequestError(`Mollie payment lookup failed: ${mollieMessage}`);
    }
  }

  _isMolliePaid(payment) {
    return payment?.status === 'paid';
  }

  async _getPaymentBySessionId(sessionId) {
    return prisma.payment.findFirst({
      where: { stripeSessionId: sessionId },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        donationId: true,
        orderId: true,
        packageId: true,
      },
    });
  }

  async _ensureWallet(userId) {
    let wallet = await prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, creditBalance: 0 },
      });
      log.info(`Wallet created for user ${userId}`);
    }
    return wallet;
  }

  async _recreatePaymentFromSession(payment, userId) {
    const metadata = payment?.metadata || {};
    const type = metadata.type;

    if (!type || !['PACKAGE', 'DONATION', 'WEBSHOP'].includes(type)) {
      throw new BadRequestError('Invalid payment type in Mollie payment metadata');
    }

    const metadataUserId = metadata.userId;
    if (metadataUserId && metadataUserId !== userId) {
      throw new ForbiddenError('You are not authorized to verify this payment');
    }

    const created = await prisma.payment.create({
      data: {
        userId,
        packageId: type === 'PACKAGE' ? (metadata.packageId || null) : null,
        amount: this._normalizePaymentAmountFromSession(payment),
        creditsAdded: null,
        type,
        status: 'PENDING',
        stripeSessionId: payment.id,
        stripePaymentIntentId: payment.id,
        stripeCustomerId: null,
      },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        donationId: true,
        orderId: true,
        packageId: true,
      },
    });

    log.warn(`Recovered missing payment row from Mollie payment: ${payment.id}`);
    return created;
  }

  async createCheckoutSession({
    userId,
    type,
    packageId,
    donationData,
    cartItems,
    shippingAddress,
    phone,
  }) {
    await this._ensureWallet(userId);

    const clientUrl =
      config.FRONTEND_URL || config.CLIENT_URLS?.[0] || 'http://localhost:5173';
    const webhookUrl = this._buildWebhookUrl();

    let metadata = { userId, type };
    let amount = 0;
    let creditsAdded = 0;

    if (type === 'PACKAGE') {
      if (!packageId) throw new Error('packageId is required for PACKAGE type');

      const pkg = await prisma.package.findUnique({
        where: { id: packageId, isActive: true },
      });
      if (!pkg) throw new Error('Package not found or inactive');

      amount = Number(pkg.price);
      creditsAdded = Number(pkg.credits || pkg.minutes || 0);
      metadata.packageId = packageId;

    } else if (type === 'DONATION') {
      if (!donationData) throw new Error('donationData is required for DONATION type');

      let donationAmount = donationData.amount;
      if (typeof donationAmount === 'string') {
        donationAmount = parseFloat(donationAmount);
      }

      const {
        donorType,
        name,
        phone: donorPhone,
        email,
        description,
        location,
        image,
        benefit,
        websiteUrl,
        businessType,
        businessName
      } = donationData;

      if (!donorType || !name || !donorPhone || !email || !donationAmount || !benefit) {
        throw new Error('donorType, name, phone, email, amount, benefit are required');
      }

      amount = Number(donationAmount);
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid donation amount');

      let imageUrl = image;
      if (!imageUrl && donationData.image) {
        imageUrl = donationData.image;
      }

      metadata.donorType = donorType;
      metadata.donorName = name.substring(0, 490);
      metadata.donorPhone = donorPhone.substring(0, 40);
      metadata.donorEmail = email.substring(0, 490);
      metadata.donationAmount = String(donationAmount);
      metadata.benefit = benefit.substring(0, 490);

      // CRITICAL FIX: Add business fields to metadata
      if (businessName && businessName.trim() !== '') {
        metadata.businessName = businessName.substring(0, 490);
      }
      if (websiteUrl && websiteUrl.trim() !== '') {
        metadata.websiteUrl = websiteUrl.substring(0, 490);
      }
      if (businessType) {
        metadata.businessType = businessType;
      }

      if (description) metadata.donationDescription = description.substring(0, 490);
      if (location) metadata.donationLocation = location.substring(0, 490);
      if (imageUrl) metadata.donationImage = imageUrl.substring(0, 490);

    } else if (type === 'WEBSHOP') {
      if (!cartItems || cartItems.length === 0) {
        throw new Error('cartItems is required for WEBSHOP type');
      }

      const productIds = cartItems.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
      });

      if (products.length !== productIds.length) {
        throw new Error('One or more products not found or inactive');
      }

      for (const item of cartItems) {
        const product = products.find((p) => p.id === item.productId);
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
        }
        amount += Number(product.price) * item.quantity;
      }

      if (shippingAddress) {
        const completeAddress = {
          street: shippingAddress.street || '',
          city: shippingAddress.city || '',
          postalCode: shippingAddress.postalCode || '',
          country: shippingAddress.country || '',
          name: shippingAddress.name || '',
          email: shippingAddress.email || '',
          phone: shippingAddress.phone || ''
        };

        metadata.shippingAddress = JSON.stringify(completeAddress);
        metadata.shipping_street = completeAddress.street;
        metadata.shipping_city = completeAddress.city;
        metadata.shipping_postalCode = completeAddress.postalCode;
        metadata.shipping_country = completeAddress.country;
        metadata.shipping_name = completeAddress.name;
        metadata.shipping_email = completeAddress.email;
        metadata.shipping_phone = completeAddress.phone;

      }

      if (phone) metadata.customerPhone = phone;


      metadata.itemsSubtotal = String(amount);
      metadata.deliveryFee = String(WEBSHOP_DELIVERY_FEE);

      amount += WEBSHOP_DELIVERY_FEE;

      metadata.cartItems = JSON.stringify(cartItems);

    } else {
      throw new Error('Invalid type. Use PACKAGE, DONATION, or WEBSHOP');
    }

    const paymentDescription =
      type === 'PACKAGE' ? 'Package purchase' : type === 'DONATION' ? 'Donation payment' : 'Webshop order';

    const molliePayment = await this._createMolliePayment({
      amount,
      description: paymentDescription,
      redirectUrl: `${clientUrl}/payment/success?type=${type}`,
      webhookUrl,
      metadata,
    });

    log.info(`Mollie payment mode=${this._mollieMode()} id=${molliePayment.id}`);

    const checkoutUrl = molliePayment?._links?.checkout?.href;
    if (!checkoutUrl) {
      throw new Error('Failed to create Mollie checkout URL');
    }

    await prisma.payment.create({
      data: {
        userId,
        packageId: packageId || null,
        amount,
        creditsAdded: creditsAdded || null,
        type,
        status: 'PENDING',
        stripeSessionId: molliePayment.id,
        stripePaymentIntentId: molliePayment.id,
        stripeCustomerId: null,
      },
    });

    log.info(`✅ Mollie checkout created: ${molliePayment.id} | type=${type} | user=${userId} | amount=${amount}`);
    return { url: checkoutUrl, sessionId: molliePayment.id };
  }

  async handleWebhook(rawBody) {
    const paymentId = this._extractWebhookPaymentId(rawBody);
    if (!paymentId) {
      throw new BadRequestError('Mollie webhook payload missing payment id');
    }

    const molliePayment = await this._getMolliePayment(paymentId);
    await this._handleCheckoutCompleted(molliePayment);

    return { received: true };
  }

  async _handleCheckoutCompleted(paymentData) {
    const metadata = paymentData?.metadata || {};
    const { userId, type } = metadata;

    if (!this._isMolliePaid(paymentData)) {
      log.info(`Mollie payment not paid yet: ${paymentData?.id} status=${paymentData?.status}`);
      return;
    }

    log.info(`Processing: type=${type} user=${userId} payment=${paymentData.id}`);

    log.info(`📋 Mollie metadata: ${JSON.stringify(metadata)}`);

    let payment = await this._getPaymentBySessionId(paymentData.id);
    if (!payment) {
      payment = await this._recreatePaymentFromSession(paymentData, userId);
    }

    await prisma.payment.updateMany({
      where: { stripeSessionId: paymentData.id, status: 'PENDING' },
      data: {
        status: 'SUCCESS',
        stripePaymentIntentId: paymentData.id,
      },
    });

    await this._runPostPaymentActions(type, paymentData);
  }

  async _runPostPaymentActions(type, paymentData) {
    if (type === 'PACKAGE') {
      await this._savePackagePurchase(paymentData);
      return;
    }
    if (type === 'DONATION') {
      await this._saveDonation(paymentData);
      return;
    }
    if (type === 'WEBSHOP') {
      await this._saveOrder(paymentData);
      return;
    }

    throw new BadRequestError(`Unsupported payment type: ${type}`);
  }

  async _savePackagePurchase(paymentData) {
    const payment = await this._getPaymentBySessionId(paymentData.id);
    if (!payment) throw new NotFoundError(`Payment not found for payment ${paymentData.id}`);

    const existingPurchase = await prisma.packagePurchase.findFirst({
      where: { stripeSessionId: paymentData.id },
      select: { id: true },
    });
    if (existingPurchase) {
      log.info(`Package purchase already linked for payment ${paymentData.id}`);
      return;
    }

    const userId = payment.userId;
    const packageId = paymentData.metadata?.packageId;

    if (!packageId) {
      throw new BadRequestError(`Missing packageId in metadata for payment ${paymentData.id}`);
    }

    const pkg = await prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) {
      log.error(`Package ${packageId} not found`);
      return;
    }

    const credits = Number(pkg.credits || pkg.minutes || 0);

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      const balanceBefore = Number(wallet?.creditBalance || 0);
      const balanceAfter = balanceBefore + credits;

      await tx.wallet.update({
        where: { userId },
        data: { creditBalance: balanceAfter },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          transactionType: 'PURCHASE',
          amount: credits,
          balanceBefore,
          balanceAfter,
          description: `Purchased package: ${pkg.name}`,
        },
      });

      await tx.packagePurchase.create({
        data: {
          userId,
          packageId,
          pricePaid: pkg.price,
          minutes: pkg.minutes || 0,
          credits: pkg.credits || 0,
          status: 'SUCCESS',
          stripeSessionId: paymentData.id,
        },
      });

      await tx.payment.updateMany({
        where: { stripeSessionId: paymentData.id },
        data: { packageId },
      });
    });

    log.info(`Package "${pkg.name}": +${credits} credits → user ${userId}`);
  }

  async _saveDonation(paymentData) {
    const m = paymentData.metadata;
    const payment = await this._getPaymentBySessionId(paymentData.id);
    if (!payment) throw new NotFoundError(`Payment not found for payment ${paymentData.id}`);

    if (payment.donationId) {
      log.info(`Donation already linked for payment ${paymentData.id} -> ${payment.donationId}`);
      return;
    }

    const donorId = payment.userId;
    const donationAmount = parseInt(m.donationAmount, 10);

    if (!m.donorType || !m.donorName || !m.donorPhone || !m.donorEmail || !m.benefit || !Number.isFinite(donationAmount)) {
      throw new BadRequestError('Invalid donation metadata for this Stripe session');
    }

    await prisma.$transaction(async (tx) => {
      const donationData = {
        donorId,
        donorType: m.donorType,
        name: m.donorName,
        phone: m.donorPhone,
        email: m.donorEmail,
        amount: donationAmount,
        description: m.donationDescription || null,
        location: m.donationLocation || null,
        image: m.donationImage || null,
        benefit: m.benefit,
        businessName: m.businessName || null,
        websiteUrl: m.websiteUrl || null,
        businessType: m.businessType || 'LOCAL_BUSINESS',
      };

      const donation = await tx.donation.create({
        data: donationData,
      });

      await tx.payment.updateMany({
        where: { stripeSessionId: paymentData.id },
        data: { donationId: donation.id },
      });

      await tx.adCampaign.create({
        data: {
          donorId,
          title: `Donation Campaign - ${m.benefit}`,
          description: m.donationDescription || null,
          image: m.donationImage || null,
          budget: donationAmount,
          spentAmount: 0,
          status: 'PENDING',
          linkUrl: m.websiteUrl || null,
          donationId: donation.id,
          isActive: true,
          placements: ['HOME'],
        },
      });
    });

    log.info(`Donation saved + AdCampaign created for user ${donorId}`);
  }

  async _saveOrder(paymentData) {
    const m = paymentData.metadata;
    const payment = await this._getPaymentBySessionId(paymentData.id);
    if (!payment) throw new NotFoundError(`Payment not found for payment ${paymentData.id}`);

    if (payment.orderId) {
      log.info(`Order already linked for payment ${paymentData.id} -> ${payment.orderId}`);
      return;
    }

    const userId = payment.userId;
    const cartItems = JSON.parse(m.cartItems);

    let shippingAddress = null;

    // Try to get shipping address from multiple sources
    // Priority 1: shippingAddress JSON string
    if (m.shippingAddress) {
      try {
        shippingAddress = JSON.parse(m.shippingAddress);
        log.info(`📦 Address from JSON: ${JSON.stringify(shippingAddress)}`);
      } catch (error) {
        log.error(`Failed to parse shippingAddress: ${error.message}`);
      }
    }

    // Priority 2: If JSON didn't have name/email/phone, try individual fields
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.email) {
      const individualAddress = {
        street: m.shipping_street || '',
        city: m.shipping_city || '',
        postalCode: m.shipping_postalCode || '',
        country: m.shipping_country || '',
        name: m.shipping_name || '',
        email: m.shipping_email || '',
        phone: m.shipping_phone || m.customerPhone || ''
      };

      if (individualAddress.name || individualAddress.email) {
        shippingAddress = individualAddress;
        log.info(`📦 Address from individual fields: ${JSON.stringify(shippingAddress)}`);
      }
    }

    // Ensure shippingAddress has all fields with proper values
    if (shippingAddress) {
      shippingAddress = {
        street: shippingAddress.street || '',
        city: shippingAddress.city || '',
        postalCode: shippingAddress.postalCode || '',
        country: shippingAddress.country || '',
        name: shippingAddress.name && shippingAddress.name.trim() !== '' ? shippingAddress.name.trim() : null,
        email: shippingAddress.email && shippingAddress.email.trim() !== '' ? shippingAddress.email.trim() : null,
        phone: shippingAddress.phone && shippingAddress.phone.trim() !== '' ? shippingAddress.phone.trim() : null
      };
    }

    log.info(`📦 FINAL shipping address to save: ${JSON.stringify(shippingAddress)}`);

    const productIds = cartItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of cartItems) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      totalAmount += Number(product.price) * item.quantity;
      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
      });
    }

    // ── Delivery fee (WEBSHOP only) ──────────────────────────────────
    // Pull the fee that was actually charged at checkout time (falls back
    // to the current constant if it's ever missing from old sessions).
    const deliveryFee = Number(m.deliveryFee || WEBSHOP_DELIVERY_FEE);
    totalAmount += deliveryFee;
    // ──────────────────────────────────────────────────────────────────

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
          deliveryFee,
          status: 'PROCESSING',
          paymentStatus: 'SUCCESS',
          shippingAddress: shippingAddress,
          phone: m.customerPhone || (shippingAddress?.phone) || null,
          items: { create: orderItemsData },
        },
      });

      log.info(`✅ Order ${order.id} created with shipping address: ${JSON.stringify(order.shippingAddress)}`);

      await tx.payment.updateMany({
        where: { stripeSessionId: paymentData.id },
        data: { orderId: order.id },
      });

      for (const item of cartItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    });

    log.info(`Order created for user ${userId} — ${orderItemsData.length} items, delivery fee ${deliveryFee}`);
  }

  async verifyAndUnlock(sessionId, userId) {
    const paymentData = await this._getMolliePayment(sessionId);
    let payment = await this._getPaymentBySessionId(sessionId);

    if (!payment) {
      payment = await this._recreatePaymentFromSession(paymentData, userId);
    }

    if (payment.userId !== userId) {
      throw new ForbiddenError('You are not authorized to verify this payment');
    }

    if (!this._isMolliePaid(paymentData)) {
      return { paid: false, message: 'Payment not completed' };
    }

    const existing = payment.status === 'SUCCESS';

    const updateResult = await prisma.payment.updateMany({
      where: { stripeSessionId: sessionId, userId, status: 'PENDING' },
      data: { status: 'SUCCESS', stripePaymentIntentId: paymentData.id },
    });

    if (updateResult.count === 0 && !existing) {
      log.warn(`Verify skipped payment status update for session ${sessionId}`);
    }

    await this._runPostPaymentActions(payment.type, paymentData);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    return {
      paid: true,
      alreadyProcessed: existing,
      type: payment.type,
      creditsRemaining: Number(wallet?.creditBalance || 0),
    };
  }

  async getPaymentHistory(userId, queryParams = {}) {
    const page = parseInt(queryParams.page) || 1;
    const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where = { userId, status: 'SUCCESS' };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          package: { select: { id: true, name: true, credits: true, minutes: true } },
          donation: { select: { id: true, benefit: true, amount: true } },
          order: { include: { items: { include: { product: true } } } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, payments };
  }

  async getAllPayments(queryParams = {}) {
    const page = parseInt(queryParams.page) || 1;
    const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where = {};
    if (queryParams.status) where.status = queryParams.status;
    if (queryParams.type) where.type = queryParams.type;
    if (queryParams.userId) where.userId = queryParams.userId;
    if (queryParams.search) {
      where.OR = [
        { user: { name: { contains: queryParams.search, mode: 'insensitive' } } },
        { user: { email: { contains: queryParams.search, mode: 'insensitive' } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          package: { select: { id: true, name: true, credits: true, minutes: true, price: true } },
          donation: { select: { id: true, benefit: true, amount: true } },
          order: { select: { id: true, totalAmount: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, payments };
  }
}

export const paymentService = new PaymentService();