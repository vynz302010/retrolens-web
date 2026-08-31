/**
 * RetroLens - Main Web Application & MediaPipe Pipeline (Mobile & Desktop Ultra-Performance)
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

        // Default Config (Mobile-optimized resolutions)
        this.config = {
            width: this.isMobile ? 640 : 960,
            height: this.isMobile ? 360 : 540,
            pinchThresholdPx: this.isMobile ? 40.0 : 50.0,
            filterCooldownMs: 250,
            modeCooldownMs: 1200,
            fistDistThresholdPx: 85.0,
        };

        // State
        this.filters = FILTERS_LIST;
        this.activeFilterIdx = 0;
        this.is3DMode = false;
        this.soundEnabled = true;
        this.facingMode = 'user'; // 'user' (selfie) or 'environment' (rear camera)
        this.stream = null;
        this.animFrameId = null;
        this.isProcessing = false;

        this.lastFilterSwitchTime = 0;
        this.lastModeToggleTime = 0;

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
        this.gestureHint = document.getElementById('gestureHint');
        this.splashScreen = document.getElementById('splashScreen');
        this.btnStartCamera = document.getElementById('btnStartCamera');
        this.filtersListContainer = document.getElementById('filtersList');

        this.renderFilterButtons();

        document.getElementById('btnPrevFilter').addEventListener('click', () => this.cycleFilter(-1));
        document.getElementById('btnNextFilter').addEventListener('click', () => this.cycleFilter(1));
        document.getElementById('btnToggleMode').addEventListener('click', () => this.toggleMode());
        document.getElementById('btnSnapshot').addEventListener('click', () => this.takeSnapshot());
        document.getElementById('btnSwitchCamera').addEventListener('click', () => this.switchCamera());
        document.getElementById('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('btnSound').addEventListener('click', () => this.toggleSound());
        
        if (this.btnStartCamera) {
            this.btnStartCamera.addEventListener('click', () => this.startCamera());
        }

        const helpModal = document.getElementById('helpModal');
        document.getElementById('btnHelp').addEventListener('click', () => helpModal.classList.add('open'));
        document.getElementById('btnCloseHelp').addEventListener('click', () => helpModal.classList.remove('open'));
        document.getElementById('btnGotIt').addEventListener('click', () => helpModal.classList.remove('open'));

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const key = e.key.toLowerCase();
            if (key === 'n') this.cycleFilter(1);
            else if (key === 'p') this.cycleFilter(-1);
            else if (key === 'c') this.toggleMode();
            else if (key === 's') this.takeSnapshot();
            else if (key === 'f') this.toggleFullscreen();
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

    takeSnapshot() {
        this.playSound('snap');
        const container = document.getElementById('viewportContainer');
        container.classList.add('flash-effect');
        setTimeout(() => container.classList.remove('flash-effect'), 350);

        const dataUrl = this.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `RetroLens_${timestamp}.png`;
        link.href = dataUrl;
        link.click();
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

        // Use modelComplexity 0 (Lite Hand Model) on mobile for 60 FPS performance, 1 on desktop
        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: this.isMobile ? 0 : 1,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.65
        });

        this.hands.onResults((results) => this.onHandResults(results));

        this.startCamera();
    }

    async startCamera() {
        try {
            if (this.btnStartCamera) this.btnStartCamera.style.display = 'none';

            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: this.isMobile ? 640 : 1280 },
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

            const vw = this.video.videoWidth || (this.isMobile ? 640 : 960);
            const vh = this.video.videoHeight || (this.isMobile ? 480 : 540);
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

        if (this.video.readyState >= 2 && !this.video.paused && !this.video.ended) {
            this.ctx.save();
            if (this.facingMode === 'user') {
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(this.video, -w, 0, w, h);
            } else {
                this.ctx.scale(1, 1);
                this.ctx.drawImage(this.video, 0, 0, w, h);
            }
            this.ctx.restore();

            this.renderLandmarksAndPortal(w, h);

            if (!this.isProcessing && this.hands) {
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
        let isBowtie = false;
        const currentTime = performance.now();
        const isSelfie = (this.facingMode === 'user');

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (const landmarks of results.multiHandLandmarks) {
                this.drawHandSkeleton(landmarks, w, h, isSelfie);

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
                    let quad;
                    if (GeometryUtils.isHandRotated(corners[0], corners[1]) || GeometryUtils.isHandRotated(corners[2], corners[3])) {
                        quad = GeometryUtils.sortQuadBowtie(corners);
                        isBowtie = true;
                        this.gestureHint.innerText = '2D BOWTIE PORTAL ACTIVE';
                    } else {
                        quad = GeometryUtils.sortQuadClean(corners);
                        this.gestureHint.innerText = '2D QUAD PORTAL ACTIVE';
                    }
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

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            this.ctx.lineTo(pts[i][0], pts[i][1]);
        }
        this.ctx.closePath();
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeStyle = '#00f2fe';
        this.ctx.shadowColor = '#00f2fe';
        this.ctx.shadowBlur = 10;
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
        this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';

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
            this.ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? '#ec4899' : '#00f2fe';
            this.ctx.fill();
        }

        this.ctx.restore();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new RetroLensApp();
});
