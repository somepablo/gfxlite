import { Geometry } from "../core/Geometry";

export class PlaneGeometry extends Geometry {
    constructor({
        width = 1,
        height = 1,
        widthSegments = 1,
        heightSegments = 1,
    } = {}) {
        const vertices: number[] = [];
        const indices: number[] = [];

        const widthHalf = width / 2;
        const heightHalf = height / 2;

        const gridX = widthSegments;
        const gridY = heightSegments;

        const segmentWidth = width / gridX;
        const segmentHeight = height / gridY;

        // Generate vertices
        for (let iy = 0; iy <= gridY; iy++) {
            const y = iy * segmentHeight - heightHalf;

            for (let ix = 0; ix <= gridX; ix++) {
                const x = ix * segmentWidth - widthHalf;

                vertices.push(x, y, 0);
            }
        }

        // Generate indices
        for (let iy = 0; iy < gridY; iy++) {
            for (let ix = 0; ix < gridX; ix++) {
                const a = ix + (gridX + 1) * iy;
                const b = ix + (gridX + 1) * (iy + 1);
                const c = ix + 1 + (gridX + 1) * (iy + 1);
                const d = ix + 1 + (gridX + 1) * iy;

                // Two triangles per quad
                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        super(new Float32Array(vertices), new Uint32Array(indices));
    }
}
