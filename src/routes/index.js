
import { adCampaignRoutes } from '../features/adcampaign/adcampaign.route.js';
import { authRoutes } from '../features/auth/auth.routes.js';
import { availabilityRoutes } from '../features/availability/availability.route.js';
import { blogRoutes } from '../features/blog/blog.route.js';
import { callRoutes } from '../features/call/call.route.js';
import { chatRoute } from '../features/chat/chat.route.js';
import { communityQuestionRoutes } from '../features/communityQuestion/communityQuestion.route.js';
import { consultantRoutes } from '../features/consultant/consultant.route.js';
import { donationRoutes } from '../features/donation/donation.route.js';
import { faqRoutes } from '../features/faq/faq.route.js';
import { orderRoutes } from '../features/order/order.route.js';
import { packageRoutes } from '../features/package/package.routes.js';
import { paymentRoutes } from '../features/payment/payment.routes.js';
import { payoutRoutes } from '../features/payout/payout.route.js';
import { postRoutes } from '../features/post/post.route.js';
import { productRoutes } from '../features/product/product.route.js';
import { productCategoryRoutes } from '../features/productCategory/productCategory.route.js';
import { reviewRoutes } from '../features/review/review.route.js';
import { scheduleRoutes } from '../features/schedule/schedule.route.js';
import { sessionRoutes } from '../features/session/session.route.js';
import { userRoutes } from '../features/user/user.routes.js';
import { healthRoutes } from './health.route.js';

const BASE_PATH = '/api/v1';

export default (app) => {

  app.use(healthRoutes);
  app.use(`${BASE_PATH}/auth`, authRoutes);
  app.use(`${BASE_PATH}/users`, userRoutes);
  app.use(`${BASE_PATH}/payments`, paymentRoutes);
  app.use(`${BASE_PATH}/consultants`, consultantRoutes);
  app.use(`${BASE_PATH}/schedule`, scheduleRoutes);
  app.use(`${BASE_PATH}/reviews`, reviewRoutes);
  app.use(`${BASE_PATH}/donations`, donationRoutes);
  app.use(`${BASE_PATH}/packages`, packageRoutes);

  app.use(`${BASE_PATH}/products`, productRoutes);
  app.use(`${BASE_PATH}/orders`, orderRoutes);
  app.use(`${BASE_PATH}/product-categories`, productCategoryRoutes);
  app.use(`${BASE_PATH}/ad-campaigns`, adCampaignRoutes);
  app.use(`${BASE_PATH}/blogs`, blogRoutes);
  app.use(`${BASE_PATH}/calls`, callRoutes);
  app.use(`${BASE_PATH}/chat`, chatRoute);
  app.use(`${BASE_PATH}/post`, postRoutes);
  app.use(`${BASE_PATH}/faqs`, faqRoutes);
  app.use(`${BASE_PATH}/community-questions`, communityQuestionRoutes);
  app.use(`${BASE_PATH}/availability`, availabilityRoutes);
  app.use(`${BASE_PATH}/sessions`, sessionRoutes);
    app.use(`${BASE_PATH}/payouts`, payoutRoutes);
};