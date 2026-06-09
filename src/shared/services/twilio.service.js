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
            // Twilio SDK v6 only supports 'group' and 'group-small'.
            // 'group-small' = max 4 participants, lower cost, auto-subscribes
            // all tracks — so no manual publication.subscribe() needed on client.
            const room = await this.client.video.v1.rooms.create({
                uniqueName: roomName,
                type: 'group-small',
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
            await this.client.video.v1.rooms(roomSid).update({ status: 'completed' });
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