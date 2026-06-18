// // src/socket/index.js
// import { Server } from 'socket.io';
// import { Logger } from '../config/logger.js';
// import { prisma } from '../config/db.js';
// import fs from 'fs';
// import path from 'path';

// const log = new Logger('SocketServer');
// let io;

// export const initSocket = (httpServer) => {
//     io = new Server(httpServer, {
//         cors: {
//             origin: ['http://localhost:5173', 'http://localhost:3000'],
//             credentials: true,
//             methods: ['GET', 'POST', "PUT", "PATCH", "DELETE"],
//         }
//     });

//     io.on('connection', (socket) => {
//         log.info(`New client connected: ${socket.id}`);

//         // Register user
//         // socket.on('register', (userId) => {
//         //     socket.userId = userId;
//         //     socket.join(`user_${userId}`);
//         //     log.info(`User ${userId} registered`);
//         // });
//         // socket/index.js — শুধু register handler টা update করুন
//         // src/socket/index.js - Update the register handler
//         socket.on('register', (userId) => {
//             if (!userId) {
//                 console.log('⚠️ Register called without userId');
//                 socket.emit('registered', { error: 'No userId provided' });
//                 return;
//             }

//             // Store userId on socket
//             socket.userId = userId;

//             // Leave previous rooms
//             const rooms = [...socket.rooms];
//             rooms.forEach(room => {
//                 if (room !== socket.id && room.startsWith('user_')) {
//                     socket.leave(room);
//                     console.log(`Left room: ${room}`);
//                 }
//             });

//             // Join new room
//             const roomName = `user_${userId}`;
//             socket.join(roomName);

//             console.log(`✅✅✅ User ${userId} REGISTERED in room: ${roomName}`);
//             console.log(`📊 Active rooms:`, [...io.sockets.adapter.rooms.keys()]);

//             // Send confirmation back to client
//             socket.emit('registered', {
//                 success: true,
//                 userId: userId,
//                 socketId: socket.id,
//                 room: roomName,
//                 timestamp: new Date().toISOString()
//             });
//         });
//         // ============================================
//         // 1. GET OR CREATE CONVERSATION (One-to-One)
//         // ============================================
//         socket.on('get_conversation', async (data, callback) => {
//             try {
//                 const { userId, otherUserId } = data;

//                 let conversation = await prisma.chatConversation.findFirst({
//                     where: {
//                         AND: [
//                             { participants: { some: { userId } } },
//                             { participants: { some: { userId: otherUserId } } }
//                         ]
//                     },
//                     include: {
//                         participants: {
//                             include: {
//                                 user: {
//                                     select: { id: true, name: true, email: true, avatar: true }
//                                 }
//                             }
//                         },
//                         messages: {
//                             orderBy: { createdAt: 'desc' },
//                             take: 50,
//                             include: {
//                                 sender: {
//                                     select: { id: true, name: true, avatar: true }
//                                 }
//                             }
//                         }
//                     }
//                 });

//                 if (!conversation) {
//                     conversation = await prisma.chatConversation.create({
//                         data: {
//                             participants: {
//                                 create: [
//                                     { userId },
//                                     { userId: otherUserId }
//                                 ]
//                             }
//                         },
//                         include: {
//                             participants: {
//                                 include: {
//                                     user: {
//                                         select: { id: true, name: true, email: true, avatar: true }
//                                     }
//                                 }
//                             },
//                             messages: {
//                                 orderBy: { createdAt: 'desc' },
//                                 take: 50,
//                                 include: {
//                                     sender: {
//                                         select: { id: true, name: true, avatar: true }
//                                     }
//                                 }
//                             }
//                         }
//                     });
//                 }

//                 socket.join(`conv_${conversation.id}`);
//                 callback({ success: true, conversation });
//             } catch (error) {
//                 callback({ success: false, error: error.message });
//             }
//         });

//         // ============================================
//         // 2. SEND TEXT MESSAGE
//         // ============================================
//         socket.on('send_message', async (data, callback) => {
//             try {
//                 const { conversationId, message } = data;

