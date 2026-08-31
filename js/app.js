/**
 * RetroLens Studio Pro - Main Web Application & MediaPipe Pipeline
 * Ultra 60 FPS Optimized Engine (Adaptive Canvas & Zero-GC Shaders)
 */

import { GeometryUtils } from './geometry.js';
import { FilterBank, FILTERS_LIST } from './filters.js';

class RetroLensApp {
    constructor() {
        this.video = document.getElementById('inputVideo');
        this.canvas = document.getElementById('outputCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // Offscreen canvas for isolated portal image processing
        this.offCanvas = document.createElement('canvas');
        this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });

        // Mobile Device Detection
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

        // Default Config (Ultra-Smooth 60 FPS Processing Resolution)
        this.config = {
            width: this.isMobile ? 640 : 960,
            height: this.isMobile ? 360 : 540,
            pinchThresholdPx: this.isMobile ? 40.0 : 50.0,
            filterCooldownMs: 250,
            modeCooldownMs: 1200,
            gestureCooldownMs: 1500,
            fistDistThresholdPx: 85.0,
        };

        // Customizable Portal Style Settings
        this.settings = {
            borderColor: '#00f2fe',
            borderWidth: 3,
            showSkeleton: true
        };

        // State
        this.filters = FILTERS_LIST;
        this.activeFilterIdx = 0;
        this.is3DMode = false;
        this.soundEnabled = true;
        this.facingMode = 'user'; // 'user' (selfie) or 'environment' (rear camera)
        this.isMirrored = true;   // Selfie Mirror Toggle
        this.isFrozen = false;     // Freeze / Pause Frame Toggle
        this.stream = null;
        this.animFrameId = null;
        this.isProcessing = false;
        this.aiFrameSkip = 0;

        // Snapshot Countdown Timer State
        this.isCountingDown = false;
        this.countdownIntervalId = null;

        // Video Recording State
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recDurationSec = 0;
        this.recTimerInterval = null;

        // In-App Media Gallery State
        this.galleryItems = [];

        this.lastFilterSwitchTime = 0;
        this.lastModeToggleTime = 0;
        this.lastGestureTime = 0;

        // FPS calculation
        this.fps = 60;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;

        // Store latest hand results for continuous rendering
        this.latestResults = null;

        // Web Audio Context
        this.audioCtx = null;

        // MediaPipe Hands instance
        this.hands = null;

