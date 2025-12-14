import { Vector3 } from "./Vector3";
import { Matrix3 } from "./Matrix3";
import { Quaternion } from "./Quaternion";

export class Matrix4 {
    elements: number[];

    constructor() {
        this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }

    set(
        m11: number,
        m12: number,
        m13: number,
        m14: number,
        m21: number,
        m22: number,
        m23: number,
        m24: number,
        m31: number,
        m32: number,
        m33: number,
        m34: number,
        m41: number,
        m42: number,
        m43: number,
        m44: number,
    ) {
        const m = this.elements;

        m[0] = m11;
        m[4] = m12;
        m[8] = m13;
        m[12] = m14;
        m[1] = m21;
        m[5] = m22;
        m[9] = m23;
        m[13] = m24;
        m[2] = m31;
        m[6] = m32;
        m[10] = m33;
        m[14] = m34;
        m[3] = m41;
        m[7] = m42;
        m[11] = m43;
        m[15] = m44;

        return this;
    }

    identity() {
        this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

        return this;
    }

    copy(m: Matrix4) {
        const te = this.elements;
        const me = m.elements;

        te[0] = me[0];
        te[1] = me[1];
        te[2] = me[2];
        te[3] = me[3];
        te[4] = me[4];
        te[5] = me[5];
        te[6] = me[6];
        te[7] = me[7];
        te[8] = me[8];
        te[9] = me[9];
        te[10] = me[10];
        te[11] = me[11];
        te[12] = me[12];
        te[13] = me[13];
        te[14] = me[14];
        te[15] = me[15];

        return this;
    }

    multiply(m: Matrix4) {
        return this.multiplyMatrices(this, m);
    }

    premultiply(m: Matrix4) {
        return this.multiplyMatrices(m, this);
    }