//                 const newMessage = await prisma.chatMessage.create({
//                     data: {
//                         conversationId,
//                         senderId: socket.userId,
//                         message,
//                         isRead: false
//                     },
//                     include: {
//                         sender: {
//                             select: { id: true, name: true, avatar: true }
//                         }
//                     }
//                 });

//                 await prisma.chatConversation.update({
//                     where: { id: conversationId },
//                     data: { updatedAt: new Date() }
//                 });

//                 // Get all participants
//                 const participants = await prisma.chatParticipant.findMany({
//                     where: { conversationId },
//                     select: { userId: true }
//                 });

//                 // Send to all participants except sender
//                 for (const p of participants) {
//                     if (p.userId !== socket.userId) {
//                         io.to(`user_${p.userId}`).emit('new_message', {
//                             conversationId,
//                             message: newMessage
//                         });
//                     }
//                 }

//                 callback({ success: true, message: newMessage });
//             } catch (error) {
//                 callback({ success: false, error: error.message });
//             }
//         });

//         // ============================================
//         // 3. SEND FILE/IMAGE/VIDEO
//         // ============================================
//         socket.on('send_file', async (data, callback) => {
//             try {
//                 const { conversationId, fileUrl, fileName, fileType, fileSize } = data;

//                 const newMessage = await prisma.chatMessage.create({
//                     data: {
//                         conversationId,
//                         senderId: socket.userId,
//                         fileUrl,
//                         fileName,
//                         fileType,
//                         fileSize,
//                         isRead: false
//                     },
//                     include: {
//                         sender: {
//                             select: { id: true, name: true, avatar: true }
//                         }
//                     }
//                 });

//                 await prisma.chatConversation.update({
//                     where: { id: conversationId },
//                     data: { updatedAt: new Date() }
//                 });

//                 const participants = await prisma.chatParticipant.findMany({
//                     where: { conversationId },
//                     select: { userId: true }
//                 });

//                 for (const p of participants) {
//                     if (p.userId !== socket.userId) {
//                         io.to(`user_${p.userId}`).emit('new_file', {
//                             conversationId,
//                             message: newMessage
//                         });
//                     }
//                 }

//                 callback({ success: true, message: newMessage });
//             } catch (error) {
//                 callback({ success: false, error: error.message });
//             }
//         });

//         // ============================================
//         // 4. GET MESSAGES HISTORY
//         // ============================================
//         socket.on('get_messages', async (data, callback) => {
//             try {
//                 const { conversationId, page = 1, limit = 50 } = data;
//                 const skip = (page - 1) * limit;

//                 const messages = await prisma.chatMessage.findMany({
//                     where: { conversationId },
//                     include: {
//                         sender: {
//                             select: { id: true, name: true, avatar: true }
//                         }
//                     },
//                     orderBy: { createdAt: 'desc' },
//                     skip,
//                     take: limit
//                 });

//                 callback({
//                     success: true,
//                     messages: messages.reverse(),
//                     hasMore: messages.length === limit
//                 });
//             } catch (error) {
//                 callback({ success: false, error: error.message });
//             }
//         });

//         // ============================================
//         // 5. MARK MESSAGE AS READ
//         // ============================================
//         socket.on('mark_read', async (data) => {
//             try {
//                 const { messageId, conversationId } = data;

//                 await prisma.chatMessage.update({
//                     where: { id: messageId },
//                     data: { isRead: true, readAt: new Date() }
//                 });

//                 await prisma.chatParticipant.updateMany({
//                     where: { conversationId, userId: socket.userId },
//                     data: { lastReadAt: new Date() }
//                 });

//                 const message = await prisma.chatMessage.findUnique({
//                     where: { id: messageId },
//                     select: { senderId: true }
//                 });

//                 if (message && message.senderId !== socket.userId) {
//                     io.to(`user_${message.senderId}`).emit('message_read', {
//                         messageId,
//                         conversationId,
//                         readBy: socket.userId
//                     });
//                 }
//             } catch (error) {
//                 log.error(`Mark read error: ${error.message}`);
//             }
//         });

