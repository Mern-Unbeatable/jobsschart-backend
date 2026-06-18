import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { Logger } from '../../config/logger.js';
import { adminDashboardService } from './admin.service.js';

const log = new Logger('AdminDashboardController');

const ALLOWED_PERIODS = ['this_year', 'last_year', '6_months'];

class AdminDashboardController {
    getStats = catchAsync(async (req, res) => {
        log.info('Fetching dashboard stats', { adminId: req.user.id });

        const stats = await adminDashboardService.getStats();

        ResponseHandler.success(res, {
            message: 'Dashboard stats fetched successfully',
            data: stats,
        });
    });

    getRevenueChart = catchAsync(async (req, res) => {
        const { period } = req.query;
        const selectedPeriod = ALLOWED_PERIODS.includes(period) ? period : 'this_year';

        log.info('Fetching revenue chart', { adminId: req.user.id, period: selectedPeriod });

        const chart = await adminDashboardService.getRevenueChart(selectedPeriod);

        ResponseHandler.success(res, {
            message: 'Revenue chart fetched successfully',
            data: chart,
        });
    });
}

export const adminDashboardController = new AdminDashboardController();