/**
 * RetroLens - High-Performance Filter & Shader Engine (16 Shaders)
 */

let grayBuffer = new Uint8Array(960 * 540);
let invBlurBuffer = new Uint8Array(960 * 540);
let tempBlurBuffer = new Uint8Array(960 * 540);
let copyBuffer = new Uint8ClampedArray(960 * 540 * 4);

function ensureBuffers(size, totalPixels) {
    if (grayBuffer.length < totalPixels) {
        grayBuffer = new Uint8Array(totalPixels);
        invBlurBuffer = new Uint8Array(totalPixels);
        tempBlurBuffer = new Uint8Array(totalPixels);
    }
    if (copyBuffer.length < size) {
        copyBuffer = new Uint8ClampedArray(size);
    }
}

const JET_LUT = new Uint8ClampedArray(256 * 3);
(function initJetLUT() {
    for (let i = 0; i < 256; i++) {
        const v = i / 255;
        const r = Math.min(Math.max(1.5 - Math.abs(4 * v - 3), 0), 1);
        const g = Math.min(Math.max(1.5 - Math.abs(4 * v - 2), 0), 1);
        const b = Math.min(Math.max(1.5 - Math.abs(4 * v - 1), 0), 1);
        JET_LUT[i * 3] = Math.round(r * 255);
        JET_LUT[i * 3 + 1] = Math.round(g * 255);
        JET_LUT[i * 3 + 2] = Math.round(b * 255);
    }
})();

function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

export class FilterBank {
    static dualTone(imageData) {
        const d = imageData.data;
        const len = d.length;
        for (let i = 0; i < len; i += 4) {
            const gray = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
            if (gray >= 110) {
                d[i] = 255;
                d[i + 1] = 140;
                d[i + 2] = 10;
            } else {
                d[i] = 220;
                d[i + 1] = 30;
                d[i + 2] = 180;
            }
        }
        return imageData;
    }

    static thermal(imageData) {
        const d = imageData.data;
        const len = d.length;
        for (let i = 0; i < len; i += 4) {
            const gray = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
            const lutIdx = gray * 3;
            d[i] = JET_LUT[lutIdx];
            d[i + 1] = JET_LUT[lutIdx + 1];
            d[i + 2] = JET_LUT[lutIdx + 2];
        }
        return imageData;
    }

