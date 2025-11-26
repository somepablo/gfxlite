import { Geometry } from "../core/Geometry";

export class BoxGeometry extends Geometry {
    constructor({ width = 1, height = 1, depth = 1 } = {}) {
        const w = width / 2;
        const h = height / 2;
        const d = depth / 2;

        // 8 vertices of the box
        const vertices = new Float32Array([
            //-z
            -w,
            -h,
            -d, // 0
            w,
            -h,
            -d, // 1
            w,
            h,
            -d, // 2
            -w,
            h,
            -d, // 3
            //+z
            -w,
            -h,
            d, // 4
            w,
            -h,
            d, // 5
            w,
            h,
            d, // 6
            -w,
            h,
            d, // 7
        ]);

        // 36 indices for 12 triangles (2 per face)
        const indices = new Uint32Array([
            // front
            0, 1, 2, 2, 3, 0,
            // right
            1, 5, 6, 6, 2, 1,
            // back
            5, 4, 7, 7, 6, 5,
            // left
            4, 0, 3, 3, 7, 4,
            // top
            3, 2, 6, 6, 7, 3,
            // bottom
            4, 5, 1, 1, 0, 4,
        ]);

        super(vertices, indices);
    }
}
