import { Matrix4 } from "../../math";
import { Object3D } from "../object/Object3D";

export class Camera extends Object3D {
  public projectionMatrix: Matrix4 = new Matrix4();
  public viewMatrix: Matrix4 = new Matrix4();
  public viewProjectionMatrix: Matrix4 = new Matrix4();
  public frustumPlanes: Float32Array = new Float32Array(24); // 6 planes × 4 floats

  updateWorldMatrix(parentWorldMatrix?: Matrix4) {
    super.updateWorldMatrix(parentWorldMatrix);
    this.viewMatrix.copy(this.worldMatrix).invert();
    this.updateViewProjectionMatrix();
  }

  updateProjectionMatrix() {
    this.updateViewProjectionMatrix();
  }

  private updateViewProjectionMatrix() {
    this.viewProjectionMatrix.multiplyMatrices(
      this.projectionMatrix,
      this.viewMatrix
    );
    this.extractFrustumPlanes();
  }

  private extractFrustumPlanes() {
    const m = this.viewProjectionMatrix.elements;
    const planes = this.frustumPlanes;

    // Left plane: row3 + row0
    planes[0] = m[3] + m[0];
    planes[1] = m[7] + m[4];
    planes[2] = m[11] + m[8];
    planes[3] = m[15] + m[12];
    this.normalizePlane(planes, 0);

    // Right plane: row3 - row0
    planes[4] = m[3] - m[0];
    planes[5] = m[7] - m[4];
    planes[6] = m[11] - m[8];
    planes[7] = m[15] - m[12];
    this.normalizePlane(planes, 4);

    // Bottom plane: row3 + row1
    planes[8] = m[3] + m[1];
    planes[9] = m[7] + m[5];
    planes[10] = m[11] + m[9];
    planes[11] = m[15] + m[13];
    this.normalizePlane(planes, 8);

    // Top plane: row3 - row1
    planes[12] = m[3] - m[1];
    planes[13] = m[7] - m[5];
    planes[14] = m[11] - m[9];
    planes[15] = m[15] - m[13];
    this.normalizePlane(planes, 12);

    // Near plane: row2
    planes[16] = m[2];
    planes[17] = m[6];
    planes[18] = m[10];
    planes[19] = m[14];
    this.normalizePlane(planes, 16);

    // Far plane: row3 - row2
    planes[20] = m[3] - m[2];
    planes[21] = m[7] - m[6];
    planes[22] = m[11] - m[10];
    planes[23] = m[15] - m[14];
    this.normalizePlane(planes, 20);
  }

  private normalizePlane(planes: Float32Array, offset: number) {
    const length = Math.sqrt(
      planes[offset] ** 2 + planes[offset + 1] ** 2 + planes[offset + 2] ** 2
    );
    if (length > 0) {
      planes[offset] /= length;
      planes[offset + 1] /= length;
      planes[offset + 2] /= length;
      planes[offset + 3] /= length;
    }
  }
}