        this.initDOM();
        this.initAudio();
        this.initMediaPipe();
    }

    get currentFilter() {
        return this.filters[this.activeFilterIdx];
    }

    get secondaryFilter() {
        return this.filters[(this.activeFilterIdx + 1) % this.filters.length];
    }

    initDOM() {
        this.hudMode = document.getElementById('hudMode');
        this.hudFilter = document.getElementById('hudFilter');
        this.hudFps = document.getElementById('hudFps');
        this.hudRec = document.getElementById('hudRec');
        this.freezePill = document.getElementById('freezePill');
        this.recTimerText = document.getElementById('recTimerText');
        this.gestureHint = document.getElementById('gestureHint');
        this.splashScreen = document.getElementById('splashScreen');
        this.btnStartCamera = document.getElementById('btnStartCamera');
        this.filtersListContainer = document.getElementById('filtersList');
        
        this.timerOverlay = document.getElementById('timerOverlay');
        this.timerNumber = document.getElementById('timerNumber');
        this.galleryCountBadge = document.getElementById('galleryCountBadge');

        this.renderFilterButtons();

        // Bind control buttons
        document.getElementById('btnSnapshot').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleSnapshotTrigger();
        });

        document.getElementById('btnRecord').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleRecording();
        });

        document.getElementById('btnPrevFilter').addEventListener('click', () => this.cycleFilter(-1));
        document.getElementById('btnNextFilter').addEventListener('click', () => this.cycleFilter(1));
        document.getElementById('btnToggleMode').addEventListener('click', () => this.toggleMode());
        document.getElementById('btnSwitchCamera').addEventListener('click', () => this.switchCamera());
        document.getElementById('btnMirror').addEventListener('click', () => this.toggleMirror());
        document.getElementById('btnFreeze').addEventListener('click', () => this.toggleFreeze());
        document.getElementById('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('btnSound').addEventListener('click', () => this.toggleSound());

        if (this.btnStartCamera) {
            this.btnStartCamera.addEventListener('click', () => this.startCamera());
        }

        // Gallery Modal
        const galleryModal = document.getElementById('galleryModal');
        document.getElementById('btnGallery').addEventListener('click', () => {
            this.renderGalleryModal();
            galleryModal.classList.add('open');
        });
        document.getElementById('btnCloseGallery').addEventListener('click', () => galleryModal.classList.remove('open'));

        // Help Modal
        const helpModal = document.getElementById('helpModal');
        document.getElementById('btnHelp').addEventListener('click', () => helpModal.classList.add('open'));
        document.getElementById('btnCloseHelp').addEventListener('click', () => helpModal.classList.remove('open'));
        document.getElementById('btnGotIt').addEventListener('click', () => helpModal.classList.remove('open'));

        // Settings Modal
        const settingsModal = document.getElementById('settingsModal');
        document.getElementById('btnSettings').addEventListener('click', () => settingsModal.classList.add('open'));
        document.getElementById('btnCloseSettings').addEventListener('click', () => settingsModal.classList.remove('open'));
        document.getElementById('btnSaveSettings').addEventListener('click', () => settingsModal.classList.remove('open'));

        // Settings Controls Binding
        const sliderGlow = document.getElementById('sliderGlow');
        const glowVal = document.getElementById('glowVal');
        sliderGlow.addEventListener('input', (e) => {
            this.settings.borderWidth = parseInt(e.target.value, 10);
            glowVal.innerText = `${this.settings.borderWidth}px`;
        });

        const checkSkeleton = document.getElementById('checkSkeleton');
        checkSkeleton.addEventListener('change', (e) => {
            this.settings.showSkeleton = e.target.checked;
        });

        const swatches = document.querySelectorAll('.swatch');
        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                this.settings.borderColor = swatch.getAttribute('data-color');
            });
        });

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const key = e.key.toLowerCase();
            if (key === 'n') this.cycleFilter(1);
            else if (key === 'p') this.cycleFilter(-1);
            else if (key === 'c') this.toggleMode();
            else if (key === 'r') this.toggleRecording();
            else if (key === 's') this.handleSnapshotTrigger();
            else if (key === 'f') this.toggleFullscreen();
            else if (e.code === 'Space') {
                e.preventDefault();
                this.toggleFreeze();
            }
        });

        this.updateCanvasDimensions(this.config.width, this.config.height);
    }

    updateCanvasDimensions(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.offCanvas.width = w;
        this.offCanvas.height = h;
    }

    renderFilterButtons() {
        this.filtersListContainer.innerHTML = '';
        this.filters.forEach((filter, idx) => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${idx === this.activeFilterIdx ? 'active' : ''}`;
            btn.innerHTML = `<span class="filter-code">${filter.code}</span> <span class="filter-name">${filter.name}</span>`;
            btn.addEventListener('click', () => {
                this.activeFilterIdx = idx;
                this.updateFilterUI();
                this.playSound('filter');
            });
            this.filtersListContainer.appendChild(btn);
        });
    }

    updateFilterUI() {
        const filter = this.currentFilter;
        this.hudFilter.innerHTML = `<span class="dot-indicator cyan"></span><span>FILTER // ${filter.name.toUpperCase()}</span>`;
        
        const buttons = this.filtersListContainer.querySelectorAll('.filter-btn');
        buttons.forEach((btn, idx) => {
            btn.classList.toggle('active', idx === this.activeFilterIdx);
        });
    }

    cycleFilter(step = 1) {
        this.activeFilterIdx = (this.activeFilterIdx + step + this.filters.length) % this.filters.length;
        this.updateFilterUI();
        this.playSound('filter');
    }

    toggleMode() {
        this.is3DMode = !this.is3DMode;
        const modeBtn = document.getElementById('modeBtnText');
        if (this.is3DMode) {
            this.hudMode.innerHTML = '<span class="dot-indicator pink"></span><span>MODE // 3D MESH</span>';
            this.hudMode.classList.remove('active-mode');
            this.hudMode.style.borderColor = 'var(--neon-pink)';
            this.hudMode.style.color = 'var(--neon-pink)';
            modeBtn.innerText = 'MODE: 3D';
        } else {
            this.hudMode.innerHTML = '<span class="dot-indicator"></span><span>MODE // 2D QUAD</span>';
            this.hudMode.style.borderColor = 'var(--neon-amber)';
            this.hudMode.style.color = 'var(--neon-amber)';
            modeBtn.innerText = 'MODE: 2D';
        }
        this.playSound('mode');
    }

    toggleMirror() {
        this.isMirrored = !this.isMirrored;
        const mirrorBtn = document.getElementById('mirrorBtnText');
        mirrorBtn.innerText = `MIRROR: ${this.isMirrored ? 'ON' : 'OFF'}`;
        this.playSound('filter');
    }

    toggleFreeze() {
        this.isFrozen = !this.isFrozen;
        const freezeBtn = document.getElementById('freezeBtnText');
        if (this.isFrozen) {
            this.freezePill.style.display = 'inline-flex';
            freezeBtn.innerText = 'UNFREEZE';
        } else {
            this.freezePill.style.display = 'none';
            freezeBtn.innerText = 'FREEZE';
        }
        this.playSound('mode');
    }

    handleSnapshotTrigger() {
        if (this.isCountingDown) return;
        this.startCountdown(3);
    }

    startCountdown(seconds = 3) {
        this.isCountingDown = true;
        let count = seconds;
        this.timerNumber.innerText = count;
        this.timerOverlay.style.display = 'flex';
        this.playSound('beep');

        if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);

        this.countdownIntervalId = setInterval(() => {
            count--;
            if (count > 0) {
                this.timerNumber.innerText = count;
                this.playSound('beep');
            } else {
                clearInterval(this.countdownIntervalId);
                this.timerOverlay.style.display = 'none';
                this.isCountingDown = false;
                this.takeSnapshot();
            }
        }, 1000);
    }

    // Video Recording Feature
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];
        for (const t of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
                return t;
            }
        }
        return '';
    }

    startRecording() {
        try {
            const canvasStream = this.canvas.captureStream(30);
            const mimeType = this.getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};

            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(canvasStream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };

            this.mediaRecorder.start(250);
            this.isRecording = true;
            this.playSound('recStart');

            const btnRec = document.getElementById('btnRecord');
            const recText = document.getElementById('recBtnText');
            btnRec.classList.add('recording');
            recText.innerText = 'STOP REC';
            this.hudRec.style.display = 'inline-flex';

            this.recDurationSec = 0;
            this.updateRecTimerUI();
            this.recTimerInterval = setInterval(() => {
                this.recDurationSec++;
                this.updateRecTimerUI();
            }, 1000);

        } catch (err) {
            console.error('Failed to start recording:', err);
            alert('Perangkat Anda tidak mendukung perekaman video langsung di browser.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.playSound('recStop');

            if (this.recTimerInterval) clearInterval(this.recTimerInterval);

            const btnRec = document.getElementById('btnRecord');
            const recText = document.getElementById('recBtnText');
            btnRec.classList.remove('recording');
            recText.innerText = 'REC';
            this.hudRec.style.display = 'none';
        }
    }

    updateRecTimerUI() {
        const mins = String(Math.floor(this.recDurationSec / 60)).padStart(2, '0');
        const secs = String(this.recDurationSec % 60).padStart(2, '0');
        this.recTimerText.innerText = `REC ${mins}:${secs}`;
    }

    saveRecording() {
        if (this.recordedChunks.length === 0) return;
        const mimeType = this.mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `RetroLens_Video_${timestamp}.${ext}`;
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        this.addMediaToGallery({
            id: Date.now(),
            type: 'video',
            url: url,
            filename: filename,
            timeStr: new Date().toLocaleTimeString()
        });

        setTimeout(() => {
            document.body.removeChild(a);
        }, 100);
    }

    takeSnapshot() {
        this.playSound('snap');
        const container = document.getElementById('viewportContainer');
        container.classList.add('flash-effect');
        setTimeout(() => container.classList.remove('flash-effect'), 350);

        const dataUrl = this.canvas.toDataURL('image/png');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `RetroLens_${timestamp}.png`;

        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();

        this.addMediaToGallery({
            id: Date.now(),
            type: 'image',
            url: dataUrl,
            filename: filename,
            timeStr: new Date().toLocaleTimeString()
        });
    }

    addMediaToGallery(item) {
        this.galleryItems.unshift(item);
        this.galleryCountBadge.innerText = this.galleryItems.length;
        this.galleryCountBadge.style.display = 'inline-block';
    }

    renderGalleryModal() {
        const grid = document.getElementById('galleryGrid');
        grid.innerHTML = '';

        if (this.galleryItems.length === 0) {
            grid.innerHTML = '<p class="empty-gallery-msg">No media captures saved in this session yet. Take a snapshot or record a video!</p>';
            return;
        }

        this.galleryItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'gallery-card-item';

            let mediaElem = item.type === 'video' 
                ? `<video src="${item.url}" class="gallery-thumb" controls></video>`
                : `<img src="${item.url}" class="gallery-thumb" alt="Snapshot">`;

            card.innerHTML = `
                ${mediaElem}
                <div class="gallery-card-info">
                    <span class="gallery-type">${item.type.toUpperCase()} // ${item.timeStr}</span>
                    <div class="gallery-card-actions">
                        <a href="${item.url}" download="${item.filename}" class="btn btn-primary btn-sm">RE-SAVE</a>
                        <button class="btn btn-sm btn-delete-item" data-id="${item.id}" style="background:#ef4444; border:none; color:#fff;">DELETE</button>
                    </div>
                </div>
            `;

            card.querySelector('.btn-delete-item').addEventListener('click', (e) => {
                const id = parseInt(e.target.getAttribute('data-id'), 10);
                this.galleryItems = this.galleryItems.filter(i => i.id !== id);
                this.galleryCountBadge.innerText = this.galleryItems.length;
                if (this.galleryItems.length === 0) this.galleryCountBadge.style.display = 'none';
                this.renderGalleryModal();
            });

            grid.appendChild(card);
        });
    }

    initAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    }

    playSound(type) {
        if (!this.soundEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        if (type === 'filter') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'mode') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(520, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'beep') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'recStart') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'recStop') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'snap') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.12);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        const textSpan = document.getElementById('soundText');
        textSpan.innerText = this.soundEnabled ? 'AUDIO ON' : 'AUDIO OFF';
    }

    toggleFullscreen() {
        const container = document.getElementById('viewportContainer');
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        await this.startCamera();
    }

    initMediaPipe() {
        if (!window.Hands) {
            console.error('MediaPipe Hands library not loaded');
            this.showError('Unable to load MediaPipe AI Vision module. Please verify network connection.');
            return;
        }

        this.hands = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: this.isMobile ? 0 : 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });

        this.hands.onResults((results) => this.onHandResults(results));

        this.startCamera();
    }

    async startCamera() {
        try {
            if (this.btnStartCamera) this.btnStartCamera.style.display = 'none';

            // High Performance Camera Stream Request
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: this.isMobile ? 854 : 1280 },
                    height: { ideal: this.isMobile ? 480 : 720 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play().then(resolve);
                };
            });

            // Set canvas processing resolution for 60 FPS performance
            const vw = this.isMobile ? 640 : 960;
            const vh = this.isMobile ? 360 : 540;
            this.updateCanvasDimensions(vw, vh);

            this.splashScreen.style.display = 'none';

            this.processLoop();
        } catch (err) {
            console.error('Camera Access Error:', err);
            let msg = 'Failed to access video capture device.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = 'Camera access denied by browser permissions. Please allow camera access in URL settings.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                msg = 'Camera is currently locked by another application. Please close other camera clients.';
            } else if (err.name === 'NotFoundError') {
                msg = 'No video capture device detected on this system.';
            }
            this.showError(msg);
        }
    }

    showError(message) {
        this.splashScreen.style.display = 'flex';
        this.splashScreen.innerHTML = `
            <div style="color:#ef4444; font-size:20px; font-weight:700;">CAMERA ACCESS ERROR</div>
            <p class="splash-sub" style="color:#fca5a5; font-size:13px; max-width:380px; line-height:1.5;">${message}</p>
            <button id="btnRetryCamera" class="btn btn-primary" style="margin-top:14px; padding:8px 20px;">RETRY PERMISSIONS</button>
        `;
        document.getElementById('btnRetryCamera').addEventListener('click', () => {
            location.reload();
        });
    }

    async processLoop() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        if (!this.isFrozen && this.video.readyState >= 2 && !this.video.paused && !this.video.ended) {
            this.ctx.save();
            if (this.isMirrored && this.facingMode === 'user') {
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(this.video, -w, 0, w, h);
            } else {
                this.ctx.scale(1, 1);
                this.ctx.drawImage(this.video, 0, 0, w, h);
            }
            this.ctx.restore();

            this.renderLandmarksAndPortal(w, h);

            this.aiFrameSkip++;
            if (!this.isProcessing && this.hands && (this.aiFrameSkip % (this.isMobile ? 2 : 1) === 0)) {
                this.isProcessing = true;
                try {
                    await this.hands.send({ image: this.video });
                } catch (e) {
                    console.error('MediaPipe frame processing error:', e);
                }
                this.isProcessing = false;
            }
        }

        const now = performance.now();
        this.frameCount++;
        if (now - this.lastFrameTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFrameTime = now;
            this.hudFps.innerText = `FPS: ${this.fps}`;
        }

        this.animFrameId = requestAnimationFrame(() => this.processLoop());
    }

    onHandResults(results) {
        this.latestResults = results;
    }

    renderLandmarksAndPortal(w, h) {
        const results = this.latestResults;
        if (!results) return;

        const allHandTips = [];
        let fistCount = 0;
        const currentTime = performance.now();
        const isSelfie = (this.isMirrored && this.facingMode === 'user');

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (const landmarks of results.multiHandLandmarks) {
                if (this.settings.showSkeleton) {
                    this.drawHandSkeleton(landmarks, w, h, isSelfie);
                }

                // Peace Sign Gesture Recognition (✌️) -> Auto Snapshot
                if (GeometryUtils.isPeaceSign(landmarks)) {
                    if (currentTime - this.lastGestureTime > this.config.gestureCooldownMs) {
                        this.lastGestureTime = currentTime;
                        this.gestureHint.innerText = 'PEACE SIGN DETECTED // SNAPSHOT TIMER';
                        this.handleSnapshotTrigger();
                    }
                }

                const tips = [4, 8, 12, 16, 20].map(idx => [
                    isSelfie ? (1.0 - landmarks[idx].x) * w : landmarks[idx].x * w,
                    landmarks[idx].y * h
                ]);
                allHandTips.push(tips);

                const pinchDist = GeometryUtils.euclideanDist(tips[0], tips[4]);
                if (pinchDist < this.config.pinchThresholdPx) {
                    if (currentTime - this.lastFilterSwitchTime > this.config.filterCooldownMs) {
                        this.cycleFilter(1);
                        this.lastFilterSwitchTime = currentTime;
                        this.gestureHint.innerText = 'PINCH DETECTED // FILTER SWITCH';
                    }
                }

                if (GeometryUtils.isFistClosed(landmarks, w, h, this.config.fistDistThresholdPx)) {
                    fistCount++;
                }
            }

            if (fistCount === 2 && (currentTime - this.lastModeToggleTime > this.config.modeCooldownMs)) {
                this.toggleMode();
                this.lastModeToggleTime = currentTime;
                this.gestureHint.innerText = `DUAL FIST // MODE SWITCH (${this.is3DMode ? '3D' : '2D'})`;
            }

            if (this.is3DMode) {
                if (allHandTips.length === 2) {
                    const t1 = allHandTips[0];
                    const t2 = allHandTips[1];
                    this.renderPortalPolygon([t1[0], t1[1], t1[2], t2[2], t2[1], t2[0]], this.currentFilter.id);
                    this.renderPortalPolygon([t1[2], t1[3], t1[4], t2[4], t2[3], t2[2]], this.secondaryFilter.id);
                    this.gestureHint.innerText = '3D DUAL-MESH PORTAL ACTIVE';
                } else if (allHandTips.length === 1) {
                    this.renderPortalPolygon(allHandTips[0], this.currentFilter.id);
                    this.gestureHint.innerText = '1-HAND PORTAL ACTIVE';
                }
            } else {
                if (allHandTips.length === 2) {
                    const corners = [allHandTips[0][0], allHandTips[0][1], allHandTips[1][0], allHandTips[1][1]];
                    const quad = GeometryUtils.sortConvexQuad(corners);
                    this.gestureHint.innerText = '2D QUAD PORTAL ACTIVE';
                    this.renderPortalPolygon(quad, this.currentFilter.id);
                } else if (allHandTips.length === 1) {
                    const t = allHandTips[0];
                    this.renderPortalPolygon([t[0], t[1], t[2], t[4]], this.currentFilter.id);
                    this.gestureHint.innerText = '1-HAND PORTAL ACTIVE';
                }
            }
        } else {
            this.gestureHint.innerText = 'SPREAD HANDS TO OPEN PORTAL';
        }
    }

    renderPortalPolygon(pts, filterId) {
        if (!pts || pts.length < 3) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const bbox = GeometryUtils.getBoundingBox(pts, w, h);

        if (bbox.w <= 10 || bbox.h <= 10) return;

        const roiImageData = this.ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);

        const timeSec = performance.now() / 1000;
        this.applyFilterToImageData(filterId, roiImageData, bbox.w, bbox.h, timeSec);

        this.offCtx.putImageData(roiImageData, bbox.x, bbox.y);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            this.ctx.lineTo(pts[i][0], pts[i][1]);
        }
        this.ctx.closePath();
        this.ctx.clip();

        this.ctx.drawImage(
            this.offCanvas,
            bbox.x, bbox.y, bbox.w, bbox.h,
            bbox.x, bbox.y, bbox.w, bbox.h
        );
        this.ctx.restore();

        // Custom Border Glow & Width
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            this.ctx.lineTo(pts[i][0], pts[i][1]);
        }
        this.ctx.closePath();
        this.ctx.lineWidth = this.settings.borderWidth;
        this.ctx.strokeStyle = this.settings.borderColor;
        this.ctx.shadowColor = this.settings.borderColor;
        this.ctx.shadowBlur = this.settings.borderWidth * 3;
        this.ctx.stroke();
        this.ctx.restore();
    }

    applyFilterToImageData(filterId, imageData, width, height, timeSec) {
        switch (filterId) {
            case 'dual-tone':
                return FilterBank.dualTone(imageData);
            case 'thermal':
                return FilterBank.thermal(imageData);
            case 'sketch':
                return FilterBank.sketch(imageData, width, height);
            case 'pixelate':
                return FilterBank.pixelate(imageData, width, height, 14);
            case 'glitch':
                return FilterBank.glitch(imageData, width, height);
            case 'matrix':
                return FilterBank.matrixRain(imageData, width, height, timeSec);
            case 'cyber-scan':
                return FilterBank.cyberScan(imageData, width, height, timeSec);
            case 'vhs-tape':
                return FilterBank.vhsTape(imageData, width, height, timeSec);
            case 'sepia':
                return FilterBank.sepia(imageData);
            case 'invert':
                return FilterBank.invert(imageData);
            case 'red-channel':
                return FilterBank.redChannel(imageData);
            case 'edge':
                return FilterBank.edge(imageData, width, height);
            case 'blur':
                return FilterBank.blur(imageData, width, height, 4);
            case 'cartoon':
                return FilterBank.cartoon(imageData, width, height);
            case 'rainbow-wave':
                return FilterBank.rainbowWave(imageData, width, height, timeSec);
            default:
                return imageData;
        }
    }

    drawHandSkeleton(landmarks, w, h, isSelfie) {
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [5, 9], [9, 10], [10, 11], [11, 12],
            [9, 13], [13, 14], [14, 15], [15, 16],
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17]
        ];

        this.ctx.save();
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = `${this.settings.borderColor}80`;

        for (const [startIdx, endIdx] of connections) {
            const p1 = [isSelfie ? (1.0 - landmarks[startIdx].x) * w : landmarks[startIdx].x * w, landmarks[startIdx].y * h];
            const p2 = [isSelfie ? (1.0 - landmarks[endIdx].x) * w : landmarks[endIdx].x * w, landmarks[endIdx].y * h];

            this.ctx.beginPath();
            this.ctx.moveTo(p1[0], p1[1]);
            this.ctx.lineTo(p2[0], p2[1]);
            this.ctx.stroke();
        }

        for (let i = 0; i < landmarks.length; i++) {
            const px = isSelfie ? (1.0 - landmarks[i].x) * w : landmarks[i].x * w;
            const py = landmarks[i].y * h;

            this.ctx.beginPath();
            this.ctx.arc(px, py, [4, 8, 12, 16, 20].includes(i) ? 4 : 2.5, 0, 2 * Math.PI);
            this.ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? '#ec4899' : this.settings.borderColor;
            this.ctx.fill();
        }

        this.ctx.restore();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new RetroLensApp();
});
