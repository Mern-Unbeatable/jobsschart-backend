import Stripe from 'stripe';
import { prisma } from '../../config/db.js';
import { config } from '../../config/config.js';
import { Logger } from '../../config/logger.js';

const stripe = new Stripe(config.STRIPE_SECRET_KEY);
const log = new Logger('PaymentService');

class PaymentService {
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

  async _getOrCreateStripeCustomer(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new Error('User not found');

    const existingPayment = await prisma.payment.findFirst({
      where: { userId, stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPayment?.stripeCustomerId) return existingPayment.stripeCustomerId;

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId },
    });
    log.info(`Stripe customer created: ${customer.id} for user ${userId}`);
    return customer.id;
  }

  // async createCheckoutSession({
  //   userId,
  //   type,
  //   packageId,
  //   donationData,
  //   cartItems,
  //   shippingAddress,
  //   phone,
  // }) {
  //   await this._ensureWallet(userId);

  //   const stripeCustomerId = await this._getOrCreateStripeCustomer(userId);
  //   const clientUrl =
  //     config.FRONTEND_URL || config.CLIENT_URLS?.split(',')[0]?.trim() || 'http://localhost:5173';

  //   let lineItems = [];
  //   let metadata = { userId, type };
  //   let amount = 0;
  //   let creditsAdded = 0;

  //   if (type === 'PACKAGE') {
  //     if (!packageId) throw new Error('packageId is required for PACKAGE type');

  //     const pkg = await prisma.package.findUnique({
  //       where: { id: packageId, isActive: true },
  //     });
  //     if (!pkg) throw new Error('Package not found or inactive');

  //     amount = Number(pkg.price);
  //     creditsAdded = Number(pkg.credits || pkg.minutes || 0);
  //     metadata.packageId = packageId;

  //     lineItems = [{
  //       price_data: {
  //         currency: 'chf',
  //         product_data: {
  //           name: pkg.name,
  //           description: pkg.description || `${creditsAdded} credits package`,
  //         },
  //         unit_amount: Math.round(amount * 100),
  //       },
  //       quantity: 1,
  //     }];

  //   } else if (type === 'DONATION') {
  //     if (!donationData) throw new Error('donationData is required for DONATION type');

  //     let donationAmount = donationData.amount;
  //     if (typeof donationAmount === 'string') {
  //       donationAmount = parseFloat(donationAmount);
  //     }

  //     const { donorType, name, phone: donorPhone, email, description, location, image, benefit, websiteUrl,businessType ,businessName} = donationData;

  //     if (!donorType || !name || !donorPhone || !email || !donationAmount || !benefit) {
  //       throw new Error('donorType, name, phone, email, amount, benefit are required');
  //     }

  //     amount = Number(donationAmount);
  //     if (isNaN(amount) || amount <= 0) throw new Error('Invalid donation amount');

  //     let imageUrl = image;
  //     if (!imageUrl && donationData.image) {
  //       imageUrl = donationData.image;
  //     }

  //     metadata.donorType = donorType;
  //      metadata.businessName = businessName;
  //      metadata.businessType = businessType;
  //      metadata.websiteUrl = websiteUrl;
  //     metadata.donorName = name.substring(0, 490);
  //     metadata.donorPhone = donorPhone.substring(0, 40);
  //     metadata.donorEmail = email.substring(0, 490);
  //     metadata.donationAmount = String(donationAmount);
  //     metadata.benefit = benefit.substring(0, 490);
  //     if (description) metadata.donationDescription = description.substring(0, 490);
  //     if (location) metadata.donationLocation = location.substring(0, 490);
  //     if (imageUrl) metadata.donationImage = imageUrl.substring(0, 490);

  //     lineItems = [{
  //       price_data: {
  //         currency: 'chf',
  //         product_data: {
  //           name: `Donation: ${benefit}`,
  //           description: description || `Donation for ${benefit}`,
  //         },
  //         unit_amount: Math.round(amount * 100),
  //       },
  //       quantity: 1,
  //     }];

  //   } else if (type === 'WEBSHOP') {
  //     if (!cartItems || cartItems.length === 0) {
  //       throw new Error('cartItems is required for WEBSHOP type');
  //     }

  //     const productIds = cartItems.map((i) => i.productId);
  //     const products = await prisma.product.findMany({
  //       where: { id: { in: productIds }, isActive: true },
  //     });

  //     if (products.length !== productIds.length) {
  //       throw new Error('One or more products not found or inactive');
  //     }

  //     lineItems = [];
  //     for (const item of cartItems) {
  //       const product = products.find((p) => p.id === item.productId);
  //       if (product.stock < item.quantity) {
  //         throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
  //       }
  //       amount += Number(product.price) * item.quantity;
  //       lineItems.push({
  //         price_data: {
  //           currency: 'chf',
  //           product_data: {
  //             name: product.name,
  //             description: product.description?.substring(0, 500),
  //           },
  //           unit_amount: Math.round(Number(product.price) * 100),
  //         },
  //         quantity: item.quantity,
  //       });
  //     }

  //     // CRITICAL FIX: Store shipping address as separate metadata fields
  //     if (shippingAddress) {
  //       // Store complete address as JSON
  //       const completeAddress = {
  //         street: shippingAddress.street || '',
  //         city: shippingAddress.city || '',
  //         postalCode: shippingAddress.postalCode || '',
  //         country: shippingAddress.country || '',
  //         name: shippingAddress.name || '',
  //         email: shippingAddress.email || '',
  //         phone: shippingAddress.phone || ''
  //       };

  //       metadata.shippingAddress = JSON.stringify(completeAddress);

  //       // ALSO store each field separately to ensure they survive Stripe
  //       metadata.shipping_street = completeAddress.street;
  //       metadata.shipping_city = completeAddress.city;
  //       metadata.shipping_postalCode = completeAddress.postalCode;
  //       metadata.shipping_country = completeAddress.country;
  //       metadata.shipping_name = completeAddress.name;
  //       metadata.shipping_email = completeAddress.email;
  //       metadata.shipping_phone = completeAddress.phone;

  //       log.info(`📦 WEBSHOP - Original shippingAddress: ${JSON.stringify(shippingAddress)}`);
  //       log.info(`📦 WEBSHOP - Complete address stored: ${JSON.stringify(completeAddress)}`);
  //     }

  //     if (phone) metadata.customerPhone = phone;
  //     metadata.cartItems = JSON.stringify(cartItems);

  //   } else {
  //     throw new Error('Invalid type. Use PACKAGE, DONATION, or WEBSHOP');
  //   }

  //   const session = await stripe.checkout.sessions.create({
  //     customer: stripeCustomerId,
  //     payment_method_types: ['card'],
  //     line_items: lineItems,
  //     mode: 'payment',
  //     success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=${type}`,
  //     cancel_url: `${clientUrl}/payment/cancel?type=${type}`,
  //     metadata,
  //   });

  //   await prisma.payment.create({
  //     data: {
  //       userId,
  //       packageId: packageId || null,
  //       amount,
  //       creditsAdded: creditsAdded || null,
  //       type,
  //       status: 'PENDING',
  //       stripeSessionId: session.id,
  //       stripePaymentIntentId: '',
  //       stripeCustomerId,
  //     },
  //   });

  //   log.info(`✅ Checkout created: ${session.id} | type=${type} | user=${userId} | amount=${amount}`);
  //   return { url: session.url, sessionId: session.id };
  // }
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

    const stripeCustomerId = await this._getOrCreateStripeCustomer(userId);
    const clientUrl =
        config.FRONTEND_URL || config.CLIENT_URLS?.split(',')[0]?.trim() || 'http://localhost:5173';

    let lineItems = [];
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

        lineItems = [{
            price_data: {
                currency: 'chf',
                product_data: {
                    name: pkg.name,
                    description: pkg.description || `${creditsAdded} credits package`,
                },
                unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
        }];

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

        lineItems = [{
            price_data: {
                currency: 'chf',
                product_data: {
                    name: `Donation: ${benefit}`,
                    description: description || `Donation for ${benefit}`,
                },
                unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
        }];

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

        lineItems = [];
        for (const item of cartItems) {
            const product = products.find((p) => p.id === item.productId);
            if (product.stock < item.quantity) {
                throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
            }
            amount += Number(product.price) * item.quantity;
            lineItems.push({
                price_data: {
                    currency: 'chf',
                    product_data: {
                        name: product.name,
                        description: product.description?.substring(0, 500),
                    },
                    unit_amount: Math.round(Number(product.price) * 100),
                },
                quantity: item.quantity,
            });
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

            log.info(`📦 WEBSHOP - Original shippingAddress: ${JSON.stringify(shippingAddress)}`);
            log.info(`📦 WEBSHOP - Complete address stored: ${JSON.stringify(completeAddress)}`);
        }

        if (phone) metadata.customerPhone = phone;
        metadata.cartItems = JSON.stringify(cartItems);

    } else {
        throw new Error('Invalid type. Use PACKAGE, DONATION, or WEBSHOP');
    }

    const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=${type}`,
        cancel_url: `${clientUrl}/payment/cancel?type=${type}`,
        metadata,
    });

    await prisma.payment.create({
        data: {
            userId,
            packageId: packageId || null,
            amount,
            creditsAdded: creditsAdded || null,
            type,
            status: 'PENDING',
            stripeSessionId: session.id,
            stripePaymentIntentId: '',
            stripeCustomerId,
        },
    });

    log.info(`✅ Checkout created: ${session.id} | type=${type} | user=${userId} | amount=${amount}`);
    return { url: session.url, sessionId: session.id };
}

  async handleWebhook(rawBody, signature) {
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      log.error(`Webhook signature failed: ${err.message}`);
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    log.info(`Webhook: ${event.type}`);
    if (event.type === 'checkout.session.completed') {
      await this._handleCheckoutCompleted(event.data.object);
    }
    return { received: true };
  }

  async _handleCheckoutCompleted(session) {
    const { userId, type } = session.metadata;
    log.info(`Processing: type=${type} user=${userId} session=${session.id}`);

    // Log all metadata for debugging
    log.info(`📋 Session metadata: ${JSON.stringify(session.metadata)}`);

    const existingPayment = await prisma.payment.findFirst({
      where: { stripeSessionId: session.id, status: 'SUCCESS' },
    });

    if (existingPayment) {
      log.info(`Already processed: ${session.id}`);
      return;
    }

    await prisma.payment.updateMany({
      where: { stripeSessionId: session.id, status: 'PENDING' },
      data: {
        status: 'SUCCESS',
        stripePaymentIntentId: session.payment_intent || '',
      },
    });

    if (type === 'PACKAGE') await this._savePackagePurchase(session);
    if (type === 'DONATION') await this._saveDonation(session);
    if (type === 'WEBSHOP') await this._saveOrder(session);
  }

  async _savePackagePurchase(session) {
    const { userId, packageId } = session.metadata;

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
          stripeSessionId: session.id,
        },
      });

      await tx.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: { packageId },
      });
    });

    log.info(`Package "${pkg.name}": +${credits} credits → user ${userId}`);
  }

  // async _saveDonation(session) {
  //   const m = session.metadata;

  //   await prisma.$transaction(async (tx) => {
  //     const donation = await tx.donation.create({
  //       data: {
  //         donorId: m.userId,
  //         donorType: m.donorType,
  //         name: m.donorName,
  //         phone: m.donorPhone,
  //         email: m.donorEmail,
  //         businessName:m.businessName,
  //         businessType:m.businessType,
  //         websiteUrl:m.websiteUrl,
  //         amount: parseInt(m.donationAmount),
  //         description: m.donationDescription || null,
  //         location: m.donationLocation || null,
  //         image: m.donationImage || null,
  //         benefit: m.benefit,
  //       },
  //     });

  //     await tx.payment.updateMany({
  //       where: { stripeSessionId: session.id },
  //       data: { donationId: donation.id },
  //     });

  //     await tx.adCampaign.create({
  //       data: {
  //         donorId: m.userId,
  //         title: `Donation Campaign - ${m.benefit}`,
  //         description: m.donationDescription || null,
  //         image: m.donationImage || null,
  //         budget: parseInt(m.donationAmount),
  //         spentAmount: 0,
  //         status: 'PENDING',
  //         linkUrl: m.websiteUrl,
  //         donationId: donation.id,
  //         isActive: true,
  //         placements: ['HOME'],
  //       },
  //     });
  //   });

  //   log.info(`Donation saved + AdCampaign created for user ${m.userId}`);
  // }

async _saveDonation(session) {
    const m = session.metadata;

    await prisma.$transaction(async (tx) => {
        const donationData = {
            donorId: m.userId,
            donorType: m.donorType,
            name: m.donorName,
            phone: m.donorPhone,
            email: m.donorEmail,
            amount: parseInt(m.donationAmount),
            description: m.donationDescription || null,
            location: m.donationLocation || null,
            image: m.donationImage || null,
            benefit: m.benefit,
            businessName: m.businessName || null,  // This will now have the value
            websiteUrl: m.websiteUrl || null,      // This will now have the value
            businessType: m.businessType || 'LOCAL_BUSINESS',  // This will now have the value
        };

        const donation = await tx.donation.create({
            data: donationData,
        });

        await tx.payment.updateMany({
            where: { stripeSessionId: session.id },
            data: { donationId: donation.id },
        });

        await tx.adCampaign.create({
            data: {
                donorId: m.userId,
                title: `Donation Campaign - ${m.benefit}`,
                description: m.donationDescription || null,
                image: m.donationImage || null,
                budget: parseInt(m.donationAmount),
                spentAmount: 0,
                status: 'PENDING',
                linkUrl: m.websiteUrl || null,
                donationId: donation.id,
                isActive: true,
                placements: ['HOME'],
            },
        });
    });

    log.info(`Donation saved + AdCampaign created for user ${m.userId}`);
}
  async _saveOrder(session) {
    const m = session.metadata;
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

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: m.userId,
          totalAmount,
          status: 'PROCESSING',
          paymentStatus: 'SUCCESS',
          shippingAddress: shippingAddress,
          phone: m.customerPhone || (shippingAddress?.phone) || null,
          items: { create: orderItemsData },
        },
      });

      log.info(`✅ Order ${order.id} created with shipping address: ${JSON.stringify(order.shippingAddress)}`);

      await tx.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: { orderId: order.id },
      });

      for (const item of cartItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    });

    log.info(`Order created for user ${m.userId} — ${orderItemsData.length} items`);
  }

  async verifyAndUnlock(sessionId, userId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return { paid: false, message: 'Payment not completed' };
    }

    const existing = await prisma.payment.findFirst({
      where: { stripeSessionId: sessionId, status: 'SUCCESS' },
    });

    if (!existing) {
      const { type } = session.metadata;

      await prisma.payment.updateMany({
        where: { stripeSessionId: sessionId, userId, status: 'PENDING' },
        data: { status: 'SUCCESS', stripePaymentIntentId: session.payment_intent || '' },
      });

      if (type === 'PACKAGE') await this._savePackagePurchase(session);
      if (type === 'DONATION') await this._saveDonation(session);
      if (type === 'WEBSHOP') await this._saveOrder(session);
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    return {
      paid: true,
      alreadyProcessed: !!existing,
      type: session.metadata.type,
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