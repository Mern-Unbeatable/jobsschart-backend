// src/features/package/package.controller.js
import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { packageService } from './package.service.js';
import { createPackageSchema, updatePackageSchema } from './package.validation.js';

class PackageController {
  constructor() {
    this.log = new Logger('PackageController');
  }

  getAllPackages = catchAsync(async (req, res) => {
    const result = await packageService.getAllPackages(req.query);
    ResponseHandler.success(res, {
      message: 'All packages fetched successfully',
      data: result,
    });
  });

  getPackageById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const pkg = await packageService.getPackageById(id);
    ResponseHandler.success(res, {
      message: 'Package fetched successfully',
      data: { package: pkg },
    });
  });

  getPackageBySlug = catchAsync(async (req, res) => {
    const { slug } = req.params;
    const pkg = await packageService.getPackageBySlug(slug);
    ResponseHandler.success(res, {
      message: 'Package fetched successfully',
      data: { package: pkg },
    });
  });

  getActivePackages = catchAsync(async (req, res) => {
    const packages = await packageService.getActivePackages();
    ResponseHandler.success(res, {
      message: 'Active packages fetched successfully',
      data: { packages },
    });
  });

  createPackage = catchAsync(async (req, res) => {
    const data = createPackageSchema.parse(req.body);
    this.log.info(`Admin: creating package "${data.name}"`);
    const pkg = await packageService.createPackage(data);
    ResponseHandler.created(res, {
      message: 'Package created successfully',
      data: { package: pkg },
    });
  });

  updatePackage = catchAsync(async (req, res) => {
    const { id } = req.params;
    const data = updatePackageSchema.parse(req.body);
    this.log.info(`Admin: updating package ${id}`);
    const pkg = await packageService.updatePackage(id, data);
    ResponseHandler.updated(res, {
      message: 'Package updated successfully',
      data: { package: pkg },
    });
  });

  deletePackage = catchAsync(async (req, res) => {
    const { id } = req.params;
    this.log.info(`Admin: deleting package ${id}`);
    await packageService.deletePackage(id);
    ResponseHandler.success(res, {
      message: 'Package deleted successfully',
      data: { deletedAt: new Date().toISOString() },
    });
  });
}

export const packageController = new PackageController();