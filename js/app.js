/**
 * RetroLens Studio Pro - Main Web Application & MediaPipe Pipeline
 * Ultra 60 FPS Optimized Engine (Native Stream Aspect, Plasma Electric Arcs, Theremin Synth & Cyber Watermark)
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

        // Offscreen canvas for Air Drawing overlay layer
        this.drawingCanvas = document.createElement('canvas');
        this.drawingCtx = this.drawingCanvas.getContext('2d');
        this.isAirDrawing = false;
        this.isEraser = false;
        this.lastDrawPt = null;

        // Mobile Device Detection
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

        // Default Config
        this.config = {
            width: 640,
            height: 480,
            pinchThresholdPx: this.isMobile ? 40.0 : 50.0,
            filterCooldownMs: 250,
            modeCooldownMs: 1200,
            gestureCooldownMs: 2000,
            fistDistThresholdPx: 85.0,
        };

        // Customizable Portal Style Settings
        this.settings = {
            borderColor: '#00f2fe',
            borderWidth: 3,
            borderStyle: 'plasma', // 'plasma', 'solid', 'dots', 'double'
            showSkeleton: true
        };

        // State
        this.filters = FILTERS_LIST;
        this.activeFilterIdx = 0;
        this.is3DMode = false;
        this.soundEnabled = true;
        this.thereminEnabled = false; // Live Hand Gesture Theremin Synth
        this.showWatermark = true;     // Cyber Watermark Timestamp Stamp
        this.facingMode = 'user';     // 'user' (selfie) or 'environment' (rear camera)
        this.isMirrored = true;       // Selfie Mirror Toggle
        this.isFrozen = false;         // Freeze / Pause Frame Toggle
        this.showFaceMask = true;      // AI Face Mesh Cyber Hologram Mask Toggle (ON BY DEFAULT)
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

        // Theremin Web Audio Synthesizer State
        this.thereminOsc = null;
        this.thereminGain = null;

        // In-App Media Gallery State
        this.galleryItems = [];

        this.lastFilterSwitchTime = 0;
        this.lastModeToggleTime = 0;
        this.lastGestureTime = 0;

        // FPS calculation
        this.fps = 60;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;

        // Store latest hand & face results for continuous rendering
        this.latestResults = null;
        this.latestFaceResults = null;

        // Web Audio Context
        this.audioCtx = null;

        // MediaPipe Instances
        this.hands = null;
        this.faceMesh = null;

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
        this.filtersSelect = document.getElementById('filterSelect');
        
        this.timerOverlay = document.getElementById('timerOverlay');
        this.timerNumber = document.getElementById('timerNumber');
        this.galleryCountBadge = document.getElementById('galleryCountBadge');
        this.hudTheremin = document.getElementById('hudTheremin');

        this.renderFilterDropdown();

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
        document.getElementById('btnMask').addEventListener('click', () => this.toggleFaceMask());
        document.getElementById('btnTheremin').addEventListener('click', () => this.toggleTheremin());
        document.getElementById('btnStamp').addEventListener('click', () => this.toggleWatermarkStamp());
        document.getElementById('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('btnSound').addEventListener('click', () => this.toggleSound());

        const btnDraw = document.getElementById('btnDraw');
        if (btnDraw) btnDraw.addEventListener('click', () => this.toggleAirDrawing());

        const btnEraser = document.getElementById('btnEraser');
        if (btnEraser) btnEraser.addEventListener('click', () => this.toggleEraser());

        const btnClearDraw = document.getElementById('btnClearDraw');
        if (btnClearDraw) btnClearDraw.addEventListener('click', () => this.clearAirDrawing());

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

        const selectBorderStyle = document.getElementById('selectBorderStyle');
        selectBorderStyle.addEventListener('change', (e) => {
            this.settings.borderStyle = e.target.value;
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
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            const key = e.key.toLowerCase();
            if (key === 'n') this.cycleFilter(1);
            else if (key === 'p') this.cycleFilter(-1);
            else if (key === 'c') this.toggleMode();
            else if (key === 'r') this.toggleRecording();
            else if (key === 's') this.handleSnapshotTrigger();
            else if (key === 'm') this.toggleFaceMask();
            else if (key === 't') this.toggleTheremin();
            else if (key === 'd') this.toggleAirDrawing();
            else if (key === 'e') this.toggleEraser();
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

        if (this.drawingCanvas) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.drawingCanvas.width || w;
            tempCanvas.height = this.drawingCanvas.height || h;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.drawingCanvas, 0, 0);

            this.drawingCanvas.width = w;
            this.drawingCanvas.height = h;
            this.drawingCtx.drawImage(tempCanvas, 0, 0, w, h);
        }
    }

    renderFilterDropdown() {
        if (!this.filtersSelect) return;
        this.filtersSelect.innerHTML = '';
        this.filters.forEach((filter, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.textContent = `[${filter.code}] ${filter.name}`;
            if (idx === this.activeFilterIdx) option.selected = true;
            this.filtersSelect.appendChild(option);
        });

        if (!this.filtersSelectBound) {
            this.filtersSelect.addEventListener('change', (e) => {
                this.activeFilterIdx = parseInt(e.target.value, 10);
                this.updateFilterUI();
                this.playSound('filter');
            });
            this.filtersSelectBound = true;
        }
    }

    updateFilterUI() {
        const filter = this.currentFilter;
        this.hudFilter.innerHTML = `<span class="dot-indicator cyan"></span><span>FILTER // ${filter.name.toUpperCase()}</span>`;
        
        if (this.filtersSelect && parseInt(this.filtersSelect.value, 10) !== this.activeFilterIdx) {
            this.filtersSelect.value = this.activeFilterIdx;
        }
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

    toggleFaceMask() {
        this.showFaceMask = !this.showFaceMask;
        const maskBtnText = document.getElementById('maskBtnText');
        if (maskBtnText) {
            maskBtnText.innerText = `MASK: ${this.showFaceMask ? 'ON' : 'OFF'}`;
        }
        this.playSound('mode');
    }

    toggleTheremin() {
        this.thereminEnabled = !this.thereminEnabled;
        const thereminBtnText = document.getElementById('thereminBtnText');
        if (thereminBtnText) {
            thereminBtnText.innerText = `SYNTH: ${this.thereminEnabled ? 'ON' : 'OFF'}`;
        }
        if (this.hudTheremin) {
            this.hudTheremin.style.display = this.thereminEnabled ? 'inline-block' : 'none';
        }

        if (!this.thereminEnabled && this.thereminOsc) {
            try {
                this.thereminOsc.stop();
                this.thereminOsc.disconnect();
                this.thereminOsc = null;
            } catch (e) {}
        }
        this.playSound('mode');
    }

    toggleWatermarkStamp() {
        this.showWatermark = !this.showWatermark;
        const stampBtnText = document.getElementById('stampBtnText');
        if (stampBtnText) {
            stampBtnText.innerText = `STAMP: ${this.showWatermark ? 'ON' : 'OFF'}`;
        }
        this.playSound('filter');
    }

    toggleAirDrawing() {
        this.isAirDrawing = !this.isAirDrawing;
        this.lastDrawPt = null;
        const drawBtnText = document.getElementById('drawBtnText');
        if (drawBtnText) {
            drawBtnText.innerText = `DRAW: ${this.isAirDrawing ? 'ON' : 'OFF'}`;
        }
        this.playSound(this.isAirDrawing ? 'mode' : 'beep');
        if (this.isAirDrawing) {
            this.gestureHint.innerText = 'AIR-DRAWING ACTIVE // EXTEND FINGER TO DRAW IN AIR';
        }
    }

    clearAirDrawing() {
        if (this.drawingCtx) {
            this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
        }
        this.lastDrawPt = null;
        this.playSound('beep');
    }

    toggleEraser() {
        this.isEraser = !this.isEraser;
        const eraserBtnText = document.getElementById('eraserBtnText');
        if (eraserBtnText) {
            eraserBtnText.innerText = `ERASER: ${this.isEraser ? 'ON' : 'OFF'}`;
        }
        if (this.isEraser) {
            this.isAirDrawing = true;
            const drawBtnText = document.getElementById('drawBtnText');
            if (drawBtnText) drawBtnText.innerText = 'DRAW: ON';
            this.gestureHint.innerText = 'AIR-ERASER ACTIVE // MOVE FINGER TO ERASE DRAWING';
        } else {
            this.gestureHint.innerText = 'AIR-DRAWING ACTIVE // EXTEND FINGER TO DRAW IN AIR';
        }
        this.playSound(this.isEraser ? 'mode' : 'beep');
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

    updateThereminPitch(handNormalizedY) {
        if (!this.thereminEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        const freq = Math.round(200 + (1.0 - Math.min(1.0, Math.max(0.0, handNormalizedY))) * 800);

        if (!this.thereminOsc) {
            this.thereminOsc = this.audioCtx.createOscillator();
            this.thereminGain = this.audioCtx.createGain();
            this.thereminOsc.type = 'sine';
            this.thereminOsc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
            this.thereminGain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
            this.thereminOsc.connect(this.thereminGain);
            this.thereminGain.connect(this.audioCtx.destination);
            this.thereminOsc.start();
        } else {
            this.thereminOsc.frequency.setTargetAtTime(freq, this.audioCtx.currentTime, 0.05);
        }

        if (this.hudTheremin) {
            this.hudTheremin.innerText = `THEREMIN: ${freq}Hz`;
        }
    }

    initMediaPipe() {
        if (!window.Hands) {
            console.error('MediaPipe Hands library not loaded');
            this.showError('Unable to load MediaPipe AI Vision module. Please verify network connection.');
            return;
        }

        // Initialize Hands Tracker
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

        // Initialize Face Mesh Tracker for AI Hologram Mask
        if (window.FaceMesh) {
            this.faceMesh = new window.FaceMesh({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            this.faceMesh.onResults((results) => {
                this.latestFaceResults = results;
            });
        }

        this.startCamera();
    }

    async startCamera() {
        try {
            if (this.btnStartCamera) this.btnStartCamera.style.display = 'none';

            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
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

            // Set canvas dimensions to 1:1 match physical video stream dimensions
            const rawVw = this.video.videoWidth || 640;
            const rawVh = this.video.videoHeight || 480;

            this.updateCanvasDimensions(rawVw, rawVh);

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
            const rawVw = this.video.videoWidth || w;
            const rawVh = this.video.videoHeight || h;

            if (rawVw !== w || rawVh !== h) {
                this.updateCanvasDimensions(rawVw, rawVh);
            }

            this.ctx.save();
            if (this.isMirrored && this.facingMode === 'user') {
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(this.video, -rawVw, 0, rawVw, rawVh);
            } else {
                this.ctx.scale(1, 1);
                this.ctx.drawImage(this.video, 0, 0, rawVw, rawVh);
            }
            this.ctx.restore();

            // Render AI Cyber Hologram Mask if enabled
            if (this.showFaceMask) {
                this.renderFaceHologramMask(rawVw, rawVh);
            }

            // Render Hand Portal Filters
            this.renderLandmarksAndPortal(rawVw, rawVh);

            // Composite Air-Drawing Overlay Canvas Layer
            if (this.drawingCanvas) {
                this.ctx.drawImage(this.drawingCanvas, 0, 0);
            }

            // Render Cyber Watermark Timestamp Stamp
            if (this.showWatermark) {
                this.renderWatermarkStamp(rawVw, rawVh);
            }

            this.aiFrameSkip++;
            if (!this.isProcessing) {
                this.isProcessing = true;
                try {
                    if (this.hands) await this.hands.send({ image: this.video });
                    if (this.showFaceMask && this.faceMesh) await this.faceMesh.send({ image: this.video });
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

    renderWatermarkStamp(w, h) {
        this.ctx.save();
        const dateStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const text = `RETROLENS PRO // ${dateStr} // CYBER VISION`;

        this.ctx.font = '10px "JetBrains Mono", monospace';
        const textWidth = this.ctx.measureText(text).width;

        const x = w - textWidth - 16;
        const y = h - 16;

        this.ctx.fillStyle = 'rgba(7, 10, 18, 0.75)';
        this.ctx.fillRect(x - 8, y - 12, textWidth + 16, 18);
        this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x - 8, y - 12, textWidth + 16, 18);

        this.ctx.fillStyle = '#00f2fe';
        this.ctx.shadowColor = '#00f2fe';
        this.ctx.shadowBlur = 6;
        this.ctx.fillText(text, x, y);
        this.ctx.restore();
    }

    renderFaceHologramMask(w, h) {
        const results = this.latestFaceResults;
        if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

        const landmarks = results.multiFaceLandmarks[0];
        const isSelfie = (this.isMirrored && this.facingMode === 'user');

        const getPt = (idx) => [
            isSelfie ? (1.0 - landmarks[idx].x) * w : landmarks[idx].x * w,
            landmarks[idx].y * h
        ];

        this.ctx.save();

        // 1. Cyber Goggles / Visor (Eyebrow & Bridge Contour)
        const visorIndices = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 168, 6, 197, 195, 5];
        this.ctx.beginPath();
        const p0 = getPt(visorIndices[0]);
        this.ctx.moveTo(p0[0], p0[1]);
        for (let i = 1; i < visorIndices.length; i++) {
            const p = getPt(visorIndices[i]);
            this.ctx.lineTo(p[0], p[1]);
        }
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#00f2fe';
        this.ctx.shadowColor = '#00f2fe';
        this.ctx.shadowBlur = 12;
        this.ctx.stroke();

        // 2. Left & Right Eye Cyber Targets
        const leftEyeIndices = [33, 133, 159, 145];
        const rightEyeIndices = [362, 263, 386, 374];

        for (const eyeSet of [leftEyeIndices, rightEyeIndices]) {
            this.ctx.beginPath();
            const ep0 = getPt(eyeSet[0]);
            this.ctx.moveTo(ep0[0], ep0[1]);
            for (let i = 1; i < eyeSet.length; i++) {
                const ep = getPt(eyeSet[i]);
                this.ctx.lineTo(ep[0], ep[1]);
            }
            this.ctx.closePath();
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeStyle = '#ec4899';
            this.ctx.shadowColor = '#ec4899';
            this.ctx.shadowBlur = 10;
            this.ctx.stroke();
        }

        // 3. Forehead Reticle Target Lock
        const forehead = getPt(10);
        this.ctx.beginPath();
        this.ctx.arc(forehead[0], forehead[1] - 15, 14, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 1.5;
        this.ctx.shadowColor = '#f59e0b';
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();

        // Crosshair ticks
        this.ctx.beginPath();
        this.ctx.moveTo(forehead[0] - 20, forehead[1] - 15);
        this.ctx.lineTo(forehead[0] - 10, forehead[1] - 15);
        this.ctx.moveTo(forehead[0] + 10, forehead[1] - 15);
        this.ctx.lineTo(forehead[0] + 20, forehead[1] - 15);
        this.ctx.moveTo(forehead[0], forehead[1] - 35);
        this.ctx.lineTo(forehead[0], forehead[1] - 25);
        this.ctx.moveTo(forehead[0], forehead[1] - 5);
        this.ctx.lineTo(forehead[0], forehead[1] + 5);
        this.ctx.stroke();

        // Hologram HUD Text
        this.ctx.font = '10px "JetBrains Mono", monospace';
        this.ctx.fillStyle = '#00f2fe';
        this.ctx.shadowBlur = 8;
        this.ctx.fillText('[ TARGET LOCKED ]', forehead[0] - 45, forehead[1] - 38);

        this.ctx.restore();
    }

    renderLandmarksAndPortal(w, h) {
        const results = this.latestResults;
        if (!results) return;

        const allHandTips = [];
        let fistCount = 0;
        let isTwoFingersDetected = false;

        const currentTime = performance.now();
        const isSelfie = (this.isMirrored && this.facingMode === 'user');

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (const landmarks of results.multiHandLandmarks) {
                if (this.settings.showSkeleton) {
                    this.drawHandSkeleton(landmarks, w, h, isSelfie);
                }

                // Update Theremin Synthesizer Pitch from Hand Height
                if (this.thereminEnabled && landmarks[8]) {
                    this.updateThereminPitch(landmarks[8].y);
                }

                // Air Drawing Pen & Eraser Trail Tracking (Index Fingertip #8)
                if (this.isAirDrawing && landmarks[8]) {
                    const pt8 = [isSelfie ? (1.0 - landmarks[8].x) * w : landmarks[8].x * w, landmarks[8].y * h];

                    if (this.isEraser) {
                        // Air Eraser Mode: Erase drawing buffer at index fingertip
                        if (this.drawingCtx) {
                            this.drawingCtx.save();
                            this.drawingCtx.globalCompositeOperation = 'destination-out';
                            this.drawingCtx.beginPath();
                            this.drawingCtx.arc(pt8[0], pt8[1], 28, 0, Math.PI * 2);
                            this.drawingCtx.fill();
                            this.drawingCtx.restore();
                        }

                        // Red Glowing Eraser Cursor Circle
                        this.ctx.save();
                        this.ctx.beginPath();
                        this.ctx.arc(pt8[0], pt8[1], 28, 0, Math.PI * 2);
                        this.ctx.strokeStyle = '#ef4444';
                        this.ctx.lineWidth = 2.5;
                        this.ctx.shadowColor = '#ef4444';
                        this.ctx.shadowBlur = 14;
                        this.ctx.stroke();
                        this.ctx.restore();
                    } else {
                        // Air Pen Mode: Draw glowing cyan stroke
                        if (this.lastDrawPt && this.drawingCtx) {
                            this.drawingCtx.save();
                            this.drawingCtx.beginPath();
                            this.drawingCtx.moveTo(this.lastDrawPt[0], this.lastDrawPt[1]);
                            this.drawingCtx.lineTo(pt8[0], pt8[1]);
                            this.drawingCtx.lineWidth = 6;
                            this.drawingCtx.lineCap = 'round';
                            this.drawingCtx.lineJoin = 'round';
                            this.drawingCtx.strokeStyle = '#00f2fe';
                            this.drawingCtx.shadowColor = '#00f2fe';
                            this.drawingCtx.shadowBlur = 14;
                            this.drawingCtx.stroke();
                            this.drawingCtx.restore();
                        }
                        this.lastDrawPt = pt8;

                        // Glowing Cyan Air Nib Cursor Indicator
                        this.ctx.save();
                        this.ctx.beginPath();
                        this.ctx.arc(pt8[0], pt8[1], 7, 0, Math.PI * 2);
                        this.ctx.fillStyle = '#00f2fe';
                        this.ctx.shadowColor = '#00f2fe';
                        this.ctx.shadowBlur = 16;
                        this.ctx.fill();
                        this.ctx.restore();
                    }
                }

                // Check 2-Finger Gesture -> Fullscreen Blur Effect
                if (GeometryUtils.isTwoFingers(landmarks)) {
                    isTwoFingersDetected = true;
                }

                // 1:1 Direct Aspect Landmark Coordinate Mapping
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

            // 2-Finger Gesture: Fullscreen Blur Effect across the entire camera view
            if (isTwoFingersDetected) {
                const fullImageData = this.ctx.getImageData(0, 0, w, h);
                FilterBank.blur(fullImageData, w, h, 8);
                this.ctx.putImageData(fullImageData, 0, 0);
                this.gestureHint.innerText = '2-FINGER GESTURE // FULLSCREEN BLUR ACTIVE';
            }

            if (fistCount === 2 && (currentTime - this.lastModeToggleTime > this.config.modeCooldownMs)) {
                this.toggleMode();
                this.lastModeToggleTime = currentTime;
                this.gestureHint.innerText = `DUAL FIST // MODE SWITCH (${this.is3DMode ? '3D' : '2D'})`;
            }

            if (!isTwoFingersDetected) {
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
            }

            // Draw Rasengan Energy Orb on top of portal layers ONLY when [RS-16] Rasengan filter is selected
            if (this.currentFilter.id === 'rasengan') {
                for (const landmarks of results.multiHandLandmarks) {
                    this.drawRasenganEnergyOrb(landmarks, w, h, isSelfie);
                }
                this.gestureHint.innerText = 'JUTSU // RASENGAN CHAKRA ACTIVE';
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

        // Render Portal Border FX (Plasma Arcs, Solid, Dotted, Double Ring)
        this.drawPortalBorder(pts);
    }

    drawPortalBorder(pts) {
        this.ctx.save();

        if (this.settings.borderStyle === 'solid') {
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
        } else if (this.settings.borderStyle === 'dots') {
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i][0], pts[i][1]);
            }
            this.ctx.closePath();
            this.ctx.lineWidth = this.settings.borderWidth + 1;
            this.ctx.strokeStyle = this.settings.borderColor;
            this.ctx.setLineDash([8, 8]);
            this.ctx.shadowColor = this.settings.borderColor;
            this.ctx.shadowBlur = 12;
            this.ctx.stroke();
        } else if (this.settings.borderStyle === 'double') {
            // Ring 1
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i][0], pts[i][1]);
            }
            this.ctx.closePath();
            this.ctx.lineWidth = this.settings.borderWidth;
            this.ctx.strokeStyle = this.settings.borderColor;
            this.ctx.shadowColor = this.settings.borderColor;
            this.ctx.shadowBlur = 10;
            this.ctx.stroke();

            // Ring 2 Outer
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0][0] - 6, pts[0][1] - 6);
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i][0] + (i % 2 === 0 ? 6 : -6), pts[i][1] + (i % 2 === 0 ? -6 : 6));
            }
            this.ctx.closePath();
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = '#ec4899';
            this.ctx.shadowColor = '#ec4899';
            this.ctx.shadowBlur = 8;
            this.ctx.stroke();
        } else {
            // Plasma Electric Arcs & Sparks
            this.drawPlasmaElectricBorder(pts);
        }

        this.ctx.restore();
    }

    drawPlasmaElectricBorder(pts) {
        this.ctx.save();

        // 1. Core Glowing Border Stroke
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

        // 2. High-Frequency Plasma Electric Arcs & Sparks
        this.ctx.beginPath();
        this.ctx.lineWidth = 1.8;
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.shadowColor = '#00f2fe';
        this.ctx.shadowBlur = 14;

        for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];

            const dist = GeometryUtils.euclideanDist(p1, p2);
            const steps = Math.max(6, Math.floor(dist / 22));

            let current = [p1[0], p1[1]];
            this.ctx.moveTo(current[0], current[1]);

            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                const targetX = p1[0] + (p2[0] - p1[0]) * t;
                const targetY = p1[1] + (p2[1] - p1[1]) * t;

                const noise = (Math.random() - 0.5) * 12;
                const normalX = -(p2[1] - p1[1]) / (dist || 1);
                const normalY = (p2[0] - p1[0]) / (dist || 1);

                const arcX = targetX + normalX * noise;
                const arcY = targetY + normalY * noise;

                this.ctx.lineTo(arcX, arcY);

                // Random Plasma Spark Particles
                if (Math.random() < 0.28) {
                    this.ctx.save();
                    this.ctx.fillStyle = Math.random() > 0.5 ? '#ec4899' : '#00f2fe';
                    this.ctx.shadowBlur = 10;
                    this.ctx.beginPath();
                    this.ctx.arc(arcX + (Math.random() - 0.5) * 8, arcY + (Math.random() - 0.5) * 8, Math.random() * 2.5 + 1, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.restore();
                }
            }
        }
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
            case 'rasengan':
                return FilterBank.rasengan(imageData, width, height, timeSec);
            default:
                return imageData;
        }
    }

    drawRasenganEnergyOrb(landmarks, w, h, isSelfie) {
        const timeSec = performance.now() / 1000;

        // Compute Palm Center (between wrist landmark 0 and middle MCP landmark 9)
        const p0 = [isSelfie ? (1.0 - landmarks[0].x) * w : landmarks[0].x * w, landmarks[0].y * h];
        const p9 = [isSelfie ? (1.0 - landmarks[9].x) * w : landmarks[9].x * w, landmarks[9].y * h];

        const cx = (p0[0] + p9[0]) / 2;
        const cy = (p0[1] + p9[1]) / 2;
        const handDist = GeometryUtils.euclideanDist(p0, p9);
        const radius = Math.max(32, Math.min(110, handDist * 0.75));

        this.ctx.save();

        // 1. Swirling Outer Blue/Cyan Aura Field
        const auraGrad = this.ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.6);
        auraGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        auraGrad.addColorStop(0.3, 'rgba(0, 242, 254, 0.85)');
        auraGrad.addColorStop(0.7, 'rgba(14, 165, 233, 0.45)');
        auraGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2);
        this.ctx.fillStyle = auraGrad;
        this.ctx.shadowColor = '#00f2fe';
        this.ctx.shadowBlur = 30;
        this.ctx.fill();

        // 2. High-Speed Rotating Chakra Spiral Energy Arcs
        const spiralCount = 8;
        const speed = timeSec * 18.0;

        for (let i = 0; i < spiralCount; i++) {
            const baseAngle = (i * Math.PI * 2) / spiralCount + speed;
            this.ctx.beginPath();
            this.ctx.lineWidth = Math.random() * 2.2 + 1.5;
            this.ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : '#38bdf8';
            this.ctx.shadowColor = '#00f2fe';
            this.ctx.shadowBlur = 15;

            for (let step = 1; step <= 25; step++) {
                const t = step / 25;
                const r = t * radius * 1.25;
                const angle = baseAngle + t * 4.8;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;

                if (step === 1) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
        }

        // 3. Dense Pure White Concentrated Core Sphere
        const coreGrad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.5, '#e0f2fe');
        coreGrad.addColorStop(1, 'rgba(56, 189, 248, 0.85)');

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius * 0.48, 0, Math.PI * 2);
        this.ctx.fillStyle = coreGrad;
        this.ctx.shadowColor = '#ffffff';
        this.ctx.shadowBlur = 25;
        this.ctx.fill();

        // 4. Electric Chakra Plasma Lightning Sparks
        this.ctx.lineWidth = 1.8;
        this.ctx.strokeStyle = '#60a5fa';
        for (let j = 0; j < 4; j++) {
            const boltAngle = Math.random() * Math.PI * 2;
            const boltLen = radius * (1.1 + Math.random() * 0.4);
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            const midX = cx + Math.cos(boltAngle) * (boltLen * 0.5) + (Math.random() - 0.5) * 14;
            const midY = cy + Math.sin(boltAngle) * (boltLen * 0.5) + (Math.random() - 0.5) * 14;
            const endX = cx + Math.cos(boltAngle) * boltLen;
            const endY = cy + Math.sin(boltAngle) * boltLen;
            this.ctx.lineTo(midX, midY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }

        this.ctx.restore();
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