    multiplyMatrices(a: Matrix4, b: Matrix4) {
        const ae = a.elements;
        const be = b.elements;
        const m = this.elements;

        const a11 = ae[0],
            a12 = ae[4],
            a13 = ae[8],
            a14 = ae[12];
        const a21 = ae[1],
            a22 = ae[5],
            a23 = ae[9],
            a24 = ae[13];
        const a31 = ae[2],
            a32 = ae[6],
            a33 = ae[10],
            a34 = ae[14];
        const a41 = ae[3],
            a42 = ae[7],
            a43 = ae[11],
            a44 = ae[15];

        const b11 = be[0],
            b12 = be[4],
            b13 = be[8],
            b14 = be[12];
        const b21 = be[1],
            b22 = be[5],
            b23 = be[9],
            b24 = be[13];
        const b31 = be[2],
            b32 = be[6],
            b33 = be[10],
            b34 = be[14];
        const b41 = be[3],
            b42 = be[7],
            b43 = be[11],
            b44 = be[15];

        m[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
        m[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
        m[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
        m[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

        m[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
        m[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
        m[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
        m[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

        m[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
        m[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
        m[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
        m[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

        m[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
        m[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
        m[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
        m[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

        return this;
    }

    multiplyScalar(s: number) {
        const m = this.elements;

        m[0] *= s;
        m[4] *= s;
        m[8] *= s;
        m[12] *= s;
        m[1] *= s;
        m[5] *= s;
        m[9] *= s;
        m[13] *= s;
        m[2] *= s;
        m[6] *= s;
        m[10] *= s;
        m[14] *= s;
        m[3] *= s;
        m[7] *= s;
        m[11] *= s;
        m[15] *= s;

        return this;
    }

    determinant() {
        const m = this.elements;

        const m11 = m[0],
            m12 = m[4],
            m13 = m[8],
            m14 = m[12];
        const m21 = m[1],
            m22 = m[5],
            m23 = m[9],
            m24 = m[13];
        const m31 = m[2],
            m32 = m[6],
            m33 = m[10],
            m34 = m[14];
        const m41 = m[3],
            m42 = m[7],
            m43 = m[11],
            m44 = m[15];

        return (
            m41 *
                (+m14 * m23 * m32 -
                    m13 * m24 * m32 -
                    m14 * m22 * m33 +
                    m12 * m24 * m33 +
                    m13 * m22 * m34 -
                    m12 * m23 * m34) +
            m42 *
                (+m11 * m23 * m34 -
                    m11 * m24 * m33 +
                    m14 * m21 * m33 -
                    m13 * m21 * m34 +
                    m13 * m24 * m31 -
                    m14 * m23 * m31) +
            m43 *
                (+m11 * m24 * m32 -
                    m11 * m22 * m34 -
                    m14 * m21 * m32 +
                    m12 * m21 * m34 +
                    m14 * m22 * m31 -
                    m12 * m24 * m31) +
            m44 *
                (-m13 * m22 * m31 -
                    m11 * m23 * m32 +
                    m11 * m22 * m33 +
                    m13 * m21 * m32 -
                    m12 * m21 * m33 +
                    m12 * m23 * m31)
        );
    }

    invert() {
        const m = this.elements,
            m11 = m[0],
            m21 = m[1],
            m31 = m[2],
            m41 = m[3],
            m12 = m[4],
            m22 = m[5],
            m32 = m[6],
            m42 = m[7],
            m13 = m[8],
            m23 = m[9],
            m33 = m[10],
            m43 = m[11],
            m14 = m[12],
            m24 = m[13],
            m34 = m[14],
            m44 = m[15],
            t11 =
                m23 * m34 * m42 -
                m24 * m33 * m42 +
                m24 * m32 * m43 -
                m22 * m34 * m43 -
                m23 * m32 * m44 +
                m22 * m33 * m44,
            t12 =
                m14 * m33 * m42 -
                m13 * m34 * m42 -
                m14 * m32 * m43 +
                m12 * m34 * m43 +
                m13 * m32 * m44 -
                m12 * m33 * m44,
            t13 =
                m13 * m24 * m42 -
                m14 * m23 * m42 +
                m14 * m22 * m43 -
                m12 * m24 * m43 -
                m13 * m22 * m44 +
                m12 * m23 * m44,
            t14 =
                m14 * m23 * m32 -
                m13 * m24 * m32 -
                m14 * m22 * m33 +
                m12 * m24 * m33 +
                m13 * m22 * m34 -
                m12 * m23 * m34;

        const det = m11 * t11 + m21 * t12 + m31 * t13 + m41 * t14;

        if (det === 0)
            return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

        const detInv = 1 / det;

        m[0] = t11 * detInv;
        m[1] =
            (m24 * m33 * m41 -
                m23 * m34 * m41 -
                m24 * m31 * m43 +
                m21 * m34 * m43 +
                m23 * m31 * m44 -
                m21 * m33 * m44) *
            detInv;
        m[2] =
            (m22 * m34 * m41 -
                m24 * m32 * m41 +
                m24 * m31 * m42 -
                m21 * m34 * m42 -
                m22 * m31 * m44 +
                m21 * m32 * m44) *
            detInv;
        m[3] =
            (m23 * m32 * m41 -
                m22 * m33 * m41 -
                m23 * m31 * m42 +
                m21 * m33 * m42 +
                m22 * m31 * m43 -
                m21 * m32 * m43) *
            detInv;

        m[4] = t12 * detInv;
        m[5] =
            (m13 * m34 * m41 -
                m14 * m33 * m41 +
                m14 * m31 * m43 -
                m11 * m34 * m43 -
                m13 * m31 * m44 +
                m11 * m33 * m44) *
            detInv;
        m[6] =
            (m14 * m32 * m41 -
                m12 * m34 * m41 -
                m14 * m31 * m42 +
                m11 * m34 * m42 +
                m12 * m31 * m44 -
                m11 * m32 * m44) *
            detInv;
        m[7] =
            (m12 * m33 * m41 -
                m13 * m32 * m41 +
                m13 * m31 * m42 -
                m11 * m33 * m42 -
                m12 * m31 * m43 +
                m11 * m32 * m43) *
            detInv;

        m[8] = t13 * detInv;
        m[9] =
            (m14 * m23 * m41 -
                m13 * m24 * m41 -
                m14 * m21 * m43 +
                m11 * m24 * m43 +
                m13 * m21 * m44 -
                m11 * m23 * m44) *
            detInv;
        m[10] =
            (m12 * m24 * m41 -
                m14 * m22 * m41 +
                m14 * m21 * m42 -
                m11 * m24 * m42 -
                m12 * m21 * m44 +
                m11 * m22 * m44) *
            detInv;
        m[11] =
            (m13 * m22 * m41 -
                m12 * m23 * m41 -
                m13 * m21 * m42 +
                m11 * m23 * m42 +
                m12 * m21 * m43 -
                m11 * m22 * m43) *
            detInv;

        m[12] = t14 * detInv;
        m[13] =
            (m13 * m24 * m31 -
                m14 * m23 * m31 +
                m14 * m21 * m33 -
                m11 * m24 * m33 -
                m13 * m21 * m34 +
                m11 * m23 * m34) *
            detInv;
        m[14] =
            (m14 * m22 * m31 -
                m12 * m24 * m31 -
                m14 * m21 * m32 +
                m11 * m24 * m32 +
                m12 * m21 * m34 -
                m11 * m22 * m34) *
            detInv;
        m[15] =
            (m12 * m23 * m31 -
                m13 * m22 * m31 +
                m13 * m21 * m32 -
                m11 * m23 * m32 -
                m12 * m21 * m33 +
                m11 * m22 * m33) *
            detInv;

        return this;
    }

    transpose() {
        const m = this.elements;
        let tmp;

        tmp = m[1];
        m[1] = m[4];
        m[4] = tmp;
        tmp = m[2];
        m[2] = m[8];
        m[8] = tmp;
        tmp = m[6];
        m[6] = m[9];
        m[9] = tmp;

        tmp = m[3];
        m[3] = m[12];
        m[12] = tmp;
        tmp = m[7];
        m[7] = m[13];
        m[13] = tmp;
        tmp = m[11];
        m[11] = m[14];
        m[14] = tmp;

        return this;
    }

    setPosition(position: Vector3) {
        const m = this.elements;

        m[12] = position.x;
        m[13] = position.y;
        m[14] = position.z;

        return this;
    }

    scalePosition(scale: Vector3) {
        const m = this.elements;

        m[12] *= scale.x;
        m[13] *= scale.y;
        m[14] *= scale.z;

        return this;
    }

    setRotation(rotation: Matrix3) {
        const m = this.elements;
        const r = rotation.elements;

        m[0] = r[0];
        m[1] = r[1];
        m[2] = r[2];

        m[4] = r[3];
        m[5] = r[4];
        m[6] = r[5];

        m[8] = r[6];
        m[9] = r[7];
        m[10] = r[8];

        return this;
    }

    extractPosition() {
        const m = this.elements;
        return new Vector3(m[12], m[13], m[14]);
    }

    extractRotation() {
        const m = this.elements;
        return new Matrix3().set(
            m[0],
            m[4],
            m[8],
            m[1],
            m[5],
            m[9],
            m[2],
            m[6],
            m[10],
        );
    }

    lookAt(eye: Vector3, target: Vector3, up: Vector3) {
        const m = this.elements;

        const z = eye.clone().sub(target);
        if (z.length() === 0) {
            // eye and target are in the same position
            z.z = 1;
        }
        z.normalize();

        let x = up.clone().cross(z);
        if (x.length() === 0) {
            // up and z are parallel
            if (Math.abs(up.z) === 1) {
                z.x += 0.0001;
            } else {
                z.z += 0.0001;
            }

            z.normalize();
            x = up.clone().cross(z);
        }
        x.normalize();

        const y = z.clone().cross(x);

        m[0] = x.x;
        m[4] = y.x;
        m[8] = z.x;
        m[1] = x.y;
        m[5] = y.y;
        m[9] = z.y;
        m[2] = x.z;
        m[6] = y.z;
        m[10] = z.z;

        return this;
    }

    fromArray(array: number[]) {
        for (let i = 0; i < 16; i++) {
            this.elements[i] = array[i];
        }

        return this;
    }

    toArray() {
        const array = [];
        const m = this.elements;

        array[0] = m[0];
        array[1] = m[1];
        array[2] = m[2];
        array[3] = m[3];
        array[4] = m[4];
        array[5] = m[5];
        array[6] = m[6];
        array[7] = m[7];
        array[8] = m[8];
        array[9] = m[9];
        array[10] = m[10];
        array[11] = m[11];
        array[12] = m[12];
        array[13] = m[13];
        array[14] = m[14];
        array[15] = m[15];

        return array;
    }

    clone() {
        return new Matrix4().fromArray(this.elements);
    }

    lerp(other: Matrix4, coef: number) {
        // Clamp coefficient
        coef = Math.max(0, Math.min(1, coef));

        // Extract rotations and positions
        const thisRot = new Quaternion().setFromRotationMatrix(
            this.extractRotation(),
        );
        const otherRot = new Quaternion().setFromRotationMatrix(
            this.extractRotation(),
        );
        const thisPos = this.extractPosition();
        const otherPos = other.extractPosition();

        // Interpolate rotation and position
        const interpolatedRot = thisRot.slerp(otherRot, coef);
        const interpolatedPos = thisPos.lerp(otherPos, coef);
        const interpolatedRotMat = new Matrix3().makeRotationFromQuaternion(
            interpolatedRot,
        );

        const m = this.clone();
        m.setRotation(interpolatedRotMat);
        m.setPosition(interpolatedPos);

        return m;
    }

    compose(position: Vector3, quaternion: Quaternion, scale: Vector3) {
        const te = this.elements;

        const x = quaternion.x,
            y = quaternion.y,
            z = quaternion.z,
            w = quaternion.w;
        const x2 = x + x,
            y2 = y + y,
            z2 = z + z;
        const xx = x * x2,
            xy = x * y2,
            xz = x * z2;
        const yy = y * y2,
            yz = y * z2,
            zz = z * z2;
        const wx = w * x2,
            wy = w * y2,
            wz = w * z2;

        const sx = scale.x,
            sy = scale.y,
            sz = scale.z;

        te[0] = (1 - (yy + zz)) * sx;
        te[1] = (xy + wz) * sx;
        te[2] = (xz - wy) * sx;
        te[3] = 0;

        te[4] = (xy - wz) * sy;
        te[5] = (1 - (xx + zz)) * sy;
        te[6] = (yz + wx) * sy;
        te[7] = 0;

        te[8] = (xz + wy) * sz;
        te[9] = (yz - wx) * sz;
        te[10] = (1 - (xx + yy)) * sz;
        te[11] = 0;

        te[12] = position.x;
        te[13] = position.y;
        te[14] = position.z;
        te[15] = 1;

        return this;
    }

    decompose(position: Vector3, quaternion: Quaternion, scale: Vector3) {
        const te = this.elements;

        let sx = new Vector3(te[0], te[1], te[2]).length();
        const sy = new Vector3(te[4], te[5], te[6]).length();
        const sz = new Vector3(te[8], te[9], te[10]).length();

        // if determine is negative, we need to invert one scale
        const det = this.determinant();
        if (det < 0) sx = -sx;

        position.x = te[12];
        position.y = te[13];
        position.z = te[14];

        // scale
        scale.x = sx;
        scale.y = sy;
        scale.z = sz;

        // rotation
        const invSX = 1 / sx;
        const invSY = 1 / sy;
        const invSZ = 1 / sz;

        const m = new Matrix4();
        m.copy(this);
        const me = m.elements;

        me[0] *= invSX;
        me[1] *= invSX;
        me[2] *= invSX;
        me[4] *= invSY;
        me[5] *= invSY;
        me[6] *= invSY;
        me[8] *= invSZ;
        me[9] *= invSZ;
        me[10] *= invSZ;

        quaternion.setFromRotationMatrix(m.extractRotation());

        return this;
    }

    perspective(fov: number, aspect: number, near: number, far: number) {
        const f = 1.0 / Math.tan(fov / 2);
        const nf = 1 / (near - far);

        this.elements[0] = f / aspect;
        this.elements[1] = 0;
        this.elements[2] = 0;
        this.elements[3] = 0;
        this.elements[4] = 0;
        this.elements[5] = f;
        this.elements[6] = 0;
        this.elements[7] = 0;
        this.elements[8] = 0;
        this.elements[9] = 0;
        this.elements[10] = far * nf;
        this.elements[11] = -1;
        this.elements[12] = 0;
        this.elements[13] = 0;
        this.elements[14] = far * near * nf;
        this.elements[15] = 0;

        return this;
    }

    orthographic(
        left: number,
        right: number,
        bottom: number,
        top: number,
        near: number,
        far: number,
    ) {
        const w = 1.0 / (right - left);
        const h = 1.0 / (top - bottom);
        const p = 1.0 / (far - near);

        const x = (right + left) * w;
        const y = (top + bottom) * h;
        const z = near * p;

        this.elements[0] = 2 * w;
        this.elements[1] = 0;
        this.elements[2] = 0;
        this.elements[3] = 0;
        this.elements[4] = 0;
        this.elements[5] = 2 * h;
        this.elements[6] = 0;
        this.elements[7] = 0;
        this.elements[8] = 0;
        this.elements[9] = 0;
        this.elements[10] = -1 * p;
        this.elements[11] = 0;
        this.elements[12] = -x;
        this.elements[13] = -y;
        this.elements[14] = -z;
        this.elements[15] = 1;

        return this;
    }
}
