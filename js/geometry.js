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
     * Sort 4 points into a clean convex quadrilateral (box) with ZERO self-intersecting / crisscross lines.
     * Uses polar angle sorting around the geometric centroid.
     * @param {Array<[number, number]>} pts 
     * @returns {Array<[number, number]>}
     */
    static sortConvexQuad(pts) {
        if (!pts || pts.length !== 4) return pts;
        
        // 1. Calculate centroid center (cx, cy)
        const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;

        // 2. Sort points by angle around the centroid (polar angle sorting)
        return [...pts].sort((a, b) => {
            const angleA = Math.atan2(a[1] - cy, a[0] - cx);
            const angleB = Math.atan2(b[1] - cy, b[0] - cx);
            return angleA - angleB;
        });
    }

    /**
     * Legacy clean quad sort fallback
     */
    static sortQuadClean(pts) {
        return this.sortConvexQuad(pts);
    }

    /**
     * Legacy bowtie sort fallback
     */
    static sortQuadBowtie(pts) {
        return this.sortConvexQuad(pts);
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
