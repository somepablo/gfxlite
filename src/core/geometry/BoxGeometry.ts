import { Geometry } from "../geometry/Geometry";

export class BoxGeometry extends Geometry {
    constructor({ width = 1, height = 1, depth = 1 } = {}) {
        const w = width / 2;
        const h = height / 2;
        const d = depth / 2;

        const vertexCount = 24;
        const indexCount = 36;

        const vertices = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const indices = new Uint32Array(indexCount);

        let vOffset = 0;
        let iOffset = 0;
        let vertexIndex = 0;

        const addFace = (
            v0: number[], v1: number[], v2: number[], v3: number[],
            normal: number[]
        ) => {
            vertices.set(v0, vOffset);
            vertices.set(v1, vOffset + 3);
            vertices.set(v2, vOffset + 6);
            vertices.set(v3, vOffset + 9);
            vOffset += 12;

            for (let i = 0; i < 4; i++) normals.set(normal, (vertexIndex + i) * 3);

            indices.set([
                vertexIndex, vertexIndex + 1, vertexIndex + 2,
                vertexIndex + 2, vertexIndex + 3, vertexIndex
            ], iOffset);
            iOffset += 6;

            vertexIndex += 4;
        };

        // Front face (-Z)
        addFace(
            [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
            [0, 0, -1]
        );

        // Back face (+Z)
        addFace(
            [w, -h, d], [-w, -h, d], [-w, h, d], [w, h, d],
            [0, 0, 1]
        );

        // Right face (+X)
        addFace(
            [w, -h, -d], [w, -h, d], [w, h, d], [w, h, -d],
            [1, 0, 0]
        );

        // Left face (-X)
        addFace(
            [-w, -h, d], [-w, -h, -d], [-w, h, -d], [-w, h, d],
            [-1, 0, 0]
        );

        // Top face (+Y)
        addFace(
            [-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d],
            [0, 1, 0]
        );

        // Bottom face (-Y)
        addFace(
            [-w, -h, d], [w, -h, d], [w, -h, -d], [-w, -h, -d],
            [0, -1, 0]
        );

        super(vertices, indices, normals);
    }
}
