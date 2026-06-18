// src/features/schedule/schedule.controller.js
import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { scheduleService } from './schedule.service.js';
import {
    createBookingSchema,
    updateBookingStatusSchema,
} from './schedule.validation.js';

class ScheduleController {
    constructor() {
        this.log = new Logger('ScheduleController');
    }

    createBooking = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const data = createBookingSchema.parse(req.body);

        const booking = await scheduleService.createBooking(userId, data);

        ResponseHandler.created(res, {
            message: 'Booking created successfully',
            data: { booking },
        });
    });

    getMyBookings = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const result = await scheduleService.getMyBookings(userId, req.query);

        ResponseHandler.success(res, {
            message: 'Your bookings fetched successfully',
            data: result,
        });
    });

    getConsultantBookings = catchAsync(async (req, res) => {
        const consultantId = req.user.id;
        const result = await scheduleService.getConsultantBookings(consultantId, req.query);

        ResponseHandler.success(res, {
            message: 'Consultant bookings fetched successfully',
            data: result,
        });
    });

    updateBookingStatus = catchAsync(async (req, res) => {
        const { id } = req.params;
        const { status } = updateBookingStatusSchema.parse(req.body);
        const userId = req.user.id;
        const role = req.user.role;

        const booking = await scheduleService.updateBookingStatus(id, userId, role, status);

        ResponseHandler.updated(res, {
            message: `Booking ${status.toLowerCase()} successfully`,
            data: { booking },
        });
    });

    cancelBooking = catchAsync(async (req, res) => {
        const { id } = req.params;
        const userId = req.user.id;
        const role = req.user.role;

        const booking = await scheduleService.cancelBooking(id, userId, role);

        ResponseHandler.updated(res, {
            message: 'Booking cancelled successfully',
            data: { booking },
        });
    });
}

export const scheduleController = new ScheduleController();