    static sketch(imageData, width, height) {
        const d = imageData.data;
        const totalPixels = width * height;
        ensureBuffers(d.length, totalPixels);

        for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
            grayBuffer[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        }

        const radius = 3;
        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x++) {
                let sum = 0, count = 0;
                for (let k = -radius; k <= radius; k++) {
                    const nx = Math.min(Math.max(x + k, 0), width - 1);
                    sum += 255 - grayBuffer[rowOffset + nx];
                    count++;
                }
                tempBlurBuffer[rowOffset + x] = (sum / count) | 0;
            }
        }

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                let sum = 0, count = 0;
                for (let k = -radius; k <= radius; k++) {
                    const ny = Math.min(Math.max(y + k, 0), height - 1);
                    sum += tempBlurBuffer[ny * width + x];
                    count++;
                }
                invBlurBuffer[y * width + x] = (sum / count) | 0;
            }
        }

        for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
            const g = grayBuffer[p];
            const ib = invBlurBuffer[p];
            const val = ib === 255 ? 255 : Math.min(255, (g << 8) / (255 - ib + 1)) | 0;
            d[i] = val;
            d[i + 1] = val;
            d[i + 2] = val;
        }

        return imageData;
    }

    static pixelate(imageData, width, height, blockSize = 14) {
        const d = imageData.data;
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                const sampleX = Math.min(x + (blockSize >> 1), width - 1);
                const sampleY = Math.min(y + (blockSize >> 1), height - 1);
                const sampleIdx = (sampleY * width + sampleX) * 4;
                const r = d[sampleIdx];
                const g = d[sampleIdx + 1];
                const b = d[sampleIdx + 2];

                const maxY = Math.min(y + blockSize, height);
                const maxX = Math.min(x + blockSize, width);

                for (let by = y; by < maxY; by++) {
                    const rowOffset = by * width;
                    for (let bx = x; bx < maxX; bx++) {
                        const idx = (rowOffset + bx) * 4;
                        d[idx] = r;
                        d[idx + 1] = g;
                        d[idx + 2] = b;
                    }
                }
            }
        }
        return imageData;
    }

    static glitch(imageData, width, height) {
        const d = imageData.data;
        const totalPixels = width * height;
        const len = d.length;
        ensureBuffers(len, totalPixels);

        copyBuffer.set(d);
        const shift = Math.floor(Math.random() * 6) + 3;

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x++) {
                const targetIdx = (rowOffset + x) * 4;
                
                const rx = (x + shift) % width;
                const rIdx = (rowOffset + rx) * 4;
                d[targetIdx] = copyBuffer[rIdx];

                const bx = (x - shift + width) % width;
                const bIdx = (rowOffset + bx) * 4;
                d[targetIdx + 2] = copyBuffer[bIdx + 2];
            }
        }

        const numLines = 2;
        for (let i = 0; i < numLines; i++) {
            const lineY = Math.floor(Math.random() * height);
            const rowOffset = lineY * width;
            for (let x = 0; x < width; x++) {
                const idx = (rowOffset + x) * 4;
                d[idx] = Math.random() * 255;
                d[idx + 1] = Math.random() * 255;
                d[idx + 2] = Math.random() * 255;
            }
        }

        return imageData;
    }

    static sepia(imageData) {
        const d = imageData.data;
        const len = d.length;
        for (let i = 0; i < len; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            d[i] = Math.min(255, (r * 0.393 + g * 0.769 + b * 0.189)) | 0;
            d[i + 1] = Math.min(255, (r * 0.349 + g * 0.686 + b * 0.168)) | 0;
            d[i + 2] = Math.min(255, (r * 0.272 + g * 0.534 + b * 0.131)) | 0;
        }
        return imageData;
    }

    static invert(imageData) {
        const d = imageData.data;
        const len = d.length;
        for (let i = 0; i < len; i += 4) {
            d[i] = 255 - d[i];
            d[i + 1] = 255 - d[i + 1];
            d[i + 2] = 255 - d[i + 2];
        }
        return imageData;
    }

    static redChannel(imageData) {
        const d = imageData.data;
        const len = d.length;
        for (let i = 0; i < len; i += 4) {
            d[i + 1] = 0;
            d[i + 2] = 0;
        }
        return imageData;
    }

    static edge(imageData, width, height) {
        const d = imageData.data;
        const totalPixels = width * height;
        ensureBuffers(d.length, totalPixels);

        for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
            grayBuffer[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        }

        for (let y = 1; y < height - 1; y += 2) {
            const rowPrev = (y - 1) * width;
            const rowCurr = y * width;
            const rowNext = (y + 1) * width;

            for (let x = 1; x < width - 1; x += 2) {
                const gx = 
                    -grayBuffer[rowPrev + x - 1] + grayBuffer[rowPrev + x + 1]
                    -2 * grayBuffer[rowCurr + x - 1] + 2 * grayBuffer[rowCurr + x + 1]
                    -grayBuffer[rowNext + x - 1] + grayBuffer[rowNext + x + 1];

                const gy = 
                    -grayBuffer[rowPrev + x - 1] - 2 * grayBuffer[rowPrev + x] - grayBuffer[rowPrev + x + 1]
                    +grayBuffer[rowNext + x - 1] + 2 * grayBuffer[rowNext + x] + grayBuffer[rowNext + x + 1];

                const mag = Math.min(255, Math.hypot(gx, gy)) | 0;
                const idx = (rowCurr + x) * 4;

                if (mag > 40) {
                    d[idx] = mag;
                    d[idx + 1] = 255;
                    d[idx + 2] = 255 - mag;
                } else {
                    d[idx] = 0;
                    d[idx + 1] = 0;
                    d[idx + 2] = 0;
                }
            }
        }

        return imageData;
    }

    static blur(imageData, width, height, radius = 4) {
        const d = imageData.data;
        for (let y = 0; y < height; y += 2) {
            const rowOffset = y * width * 4;
            for (let x = 0; x < width; x += 2) {
                let r = 0, g = 0, b = 0, count = 0;
                for (let k = -radius; k <= radius; k += 2) {
                    const nx = Math.min(Math.max(x + k, 0), width - 1);
                    const idx = rowOffset + nx * 4;
                    r += d[idx];
                    g += d[idx + 1];
                    b += d[idx + 2];
                    count++;
                }
                const target = rowOffset + x * 4;
                d[target] = (r / count) | 0;
                d[target + 1] = (g / count) | 0;
                d[target + 2] = (b / count) | 0;
            }
        }
        return imageData;
    }

    static cartoon(imageData, width, height) {
        const d = imageData.data;
        const totalPixels = width * height;
        ensureBuffers(d.length, totalPixels);

        for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
            grayBuffer[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
            d[i] = (Math.floor(d[i] / 32) * 32 + 16) | 0;
            d[i + 1] = (Math.floor(d[i + 1] / 32) * 32 + 16) | 0;
            d[i + 2] = (Math.floor(d[i + 2] / 32) * 32 + 16) | 0;
        }

        for (let y = 1; y < height - 1; y += 2) {
            const rowPrev = (y - 1) * width;
            const rowCurr = y * width;
            const rowNext = (y + 1) * width;

            for (let x = 1; x < width - 1; x += 2) {
                const gx = -grayBuffer[rowPrev + x - 1] + grayBuffer[rowPrev + x + 1]
                    -2 * grayBuffer[rowCurr + x - 1] + 2 * grayBuffer[rowCurr + x + 1]
                    -grayBuffer[rowNext + x - 1] + grayBuffer[rowNext + x + 1];

                const gy = -grayBuffer[rowPrev + x - 1] - 2 * grayBuffer[rowPrev + x] - grayBuffer[rowPrev + x + 1]
                    +grayBuffer[rowNext + x - 1] + 2 * grayBuffer[rowNext + x] + grayBuffer[rowNext + x + 1];

                if (Math.hypot(gx, gy) > 55) {
                    const idx = (rowCurr + x) * 4;
                    d[idx] = 10;
                    d[idx + 1] = 10;
                    d[idx + 2] = 10;
                }
            }
        }

        return imageData;
    }

    static rainbowWave(imageData, width, height, timeSec) {
        const d = imageData.data;
        const t = timeSec * 5.0;

        for (let y = 0; y < height; y += 2) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x += 2) {
                const idx = (rowOffset + x) * 4;
                const pattern = Math.sin((x + y) * 0.05 + t) * 0.5 + 0.5;
                const hue = pattern * 360;
                const [rr, rg, rb] = hsvToRgb(hue, 1.0, 1.0);

                d[idx] = (d[idx] * 0.3 + rr * 0.7) | 0;
                d[idx + 1] = (d[idx + 1] * 0.3 + rg * 0.7) | 0;
                d[idx + 2] = (d[idx + 2] * 0.3 + rb * 0.7) | 0;
            }
        }

        return imageData;
    }

    static matrixRain(imageData, width, height, timeSec) {
        const d = imageData.data;
        const t = (timeSec * 12) | 0;

        for (let y = 0; y < height; y += 4) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x += 4) {
                const dropY = ((x * 17 + t * 5) % height) | 0;
                const distY = Math.abs(y - dropY);
                const idx = (rowOffset + x) * 4;

                if (distY < 40) {
                    const alpha = 1.0 - (distY / 40);
                    d[idx] = (d[idx] * 0.2) | 0;
                    d[idx + 1] = Math.min(255, (d[idx + 1] * 0.3 + 240 * alpha) | 0);
                    d[idx + 2] = (d[idx + 2] * 0.2) | 0;
                } else {
                    d[idx] = (d[idx] * 0.3) | 0;
                    d[idx + 1] = (d[idx + 1] * 0.6 + 40) | 0;
                    d[idx + 2] = (d[idx + 2] * 0.3) | 0;
                }
            }
        }
        return imageData;
    }

    static cyberScan(imageData, width, height, timeSec) {
        const d = imageData.data;
        const scanY = ((timeSec * 180) % height) | 0;

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            const isScanLine = Math.abs(y - scanY) < 3;
            const isGridY = (y % 16 === 0);

            for (let x = 0; x < width; x++) {
                const idx = (rowOffset + x) * 4;
                const isGridX = (x % 16 === 0);

                if (isScanLine) {
                    d[idx] = 255;
                    d[idx + 1] = 255;
                    d[idx + 2] = 255;
                } else if (isGridX || isGridY) {
                    d[idx] = (d[idx] * 0.4) | 0;
                    d[idx + 1] = Math.min(255, d[idx + 1] + 160);
                    d[idx + 2] = Math.min(255, d[idx + 2] + 200);
                } else {
                    d[idx] = (d[idx] * 0.5) | 0;
                    d[idx + 1] = (d[idx + 1] * 0.8) | 0;
                    d[idx + 2] = Math.min(255, d[idx + 2] + 40);
                }
            }
        }
        return imageData;
    }

    static vhsTape(imageData, width, height, timeSec) {
        const d = imageData.data;
        const totalPixels = width * height;
        ensureBuffers(d.length, totalPixels);
        copyBuffer.set(d);

        const offset = Math.sin(timeSec * 10) > 0.8 ? 8 : 4;

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            const scanlineNoise = (Math.sin(y * 0.8 + timeSec * 20) * 20) | 0;

            for (let x = 0; x < width; x++) {
                const idx = (rowOffset + x) * 4;
                const rx = Math.min(width - 1, x + offset);
                const rIdx = (rowOffset + rx) * 4;

                d[idx] = Math.min(255, Math.max(0, copyBuffer[rIdx] + scanlineNoise));
                d[idx + 1] = copyBuffer[idx + 1];
                d[idx + 2] = copyBuffer[idx + 2];
            }
        }
        return imageData;
    }
}

