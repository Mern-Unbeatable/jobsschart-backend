// src/features/chat/chat.controller.js
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { chatService } from './chat.service.js';
import { Logger } from '../../config/logger.js';

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
        ResponseHandler.success(res, { message: 'Session started', data: { session } });
    });

    endSession = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const session = await chatService.endSession(conversationId, 'user_ended');
        ResponseHandler.success(res, { message: 'Session ended', data: { session } });
    });

    getSessionStatus = catchAsync(async (req, res) => {
        const { conversationId } = req.params;
        const status = await chatService.getSessionStatus(conversationId, req.user.id);
        ResponseHandler.success(res, { message: 'Session status fetched', data: { status } });
    });
}

export const chatController = new ChatController();