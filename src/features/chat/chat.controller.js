// src/features/chat/chat.controller.js
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { chatService } from './chat.service.js';
import { Logger } from '../../config/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/globals/helpers/error-handler.js';
import {
    notifyChatRequestPending,
    notifySessionAccepted,
    notifyChatRequestDeclined,
    notifySessionEnded,
    prepareSessionEnd,
} from '../../socket/index.js';

const log = new Logger('ChatController');

class ChatController {

    getOrCreateConversation = catchAsync(async (req, res) => {
        const { otherUserId } = req.body;
        const conversation = await chatService.getOrCreateConversation(req.user.id, otherUserId);
        ResponseHandler.success(res, { message: 'Conversation fetched', data: { conversation } });
    });

    getConversations = catchAsync(async (req, res) => {
        const conversations = await chatService.getUserConversations(req.user.id);
        ResponseHandler.success(res, { message: 'Conversations fetched', data: { conversations } });
    });

    getMessages = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const result = await chatService.getMessages(conversationId, req.user.id, parseInt(page), parseInt(limit));
        ResponseHandler.success(res, { message: 'Messages fetched', data: result });
    });

    sendMessage = catchAsync(async (req, res) => {
        const { conversationId, message } = req.body;
        const newMessage = await chatService.sendMessage(conversationId, req.user.id, message);
        ResponseHandler.success(res, { message: 'Message sent', data: { message: newMessage } });
    });

    uploadFile = catchAsync(async (req, res) => {
        const file = req.file;
        if (!file) return ResponseHandler.badRequest(res, 'No file uploaded');
        const fileUrl = `${process.env.BACKEND_URL}/uploads/chat/${file.filename}`;
        ResponseHandler.success(res, {
            message: 'File uploaded',
            data: { fileUrl, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size }
        });
    });

    markAsRead = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        await chatService.markAllAsRead(conversationId, req.user.id);
        ResponseHandler.success(res, { message: 'Messages marked as read' });
    });

    getUnreadCount = catchAsync(async (req, res) => {
        const count = await chatService.getUnreadCount(req.user.id);
        ResponseHandler.success(res, { message: 'Unread count fetched', data: { count } });
    });

    // ── Session endpoints ─────────────────────────────────────────

    startSession = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const { sessionType = 'CHAT' } = req.body;
        const session = await chatService.startSession(conversationId, req.user.id, sessionType);
        await notifyChatRequestPending(conversationId, {
            sessionType: session?.sessionType || sessionType,
            customerName: req.user.name,
            customerId: req.user.id,
            consultantUserId: session?.consultantUserId,
            pricePerMinute: 2.50,
        });
        ResponseHandler.success(res, { message: 'Chat request sent', data: { session } });
    });

    acceptSession = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const session = await chatService.acceptSession(conversationId, req.user.id);
        await notifySessionAccepted(conversationId, session);
        ResponseHandler.success(res, { message: 'Chat request accepted', data: { session } });
    });

    declineSession = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const session = await chatService.declineSession(conversationId, req.user.id);
        notifyChatRequestDeclined(conversationId);
        ResponseHandler.success(res, { message: 'Chat request declined', data: { session } });
    });

    emailTranscript = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const result = await chatService.emailTranscript(conversationId, req.user.id);
        ResponseHandler.success(res, { message: 'Transcript emailed successfully', data: result });
    });

    endSession = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const endTimestamp = Date.now();

        try {
            // Socket notify is best-effort — must not block session end
            try {
                await prepareSessionEnd(conversationId, endTimestamp);
            } catch (socketErr) {
                log.warn(`prepareSessionEnd failed (non-fatal): ${socketErr.message}`);
            }

            const session = await chatService.endSession(conversationId, 'user_ended', endTimestamp);

            if (!session) {
                return ResponseHandler.notFound(res, { message: 'Conversation not found' });
            }

            if (!session.alreadyEnded) {
                try {
                    await notifySessionEnded(conversationId, session);
                } catch (socketErr) {
                    log.warn(`notifySessionEnded failed (non-fatal): ${socketErr.message}`);
                }
            }

            ResponseHandler.success(res, { message: 'Session ended', data: { session } });
        } catch (err) {
            log.error(`endSession failed for ${conversationId}: ${err.message}`, { stack: err.stack });
            if (err instanceof BadRequestError || err.name === 'BadRequestError') {
                return ResponseHandler.badRequest(res, { message: err.message });
            }
            if (err instanceof NotFoundError || err.name === 'NotFoundError') {
                return ResponseHandler.notFound(res, { message: err.message });
            }
            if (err instanceof ForbiddenError || err.name === 'ForbiddenError') {
                return ResponseHandler.forbidden(res, { message: err.message });
            }
            throw err;
        }
    });

    getSessionStatus = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const status = await chatService.getSessionStatus(conversationId, req.user.id);
        ResponseHandler.success(res, { message: 'Session status fetched', data: { status } });
    });
}

export const chatController = new ChatController();