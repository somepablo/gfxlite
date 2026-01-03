import { clamp } from "./Utils";
import { Matrix3 } from "./Matrix3";
import { Quaternion } from "./Quaternion";

export class Euler {
  x: number;
  y: number;
  z: number;
  order: string;

  constructor(x = 0, y = 0, z = 0, order = "XYZ") {
    this.x = x;
    this.y = y;
    this.z = z;
    this.order = order;
  }

  setFromQuaternion(q: Quaternion, order: string) {
    const m = new Matrix3().makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(m, order);
  }

  setFromRotationMatrix(m: Matrix3, order: string) {
    const te = m.elements;
    const m11 = te[0],
      m12 = te[3],
      m13 = te[6];
    const m21 = te[1],
      m22 = te[4],
      m23 = te[7];
    const m31 = te[2],
      m32 = te[5],
      m33 = te[8];

    order = order || this.order;

    switch (order) {
      case "XYZ":
        this.y = Math.asin(clamp(m13, -1, 1));

        if (Math.abs(m13) < 0.9999999) {
          this.x = Math.atan2(-m23, m33);
          this.z = Math.atan2(-m12, m11);
        } else {
          this.x = Math.atan2(m32, m22);
          this.z = 0;
        }

        break;

      case "YXZ":
        this.x = Math.asin(-clamp(m23, -1, 1));

        if (Math.abs(m23) < 0.9999999) {
          this.y = Math.atan2(m13, m33);
          this.z = Math.atan2(m21, m22);
        } else {
          this.y = Math.atan2(-m31, m11);
          this.z = 0;
        }

        break;

      case "ZXY":
        this.x = Math.asin(clamp(m32, -1, 1));

        if (Math.abs(m32) < 0.9999999) {
          this.y = Math.atan2(-m31, m33);
          this.z = Math.atan2(-m12, m22);
        } else {
          this.y = 0;
          this.z = Math.atan2(m21, m11);
        }

        break;

      case "ZYX":
        this.y = Math.asin(-clamp(m31, -1, 1));

        if (Math.abs(m31) < 0.9999999) {
          this.x = Math.atan2(m32, m33);
          this.z = Math.atan2(m21, m11);
        } else {
          this.x = 0;
          this.z = Math.atan2(-m12, m22);
        }

        break;

      case "YZX":
        this.z = Math.asin(clamp(m21, -1, 1));

        if (Math.abs(m21) < 0.9999999) {
          this.x = Math.atan2(-m23, m22);
          this.y = Math.atan2(-m31, m11);
        } else {
          this.x = 0;
          this.y = Math.atan2(m13, m33);
        }

        break;

      case "XZY":
        this.z = Math.asin(-clamp(m12, -1, 1));

        if (Math.abs(m12) < 0.9999999) {
          this.x = Math.atan2(m32, m22);
          this.y = Math.atan2(m13, m11);
        } else {
          this.x = Math.atan2(-m23, m33);
          this.y = 0;
        }

        break;
    }

    this.order = order;

    return this;
  }

  clone() {
    return new Euler(this.x, this.y, this.z, this.order);
  }
}
