import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { activityService } from './activity.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('ActivityController');

class ActivityController {
  createActivity = catchAsync(async (req, res) => {
    log.info(`Creating activity by admin: ${req.user.id}`);
    const activity = await activityService.createActivity(req.body);
    ResponseHandler.created(res, {
      message: 'Activity created successfully',
      data: { activity },
    });
  });

  getAllActivities = catchAsync(async (req, res) => {
    const result = await activityService.getAllActivities(req.query);
    ResponseHandler.success(res, {
      message: 'Activities fetched successfully',
      data: result,
    });
  });

  getActivityStats = catchAsync(async (req, res) => {
    const stats = await activityService.getActivityStats();
    ResponseHandler.success(res, {
      message: 'Activity stats fetched successfully',
      data: { stats },
    });
  });

  getActivityById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const activity = await activityService.getActivityById(id);
    ResponseHandler.success(res, {
      message: 'Activity fetched successfully',
      data: { activity },
    });
  });

  updateActivity = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Updating activity: ${id} by admin: ${req.user.id}`);
    const activity = await activityService.updateActivity(id, req.body);
    ResponseHandler.success(res, {
      message: 'Activity updated successfully',
      data: { activity },
    });
  });

  deleteActivity = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Deleting activity: ${id} by admin: ${req.user.id}`);
    const result = await activityService.deleteActivity(id);
    ResponseHandler.success(res, {
      message: result.message,
      data: { deletedAt: new Date().toISOString() },
    });
  });

  registerForActivity = catchAsync(async (req, res) => {
    const { id } = req.params;
    const registration = await activityService.registerForActivity(id, req.body);
    ResponseHandler.created(res, {
      message: 'Registration successful',
      data: { registration },
    });
  });
}

export const activityController = new ActivityController();
