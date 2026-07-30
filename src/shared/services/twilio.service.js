import Twilio from 'twilio';
import { Logger } from '../../config/logger.js';
import { prisma } from '../../config/db.js';
import { config } from '../../config/config.js';
import { BadRequestError } from '../globals/helpers/error-handler.js';

const log = new Logger('TwilioService');

/** Twilio trial/test accounts cannot use REST API to create Video rooms */
function isTrialOrTestRestriction(error) {
    const msg = String(error?.message || '').toLowerCase();
    return (
        msg.includes('test account credentials')
        || msg.includes('resource not accessible')
        || msg.includes('trial account')
        || error?.code === 20003
        || error?.code === 53126
    );
}

class TwilioService {
    constructor() {
        if (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
            this.client = Twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
        } else {
            this.client = null;
        }
    }

    isConfigured() {
        return !!(
            config.TWILIO_ACCOUNT_SID
            && config.TWILIO_AUTH_TOKEN
            && config.TWILIO_API_KEY
            && config.TWILIO_API_SECRET
        );
    }

    /**
     * Twilio Video JWT requires API Key (iss) + Account SID (sub) from the SAME account.
     * Mismatch causes: "Invalid Access Token issuer/subject"
     */
    async validateVideoCredentials() {
        if (!this.isConfigured()) {
            return { ok: false, reason: 'Twilio Video env vars are missing' };
        }

        const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET } = config;

        if (!TWILIO_ACCOUNT_SID.startsWith('AC')) {
            return { ok: false, reason: 'TWILIO_ACCOUNT_SID must start with AC' };
        }
        if (!TWILIO_API_KEY.startsWith('SK')) {
            return { ok: false, reason: 'TWILIO_API_KEY must be an API Key SID starting with SK (not Auth Token)' };
        }
        if (TWILIO_API_SECRET.length < 16) {
            return { ok: false, reason: 'TWILIO_API_SECRET looks too short — use the secret shown when the API Key was created' };
        }

        if (!this.client) {
            return { ok: false, reason: 'Twilio REST client could not be created — check ACCOUNT_SID and AUTH_TOKEN' };
        }

        try {
            const account = await this.client.api.accounts(TWILIO_ACCOUNT_SID).fetch();
            if (!account?.sid) {
                return { ok: false, reason: 'TWILIO_ACCOUNT_SID is not valid for TWILIO_AUTH_TOKEN' };
            }
        } catch (err) {
            return {
                ok: false,
                reason: `TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN rejected by Twilio: ${err.message}`,
            };
        }

        try {
            await this.client.keys(TWILIO_API_KEY).fetch();
        } catch (err) {
            if (err?.status === 404 || err?.code === 20404) {
                return {
                    ok: false,
                    reason:
                        'TWILIO_API_KEY does not belong to TWILIO_ACCOUNT_SID. '
                        + 'Create a new API Key in the same Twilio project and update TWILIO_API_KEY + TWILIO_API_SECRET.',
                };
            }
            return { ok: false, reason: `Could not verify API Key: ${err.message}` };
        }

        try {
            const probe = new Twilio.jwt.AccessToken(
                TWILIO_ACCOUNT_SID,
                TWILIO_API_KEY,
                TWILIO_API_SECRET,
                { identity: 'credential-probe', ttl: 60 },
            );
            probe.addGrant(new Twilio.jwt.AccessToken.VideoGrant({ room: 'credential-probe-room' }));
            const jwt = probe.toJwt();
            if (!jwt || jwt.split('.').length !== 3) {
                return { ok: false, reason: 'Failed to build a valid Twilio access token JWT' };
            }
        } catch (err) {
            return { ok: false, reason: `Token signing failed — TWILIO_API_SECRET may not match TWILIO_API_KEY: ${err.message}` };
        }

        return { ok: true };
    }

    generateAccessToken(userId, identity, roomName, _callType) {
        if (!this.isConfigured()) {
            throw new BadRequestError(
                'Voice/video calling is not configured on the server. Please set Twilio API credentials.'
            );
        }

        const { AccessToken } = Twilio.jwt;
        const { VideoGrant } = AccessToken;

        const token = new AccessToken(
            config.TWILIO_ACCOUNT_SID,
            config.TWILIO_API_KEY,
            config.TWILIO_API_SECRET,
            { identity: String(identity || userId), ttl: 3600 }
        );

        // Room is created automatically when the first participant connects (trial-safe)
        token.addGrant(new VideoGrant({ room: roomName }));

        return token.toJwt();
    }

    /**
     * Try REST room create (paid accounts). On trial/test accounts, skip REST and
     * let the Twilio Video SDK auto-create the room when participants connect.
     */
    async ensureRoom(roomName, callId) {
        await prisma.call.update({
            where: { id: callId },
            data: { roomUrl: roomName },
        });

        if (!this.client) {
            log.warn('Twilio client not configured — room will auto-create on connect');
            return { sid: null, autoCreate: true };
        }

        const roomTypes = ['group-small', 'group'];

        for (const type of roomTypes) {
            try {
                const room = await this.client.video.rooms.create({
                    uniqueName: roomName,
                    type,
                    maxParticipants: 2,
                });

                log.info(`Room created (${type}): ${room.sid} for call ${callId}`);
                await prisma.call.update({
                    where: { id: callId },
                    data: { telecomCallId: room.sid, roomUrl: roomName },
                });
                return { sid: room.sid, autoCreate: false };
            } catch (error) {
                if (error.code === 53113 || error.message?.includes('already exists')) {
                    return this._reuseExistingRoom(roomName, callId);
                }
                if (isTrialOrTestRestriction(error)) {
                    log.warn(
                        `REST room create not allowed (${error.message}) — ` +
                        'using client auto-create (works on Twilio trial accounts)'
                    );
                    return { sid: null, autoCreate: true };
                }
                log.warn(`Room create failed for type ${type}: ${error.message}`);
            }
        }

        log.warn(`All REST room create attempts failed for ${roomName} — using client auto-create`);
        return { sid: null, autoCreate: true };
    }

    async _reuseExistingRoom(roomName, callId) {
        try {
            const rooms = await this.client.video.rooms.list({ uniqueName: roomName, limit: 1 });
            const existing = rooms[0];
            if (existing) {
                await prisma.call.update({
                    where: { id: callId },
                    data: { telecomCallId: existing.sid, roomUrl: roomName },
                });
                return { sid: existing.sid, autoCreate: false };
            }
        } catch (listErr) {
            log.error(`Failed to fetch existing room: ${listErr.message}`);
        }
        return { sid: null, autoCreate: true };
    }

    /** Complete room by SID (RM...) or unique room name */
    async endRoom(roomSidOrName) {
        if (!this.client || !roomSidOrName) return;

        try {
            if (String(roomSidOrName).startsWith('RM')) {
                await this.client.video.rooms(roomSidOrName).update({ status: 'completed' });
                log.info(`Room ${roomSidOrName} ended`);
                return;
            }

            const rooms = await this.client.video.rooms.list({
                uniqueName: roomSidOrName,
                status: 'in-progress',
                limit: 1,
            });
            if (rooms[0]) {
                await this.client.video.rooms(rooms[0].sid).update({ status: 'completed' });
                log.info(`Room ${roomSidOrName} (${rooms[0].sid}) ended`);
            }
        } catch (error) {
            if (!isTrialOrTestRestriction(error)) {
                log.error(`Error ending room: ${error.message}`);
            }
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
