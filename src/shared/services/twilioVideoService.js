import { connect as connectTwilioVideo, createLocalAudioTrack, createLocalVideoTrack } from 'twilio-video';

class TwilioVideoService {
    constructor() {
        this.room = null;
        this.localTracks = [];
        this.isMuted = false;
        this.isVideoOff = false;
    }

    async _getLocalTracks(callType) {
        const tracks = [];
        try {
            const audioTrack = await createLocalAudioTrack();
            tracks.push(audioTrack);
        } catch (e) {
            console.warn('⚠️ No microphone:', e.message);
        }
        if (callType === 'VIDEO') {
            try {
                const videoTrack = await createLocalVideoTrack({ width: 640, height: 480 });
                tracks.push(videoTrack);
            } catch (e) {
                console.warn('⚠️ No camera:', e.message);
            }
        }
        return tracks;
    }

    _attachParticipant(participant, remoteVideoRef) {
        participant.tracks.forEach(publication => {
            if (publication.isSubscribed && publication.track) {
                const el = publication.track.attach();
                if (remoteVideoRef) remoteVideoRef.appendChild(el);
            }
        });
        participant.on('trackSubscribed', track => {
            const el = track.attach();
            if (remoteVideoRef) remoteVideoRef.appendChild(el);
        });
        participant.on('trackUnsubscribed', track => {
            track.detach().forEach(el => el.remove());
        });
    }

    async connectVideo(token, roomName, localVideoRef, remoteVideoRef) {
        // Get local tracks gracefully — never throws even if no devices
        const localTracks = await this._getLocalTracks('VIDEO');
        this.localTracks = localTracks;

        // ✅ Connect with tracks array (not audio:true/video:true which throws)
        this.room = await connectTwilioVideo(token, {
            name: roomName,
            tracks: localTracks,
        });

        console.log('✅ Connected to video room:', this.room.name);

        // Attach local video to PiP
        localTracks.forEach(track => {
            if (track.kind === 'video' && localVideoRef) {
                const el = track.attach();
                el.style.width = '100%';
                el.style.height = '100%';
                el.style.objectFit = 'cover';
                localVideoRef.innerHTML = '';
                localVideoRef.appendChild(el);
            }
        });

        // Attach already-connected remote participants
        this.room.participants.forEach(participant => {
            this._attachParticipant(participant, remoteVideoRef);
        });

        this.room.on('participantConnected', participant => {
            if (remoteVideoRef) remoteVideoRef.innerHTML = '';
            this._attachParticipant(participant, remoteVideoRef);
        });

        this.room.on('participantDisconnected', participant => {
            participant.tracks.forEach(publication => {
                if (publication.track) {
                    publication.track.detach().forEach(el => el.remove());
                }
            });
        });

        this.room.on('disconnected', (room, error) => {
            console.log('🔌 Disconnected from room', error?.message);
            this.cleanup();
        });

        return this.room;
    }

    async connectAudio(token, roomName, onConnect, onDisconnect) {
        const localTracks = await this._getLocalTracks('PHONE');
        this.localTracks = localTracks;

        this.room = await connectTwilioVideo(token, {
            name: roomName,
            tracks: localTracks,
        });

        console.log('✅ Connected to audio room:', this.room.name);

        this.room.participants.forEach(() => onConnect?.());
        this.room.on('participantConnected', () => onConnect?.());
        this.room.on('participantDisconnected', () => onDisconnect?.());
        this.room.on('disconnected', () => {
            this.cleanup();
            onDisconnect?.();
        });

        return this.room;
    }

    mute() {
        this.localTracks.forEach(t => { if (t.kind === 'audio') t.disable(); });
        this.isMuted = true;
    }
    unmute() {
        this.localTracks.forEach(t => { if (t.kind === 'audio') t.enable(); });
        this.isMuted = false;
    }
    disableVideo() {
        this.localTracks.forEach(t => { if (t.kind === 'video') t.disable(); });
        this.isVideoOff = true;
    }
    enableVideo() {
        this.localTracks.forEach(t => { if (t.kind === 'video') t.enable(); });
        this.isVideoOff = false;
    }

    cleanup() {
        this.localTracks.forEach(track => {
            track.stop();
            track.detach().forEach(el => el.remove());
        });
        this.localTracks = [];
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
    }

    disconnect() {
        this.cleanup();
    }
}

export const twilioVideoService = new TwilioVideoService();