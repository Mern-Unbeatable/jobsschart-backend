import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { topicService } from './topic.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('TopicController');

class TopicController {
    getAllTopics = catchAsync(async (req, res) => {
        const result = await topicService.getAllTopics(req.query);
        ResponseHandler.success(res, {
            message: 'Topics fetched successfully',
            data: result,
        });
    });

    getTopicById = catchAsync(async (req, res) => {
        const topic = await topicService.getTopicById(req.params.id);
        ResponseHandler.success(res, {
            message: 'Topic fetched successfully',
            data: { topic },
        });
    });

    createTopic = catchAsync(async (req, res) => {
        log.info(`Creating topic: ${req.body.name}`);
        const topic = await topicService.createTopic(req.body);
        ResponseHandler.created(res, {
            message: 'Topic created successfully',
            data: { topic },
        });
    });

    updateTopic = catchAsync(async (req, res) => {
        log.info(`Updating topic: ${req.params.id}`);
        const topic = await topicService.updateTopic(req.params.id, req.body);
        ResponseHandler.success(res, {
            message: 'Topic updated successfully',
            data: { topic },
        });
    });

    deleteTopic = catchAsync(async (req, res) => {
        log.info(`Deleting topic: ${req.params.id}`);
        const result = await topicService.deleteTopic(req.params.id);
        ResponseHandler.success(res, {
            message: result.message,
            data: { deletedId: req.params.id },
        });
    });
}

export const topicController = new TopicController();