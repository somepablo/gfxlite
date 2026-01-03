let geometryID = 0;

import { Box3 } from "../../math/Box3";

export class Geometry {
  public readonly id = geometryID++;
  public vertices: Float32Array;
  public normals: Float32Array | null = null;
  public uvs: Float32Array | null = null;
  public tangents: Float32Array | null = null;
  public indices: Uint32Array | null = null;
  public indexCount: number;
  public boundingBox: Box3 | null = null;

  /**
   * Version counter that increments when the geometry is invalidated.
   * Used by BatchManager to detect when GPU buffers need re-uploading.
   */
  public version: number = 0;

  constructor(
    vertices: Float32Array,
    indices?: Uint32Array,
    normals?: Float32Array,
    uvs?: Float32Array,
    tangents?: Float32Array,
  ) {
    this.vertices = vertices;
    this.normals = normals || null;
    this.uvs = uvs || null;
    this.tangents = tangents || null;

    if (indices) {
      this.indices = indices;
      this.indexCount = indices.length;
    } else {
      // Assuming 3 components (x, y, z) per vertex
      this.indexCount = vertices.length / 3;
    }
    this.computeBoundingBox();
  }

  computeBoundingBox() {
    if (!this.vertices || this.vertices.length === 0) {
      this.boundingBox = null;
      return;
    }

    this.boundingBox = new Box3();
    this.boundingBox.setFromBufferAttribute(this.vertices);
  }

  /**
   * Called after modifying geometry parameters. Subclasses should override
   * this to rebuild vertex data, then call super.invalidate().
   */
  invalidate(): void {
    this.computeBoundingBox();
    this.version++;
  }

  /**
   * Helper for subclasses to update geometry data and trigger invalidation.
   */
  protected setBuffers(
    vertices: Float32Array,
    indices: Uint32Array,
    normals: Float32Array,
    uvs: Float32Array,
  ): void {
    this.vertices = vertices;
    this.indices = indices;
    this.normals = normals;
    this.uvs = uvs;
    this.indexCount = indices.length;
  }
}