// Clean, professional filter list with technical codes
export const FILTERS_LIST = [
    { id: "dual-tone", name: "Dual Tone", code: "DT-01", desc: "Cyberpunk Duo Threshold" },
    { id: "thermal", name: "Thermal", code: "TH-02", desc: "JET Spectrum Heatmap" },
    { id: "sketch", name: "Sketch", code: "SK-03", desc: "Pencil Contour Dodge" },
    { id: "pixelate", name: "Pixelate", code: "PX-04", desc: "Mosaic Downsample" },
    { id: "glitch", name: "Glitch", code: "GL-05", desc: "RGB Channel Displacement" },
    { id: "matrix", name: "Matrix", code: "MX-06", desc: "Digital Rain Code Shader" },
    { id: "cyber-scan", name: "Cyber Scan", code: "CS-07", desc: "Holographic Grid Scanline" },
    { id: "vhs-tape", name: "VHS Retro", code: "VH-08", desc: "Tape Chromatic Distortion" },
    { id: "sepia", name: "Sepia 70s", code: "SP-09", desc: "Analog Warm Sepia Tone" },
    { id: "invert", name: "Invert", code: "IV-10", desc: "Inverted Luminance" },
    { id: "red-channel", name: "Red Pass", code: "RP-11", desc: "Monochrome Red Isolator" },
    { id: "edge", name: "Edge Neon", code: "EN-12", desc: "Sobel Vector Gradient" },
    { id: "blur", name: "Gaussian", code: "GB-13", desc: "Convolution Box Blur" },
    { id: "cartoon", name: "Posterize", code: "PR-14", desc: "Quantized Comic Lines" },
    { id: "rainbow-wave", name: "Spectrum", code: "SW-15", desc: "Dynamic Sine HSV Wave" },
];
