import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { availabilityService } from './availability.service.js';
import {
    bulkCreateSlotsSchema,
    updateAvailabilitySlotSchema,
    getAvailabilityQuerySchema,
} from './availability.validation.js';

const log = new Logger('AvailabilityController');

class AvailabilityController {
    // ==================== CONSULTANT ROUTES ====================

    // Bulk create slots (weekly and date-specific)
    bulkCreateSlots = catchAsync(async (req, res) => {
        const consultantUserId = req.user.id;
        const slotsData = bulkCreateSlotsSchema.parse(req.body);

        const result = await availabilityService.bulkCreateSlots(consultantUserId, slotsData);

        ResponseHandler.created(res, {
            message: `${result.success} slots created successfully`,
            data: result,
        });
    });

    // Get my availability slots
    getMyAvailabilitySlots = catchAsync(async (req, res) => {
        const consultantUserId = req.user.id;
        const query = getAvailabilityQuerySchema.parse(req.query);
        
        const slots = await availabilityService.getAvailabilitySlots(consultantUserId, query);

        ResponseHandler.success(res, {
            message: 'Availability slots fetched successfully',
            data: slots,
        });
    });

    // Update availability slot
    updateAvailabilitySlot = catchAsync(async (req, res) => {
        const { id } = req.params;
        const consultantUserId = req.user.id;
        const data = updateAvailabilitySlotSchema.parse(req.body);

        const slot = await availabilityService.updateAvailabilitySlot(id, consultantUserId, data);

        ResponseHandler.updated(res, {
            message: 'Availability slot updated successfully',
            data: { slot },
        });
    });

    // Delete availability slot
    deleteAvailabilitySlot = catchAsync(async (req, res) => {
        const { id } = req.params;
        const consultantUserId = req.user.id;

        await availabilityService.deleteAvailabilitySlot(id, consultantUserId);

        ResponseHandler.success(res, {
            message: 'Availability slot deleted successfully',
        });
    });




    // ==================== PUBLIC ROUTES ====================

    // Get consultant availability slots (public)
    getConsultantAvailabilitySlots = catchAsync(async (req, res) => {
        const { consultantId } = req.params;
        const query = getAvailabilityQuerySchema.parse(req.query);
        
        const slots = await availabilityService.getAvailabilitySlots(consultantId, query);

        ResponseHandler.success(res, {
            message: 'Consultant availability fetched successfully',
            data: slots,
        });
    });

}

export const availabilityController = new AvailabilityController();