let geometryID = 0;

export class Geometry {
    public readonly id = geometryID++;
    public vertices: Float32Array;
    public normals: Float32Array | null = null;
    public indices: Uint32Array | null = null;
    public indexCount: number;

    constructor(vertices: Float32Array, indices?: Uint32Array, normals?: Float32Array) {
        this.vertices = vertices;
        this.normals = normals || null;

        if (indices) {
            this.indices = indices;
            this.indexCount = indices.length;
        } else {
            // Assuming 3 components (x, y, z) per vertex
            this.indexCount = vertices.length / 3;
        }
    }
}
