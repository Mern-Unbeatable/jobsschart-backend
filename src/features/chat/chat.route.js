
import express from 'express';
import { chatController } from './chat.controller.js';
import { authMiddleware } from '../../shared/globals/helpers/auth-middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/chat';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `chat-${Date.now()}-${Math.random().toString(36).substr(2, 8)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|mp4|webm|pdf|doc|docx|txt|zip/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext || mime) cb(null, true);
        else cb(new Error('File type not allowed'));
    }
});

router.use(authMiddleware.protect);

// Conversations
router.post('/conversations', chatController.getOrCreateConversation);
router.get('/conversations', chatController.getConversations);
router.get('/conversations/:conversationId/messages', chatController.getMessages);
router.patch('/conversations/:conversationId/read', chatController.markAsRead);

// Messages
router.post('/messages', chatController.sendMessage);
router.post('/upload', upload.single('file'), chatController.uploadFile);

// Unread
router.get('/unread-count', chatController.getUnreadCount);

// Session billing
router.post('/conversations/:conversationId/session/start', chatController.startSession);
router.post('/conversations/:conversationId/session/end', chatController.endSession);
router.get('/conversations/:conversationId/session/status', chatController.getSessionStatus);

export const chatRoute = router 