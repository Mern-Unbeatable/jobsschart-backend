import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { paymentService } from './payment.service.js';
import { createCheckoutSchema, verifyPaymentSchema } from './payment.validation.js';

class PaymentController {
  createCheckout = catchAsync(async (req, res) => {
    const userId = req.user.id;
    let requestData = { ...req.body };
    console.log('req body check', req.body)

    // Handle form-data with flattened donationData fields
    if (requestData.type === 'DONATION') {
      const hasFlattenedFields = Object.keys(requestData).some(key => key.startsWith('donationData['));

      if (hasFlattenedFields) {
        const donationData = {};

        // Extract all donationData fields including business fields
        for (const [key, value] of Object.entries(requestData)) {
          if (key.startsWith('donationData[') && key.endsWith(']')) {
            const fieldName = key.replace('donationData[', '').replace(']', '');
            donationData[fieldName] = value;
          }
        }

        // Convert amount to number
        if (donationData.amount) {
          donationData.amount = parseFloat(donationData.amount);
        }

        // Add email field if missing
        if (!donationData.email && requestData.email) {
          donationData.email = requestData.email;
        }

        // CRITICAL FIX: Ensure business fields are properly captured
        // These fields come as separate fields in form-data
        if (requestData.businessName) {
          donationData.businessName = requestData.businessName;
        }
        if (requestData.websiteUrl) {
          donationData.websiteUrl = requestData.websiteUrl;
        }
        if (requestData.businessType) {
          donationData.businessType = requestData.businessType;
        }

        // Also check for business fields with donationData prefix that might have been missed
        if (!donationData.businessName && requestData['donationData[businessName]']) {
          donationData.businessName = requestData['donationData[businessName]'];
        }
        if (!donationData.websiteUrl && requestData['donationData[websiteUrl]']) {
          donationData.websiteUrl = requestData['donationData[websiteUrl]'];
        }
        if (!donationData.businessType && requestData['donationData[businessType]']) {
          donationData.businessType = requestData['donationData[businessType]'];
        }

        requestData.donationData = donationData;

        // Clean up flattened fields from requestData
        Object.keys(requestData).forEach(key => {
          if (key.startsWith('donationData[')) {
            delete requestData[key];
          }
        });
      }
      // Handle case where donationData is a JSON string
      else if (typeof requestData.donationData === 'string') {
        try {
          requestData.donationData = JSON.parse(requestData.donationData);
          if (requestData.donationData.amount) {
            requestData.donationData.amount = parseFloat(requestData.donationData.amount);
          }
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid donationData JSON format',
            error: error.message
          });
        }
      }
      // Handle case where donationData is already an object
      else if (requestData.donationData && typeof requestData.donationData === 'object') {
        if (requestData.donationData.amount && typeof requestData.donationData.amount === 'string') {
          requestData.donationData.amount = parseFloat(requestData.donationData.amount);
        }
      }

      // Validate required fields
      if (!requestData.donationData) {
        return res.status(400).json({
          success: false,
          message: 'donationData is required for DONATION type'
        });
      }

      // Ensure email is present
      if (!requestData.donationData.email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required for donation',
          errors: [{ field: 'email', message: 'Email is required' }]
        });
      }
    }

    // Handle uploaded image
    if (req.file && requestData.type === 'DONATION') {
      const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
      const imageUrl = `${baseUrl}/uploads/donations/${req.file.filename}`;

      if (!requestData.donationData) {
        requestData.donationData = {};
      }
      requestData.donationData.image = imageUrl;
    }

    // Validate with Zod
    const validationResult = createCheckoutSchema.safeParse(requestData);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }

    const result = await paymentService.createCheckoutSession({
      userId,
      ...validationResult.data
    });

    ResponseHandler.created(res, {
      message: 'Checkout session created. Redirect user to the URL.',
      data: result,
    });
  });

  handleWebhook = catchAsync(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const result = await paymentService.handleWebhook(req.body, signature);
    res.json(result);
  });

  verifyPayment = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { session_id } = verifyPaymentSchema.parse(req.query);
    const result = await paymentService.verifyAndUnlock(session_id, userId);

    ResponseHandler.success(res, {
      message: result.paid ? 'Payment verified successfully' : 'Payment not completed',
      data: result,
    });
  });

  getPaymentHistory = catchAsync(async (req, res) => {
    const result = await paymentService.getPaymentHistory(req.user.id, req.query);
    ResponseHandler.success(res, { message: 'Payment history fetched', data: result });
  });

  getAllPayments = catchAsync(async (req, res) => {
    const result = await paymentService.getAllPayments(req.query);
    ResponseHandler.success(res, { message: 'All payments fetched', data: result });
  });
}

export const paymentController = new PaymentController();