//         // ============================================
//         // 6. TYPING INDICATOR
//         // ============================================
//         socket.on('typing_start', async (data) => {
//             const { conversationId } = data;
//             const participants = await prisma.chatParticipant.findMany({
//                 where: { conversationId, NOT: { userId: socket.userId } },
//                 select: { userId: true }
//             });
//             for (const p of participants) {
//                 io.to(`user_${p.userId}`).emit('user_typing', {
//                     conversationId,
//                     userId: socket.userId,
//                     isTyping: true
//                 });
//             }
//         });

//         socket.on('typing_stop', async (data) => {
//             const { conversationId } = data;
//             const participants = await prisma.chatParticipant.findMany({
//                 where: { conversationId, NOT: { userId: socket.userId } },
//                 select: { userId: true }
//             });
//             for (const p of participants) {
//                 io.to(`user_${p.userId}`).emit('user_typing', {
//                     conversationId,
//                     userId: socket.userId,
//                     isTyping: false
//                 });
//             }
//         });

//         // ============================================
//         // 7. GET ALL CONVERSATIONS
//         // ============================================
//         socket.on('get_conversations', async (callback) => {
//             try {
//                 const conversations = await prisma.chatConversation.findMany({
//                     where: {
//                         participants: { some: { userId: socket.userId } }
//                     },
//                     include: {
//                         participants: {
//                             include: {
//                                 user: {
//                                     select: { id: true, name: true, email: true, avatar: true }
//                                 }
//                             }
//                         },
//                         messages: {
//                             orderBy: { createdAt: 'desc' },
//                             take: 1
//                         }
//                     },
//                     orderBy: { updatedAt: 'desc' }
//                 });

//                 // Add unread count and last message
//                 const convWithDetails = await Promise.all(conversations.map(async (conv) => {
//                     const unreadCount = await prisma.chatMessage.count({
//                         where: {
//                             conversationId: conv.id,
//                             senderId: { not: socket.userId },
//                             isRead: false
//                         }
//                     });

//                     const lastMessage = conv.messages[0];
//                     const otherParticipant = conv.participants.find(p => p.userId !== socket.userId);

//                     return {
//                         ...conv,
//                         unreadCount,
//                         lastMessage,
//                         otherParticipant: otherParticipant?.user
//                     };
//                 }));

//                 callback({ success: true, conversations: convWithDetails });
//             } catch (error) {
//                 callback({ success: false, error: error.message });
//             }
//         });

//         socket.on('disconnect', () => {
//             log.info(`Client disconnected: ${socket.id}`);
//         });
//     });

//     return io;
// };

// export const getIO = () => {
//     if (!io) throw new Error('Socket.io not initialized');
//     return io;
// };

// // Call events (existing)
// // export const emitIncomingCall = (consultantUserId, callData) => {
// //     if (io) io.to(`user_${consultantUserId}`).emit('incoming_call', callData);
// // };

// // emitIncomingCall function
// export const emitIncomingCall = (consultantUserId, callData) => {
//     if (!io) {
//         console.error('❌ Socket.io not initialized!');
//         return;
//     }

//     const room = `user_${consultantUserId}`;
//     const socketsInRoom = io.sockets.adapter.rooms.get(room);

//     console.log(`📡 Emitting incoming_call to room: ${room}`);
//     console.log(`📡 Sockets in room: ${socketsInRoom ? socketsInRoom.size : 0}`);

//     if (!socketsInRoom || socketsInRoom.size === 0) {
//         console.error(`❌ NO SOCKETS in room ${room} — consultant is not connected!`);
//         console.log('All rooms:', [...io.sockets.adapter.rooms.keys()]);
//     }

//     io.to(room).emit('incoming_call', callData);
//     console.log('✅ incoming_call emitted to', room);
// };
// export const emitCallAccepted = (userId, callData) => {
//     if (io) io.to(`user_${userId}`).emit('call_accepted', callData);
// };
// export const emitCallRejected = (userId, callData) => {
//     if (io) io.to(`user_${userId}`).emit('call_rejected', callData);
// };
// export const emitCallEnded = (userId, callData) => {
//     if (io) io.to(`user_${userId}`).emit('call_ended', callData);
// };

