import { connect as connectTwilioVideo, createLocalAudioTrack, createLocalVideoTrack } from 'twilio-video';

class TwilioVideoService {
    constructor() {
        this.room = null;
        this.localTracks = [];
        this.isMuted = false;
        this.isVideoOff = false;
        this._audioContainer = null;
        this._participantListeners = new Map();
    }

    _getAudioContainer() {
        if (!this._audioContainer) {
            let container = document.getElementById('twilio-audio-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'twilio-audio-container';
                container.style.cssText =
                    'position:fixed;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;';
                document.body.appendChild(container);
            }
            this._audioContainer = container;
        }
        return this._audioContainer;
    }

    _cleanupBeforeConnect() {
        this._participantListeners.forEach((listeners, participant) => {
            listeners.forEach(({ event, fn }) => {
                try { participant.off(event, fn); } catch (_) { }
            });
        });
        this._participantListeners.clear();

        this.localTracks.forEach(track => {
            try { track.stop(); track.detach().forEach(el => el.remove()); } catch (_) { }
        });
        this.localTracks = [];

        if (this.room) {
            try { this.room.removeAllListeners(); this.room.disconnect(); } catch (_) { }
            this.room = null;
        }

        if (this._audioContainer) {
            this._audioContainer.innerHTML = '';
        }
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

    _attachTrack(track, remoteVideoRef) {
        if (track.kind === 'audio') {
            const audioContainer = this._getAudioContainer();
            const el = track.attach();
            el.autoplay = true;
            el.playsInline = true;
            el.muted = false;
            el.volume = 1;
            audioContainer.appendChild(el);

            const tryPlay = () => {
                const p = el.play();
                if (p) p.catch(() => setTimeout(() => el.play().catch(() => { }), 500));
            };
            tryPlay();

            const unlock = () => {
                tryPlay();
                document.removeEventListener('click', unlock);
                document.removeEventListener('touchstart', unlock);
            };
            document.addEventListener('click', unlock);
            document.addEventListener('touchstart', unlock);
        } else if (track.kind === 'video') {
            if (!remoteVideoRef) return;
            const el = track.attach();
            el.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            remoteVideoRef.appendChild(el);
        }
    }

    _attachParticipant(participant, remoteVideoRef) {
        const listeners = [];

        const subscribeToPublication = (publication) => {
            if (publication.isSubscribed && publication.track) {
                this._attachTrack(publication.track, remoteVideoRef);
            } else {
                publication.subscribe().catch(err => {
                    console.warn('subscribe() failed:', err.message);
                });
            }
        };

        participant.tracks.forEach(publication => {
            subscribeToPublication(publication);
        });

        const onTrackPublished = publication => {
            subscribeToPublication(publication);
        };
        participant.on('trackPublished', onTrackPublished);
        listeners.push({ event: 'trackPublished', fn: onTrackPublished });

        const onTrackSubscribed = track => {
            this._attachTrack(track, remoteVideoRef);
        };
        participant.on('trackSubscribed', onTrackSubscribed);
        listeners.push({ event: 'trackSubscribed', fn: onTrackSubscribed });

        const onTrackUnsubscribed = track => {
            track.detach().forEach(el => el.remove());
        };
        participant.on('trackUnsubscribed', onTrackUnsubscribed);
        listeners.push({ event: 'trackUnsubscribed', fn: onTrackUnsubscribed });

        this._participantListeners.set(participant, listeners);
    }

    async connectVideo(token, roomName, localVideoRef, remoteVideoRef) {
        this._cleanupBeforeConnect();

        const localTracks = await this._getLocalTracks('VIDEO');
        this.localTracks = localTracks;

        this.room = await connectTwilioVideo(token, {
            name: roomName,
            tracks: localTracks,
        });

        console.log('✅ Connected to video room:', this.room.name);

        localTracks.forEach(track => {
            if (track.kind === 'video' && localVideoRef) {
                const el = track.attach();
                el.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                localVideoRef.innerHTML = '';
                localVideoRef.appendChild(el);
            }
        });

        this.room.participants.forEach(participant => {
            this._attachParticipant(participant, remoteVideoRef);
        });

        this.room.on('participantConnected', participant => {
            this._attachParticipant(participant, remoteVideoRef);
        });

        this.room.on('participantDisconnected', participant => {
            participant.tracks.forEach(publication => {
                if (publication.track) {
                    publication.track.detach().forEach(el => el.remove());
                }
            });
            this._participantListeners.delete(participant);
        });

        this.room.on('disconnected', () => {
            this.cleanup();
        });

        return this.room;
    }

    async connectAudio(token, roomName, onConnect, onDisconnect) {
        this._cleanupBeforeConnect();

        const localTracks = await this._getLocalTracks('AUDIO');
        this.localTracks = localTracks;

        this.room = await connectTwilioVideo(token, {
            name: roomName,
            tracks: localTracks,
        });

        console.log('✅ Connected to audio room:', this.room.name);

        this.room.participants.forEach(participant => {
            this._attachParticipant(participant, null);
        });

        this.room.on('participantConnected', participant => {
            this._attachParticipant(participant, null);
            onConnect?.();
        });

        this.room.on('participantDisconnected', participant => {
            participant.tracks.forEach(publication => {
                if (publication.track) {
                    publication.track.detach().forEach(el => el.remove());
                }
            });
            onDisconnect?.();
        });

        this.room.on('disconnected', () => {
            this.cleanup();
            onDisconnect?.();
        });

        if (this.room.participants.size > 0) {
            setTimeout(() => onConnect?.(), 200);
        }

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
        if (this.room) {
            this.room.localParticipant.videoTracks.forEach(publication => {
                if (publication.track) publication.track.disable();
            });
        }
        this.isVideoOff = true;
    }
    enableVideo() {
        if (this.room) {
            this.room.localParticipant.videoTracks.forEach(publication => {
                if (publication.track) publication.track.enable();
            });
        }
        this.isVideoOff = false;
    }

    cleanup() {
        this._participantListeners.forEach((listeners, participant) => {
            listeners.forEach(({ event, fn }) => {
                try { participant.off(event, fn); } catch (_) { }
            });
        });
        this._participantListeners.clear();

        this.localTracks.forEach(track => {
            try { track.stop(); track.detach().forEach(el => el.remove()); } catch (_) { }
        });
        this.localTracks = [];

        if (this.room) {
            try { this.room.removeAllListeners(); this.room.disconnect(); } catch (_) { }
            this.room = null;
        }

        if (this._audioContainer) {
            this._audioContainer.innerHTML = '';
        }

        this.isMuted = false;
        this.isVideoOff = false;
    }

    disconnect() {
        this.cleanup();
    }
}

export const twilioVideoService = new TwilioVideoService();