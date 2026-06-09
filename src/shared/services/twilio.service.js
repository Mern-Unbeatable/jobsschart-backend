import Twilio from 'twilio';
import { Logger } from '../../config/logger.js';
import { prisma } from '../../config/db.js';
import { config } from '../../config/config.js';

const log = new Logger('TwilioService');

class TwilioService {
    constructor() {
        this.client = Twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    }

    generateAccessToken(userId, identity, roomName, callType) {
        const { AccessToken } = Twilio.jwt;
        const { VideoGrant } = AccessToken;

        const token = new AccessToken(
            config.TWILIO_ACCOUNT_SID,
            config.TWILIO_API_KEY,
            config.TWILIO_API_SECRET,
            { identity, ttl: 3600 }
        );

        const videoGrant = new VideoGrant({ room: roomName });
        token.addGrant(videoGrant);

        return token.toJwt();
    }

    async createRoom(roomName, callId) {
        try {
            // ─────────────────────────────────────────────────────────
            // KEY FIX: Use 'go' (peer-to-peer) instead of 'group'.
            // In a 'group' room, each participant must manually call
            // publication.subscribe() for remote tracks — if that call
            // is missed or times out, the other side hears nothing.
            // 'go' rooms (peer-to-peer, max 2 participants) auto-subscribe
            // all tracks on both sides, so audio/video just works.
            // ─────────────────────────────────────────────────────────
            const room = await this.client.video.rooms.create({
                uniqueName: roomName,
                type: 'go',          // peer-to-peer, auto-subscribes all tracks
                maxParticipants: 2,
            });

            log.info(`Room created: ${room.sid} for call ${callId}`);
            await prisma.call.update({
                where: { id: callId },
                data: {
                    telecomCallId: room.sid,
                    roomUrl: roomName,
                },
            });

            return room;
        } catch (error) {
            log.error(`Error creating room: ${error.message}`);
            throw error;
        }
    }

    async endRoom(roomSid) {
        try {
            await this.client.video.rooms(roomSid).update({ status: 'completed' });
            log.info(`Room ${roomSid} ended`);
        } catch (error) {
            log.error(`Error ending room: ${error.message}`);
        }
    }

    calculateCallCost(pricePerMinute, durationSeconds) {
        const durationMinutes = Math.ceil(durationSeconds / 60);
        const totalCost = pricePerMinute * durationMinutes;
        return {
            totalCost: parseFloat(totalCost.toFixed(2)),
            durationMinutes,
        };
    }
}

export const twilioService = new TwilioService();