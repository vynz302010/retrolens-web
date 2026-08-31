/**
 * RetroLens - Geometry & Landmark Math Utilities
 */

export class GeometryUtils {
    /**
     * Euclidean distance between two 2D points: [x, y]
     */
    static euclideanDist(p1, p2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        return Math.hypot(dx, dy);
    }

    /**
     * Check if hand is closed into a fist
     * @param {Array<{x: number, y: number, z: number}>} landmarks - MediaPipe 21 landmarks
     * @param {number} w - Canvas width
     * @param {number} h - Canvas height
     * @param {number} threshold - Distance threshold in pixels
     */
    static isFistClosed(landmarks, w, h, threshold = 85.0) {
        if (!landmarks || landmarks.length < 21) return false;
        
        const wrist = [landmarks[0].x * w, landmarks[0].y * h];
        const tipIndices = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky tips
        
        let totalDist = 0;
        for (const idx of tipIndices) {
            const tip = [landmarks[idx].x * w, landmarks[idx].y * h];
            totalDist += this.euclideanDist(tip, wrist);
        }
        
        const meanDist = totalDist / tipIndices.length;
        return meanDist < threshold;
    }

    /**
     * Check if hand is significantly rotated (tilted)
     */
    static isHandRotated(thumb, index) {
        const dx = index[0] - thumb[0];
        const dy = index[1] - thumb[1];
        return dy > 25 || Math.abs(dx) > Math.abs(dy) * 1.1;
    }

    /**
     * Sort 4 points into a convex quadrilateral (clean order: TL, TR, BR, BL)
     * @param {Array<[number, number]>} pts 
     * @returns {Array<[number, number]>}
     */
    static sortQuadClean(pts) {
        if (pts.length !== 4) return pts;
        
        // Sort by X coordinate ascending
        const sortedByX = [...pts].sort((a, b) => a[0] - b[0]);
        const leftTwo = sortedByX.slice(0, 2).sort((a, b) => a[1] - b[1]);
        const rightTwo = sortedByX.slice(2, 4).sort((a, b) => a[1] - b[1]);

        // [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
        return [leftTwo[0], rightTwo[0], rightTwo[1], leftTwo[1]];
    }

    /**
     * Sort 4 points in Bowtie formation for rotated hand poses
     * @param {Array<[number, number]>} pts 
     * @returns {Array<[number, number]>}
     */
    static sortQuadBowtie(pts) {
        if (pts.length !== 4) return pts;
        
        const sortedByX = [...pts].sort((a, b) => a[0] - b[0]);
        const leftTwo = sortedByX.slice(0, 2).sort((a, b) => a[1] - b[1]);
        const rightTwo = sortedByX.slice(2, 4).sort((a, b) => a[1] - b[1]);

        return [leftTwo[0], rightTwo[1], rightTwo[0], leftTwo[1]];
    }

    /**
     * Calculate bounding box for a list of polygon points
     */
    static getBoundingBox(pts, maxWidth, maxHeight) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const [x, y] of pts) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        const x = Math.max(0, Math.floor(minX));
        const y = Math.max(0, Math.floor(minY));
        const w = Math.min(maxWidth - x, Math.ceil(maxX - minX));
        const h = Math.min(maxHeight - y, Math.ceil(maxY - minY));

        return { x, y, w, h };
    }
}
