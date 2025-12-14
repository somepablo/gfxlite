import { Euler } from "./Euler";
import type { Matrix3 } from "./Matrix3";
import type { Vector3 } from "./Vector3";

export class Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;

    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    set(x: number, y: number, z: number, w: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        return this;
    }

    copy(q: Quaternion) {
        this.x = q.x;
        this.y = q.y;
        this.z = q.z;
        this.w = q.w;
        return this;
    }

    setFromEuler(euler: Euler) {
        const x = euler.x,
            y = euler.y,
            z = euler.z,
            order = euler.order;

        const cos = Math.cos;
        const sin = Math.sin;

        const c1 = cos(x / 2);
        const c2 = cos(y / 2);
        const c3 = cos(z / 2);

        const s1 = sin(x / 2);
        const s2 = sin(y / 2);
        const s3 = sin(z / 2);

        switch (order) {
            case "XYZ":
                this.x = s1 * c2 * c3 + c1 * s2 * s3;
                this.y = c1 * s2 * c3 - s1 * c2 * s3;
                this.z = c1 * c2 * s3 + s1 * s2 * c3;
                this.w = c1 * c2 * c3 - s1 * s2 * s3;
                break;

            case "YXZ":
                this.x = s1 * c2 * c3 + c1 * s2 * s3;
                this.y = c1 * s2 * c3 - s1 * c2 * s3;
                this.z = c1 * c2 * s3 - s1 * s2 * c3;
                this.w = c1 * c2 * c3 + s1 * s2 * s3;
                break;

            case "ZXY":
                this.x = s1 * c2 * c3 - c1 * s2 * s3;
                this.y = c1 * s2 * c3 + s1 * c2 * s3;
                this.z = c1 * c2 * s3 + s1 * s2 * c3;
                this.w = c1 * c2 * c3 - s1 * s2 * s3;
                break;

            case "ZYX":
                this.x = s1 * c2 * c3 - c1 * s2 * s3;
                this.y = c1 * s2 * c3 + s1 * c2 * s3;
                this.z = c1 * c2 * s3 - s1 * s2 * c3;
                this.w = c1 * c2 * c3 + s1 * s2 * s3;
                break;

            case "YZX":
                this.x = s1 * c2 * c3 + c1 * s2 * s3;
                this.y = c1 * s2 * c3 + s1 * c2 * s3;
                this.z = c1 * c2 * s3 - s1 * s2 * c3;
                this.w = c1 * c2 * c3 - s1 * s2 * s3;
                break;

            case "XZY":
                this.x = s1 * c2 * c3 - c1 * s2 * s3;
                this.y = c1 * s2 * c3 - s1 * c2 * s3;
                this.z = c1 * c2 * s3 + s1 * s2 * c3;
                this.w = c1 * c2 * c3 + s1 * s2 * s3;
                break;
        }

        return this;
    }

    setFromAxisAngle(axis: Vector3, angle: number) {
        const halfAngle = angle / 2,
            s = Math.sin(halfAngle);

        this.x = axis.x * s;
        this.y = axis.y * s;
        this.z = axis.z * s;
        this.w = Math.cos(halfAngle);

        return this;
    }

    setFromRotationMatrix(m: Matrix3) {
        const e = m.elements,
            m11 = e[0],
            m12 = e[3],
            m13 = e[6],
            m21 = e[1],
            m22 = e[4],
            m23 = e[7],
            m31 = e[2],
            m32 = e[5],
            m33 = e[8],
            trace = m11 + m22 + m33;

        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1.0);

            this.w = 0.25 / s;
            this.x = (m32 - m23) * s;
            this.y = (m13 - m31) * s;
            this.z = (m21 - m12) * s;
        } else if (m11 > m22 && m11 > m33) {
            const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);

            this.w = (m32 - m23) / s;
            this.x = 0.25 * s;
            this.y = (m12 + m21) / s;
            this.z = (m13 + m31) / s;
        } else if (m22 > m33) {
            const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);

            this.w = (m13 - m31) / s;
            this.x = (m12 + m21) / s;
            this.y = 0.25 * s;
            this.z = (m23 + m32) / s;
        } else {
            const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);

            this.w = (m21 - m12) / s;
            this.x = (m13 + m31) / s;
            this.y = (m23 + m32) / s;
            this.z = 0.25 * s;
        }

        return this;
    }

    multiply(q: Quaternion) {
        return this.multiplyQuaternions(this, q);
    }

    premultiply(q: Quaternion) {
        return this.multiplyQuaternions(q, this);
    }

    multiplyQuaternions(a: Quaternion, b: Quaternion) {
        const qax = a.x,
            qay = a.y,
            qaz = a.z,
            qaw = a.w;
        const qbx = b.x,
            qby = b.y,
            qbz = b.z,
            qbw = b.w;

        this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
        this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
        this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
        this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

        return this;
    }

    dot(q: Quaternion) {
        return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
    }

    clone() {
        return new Quaternion(this.x, this.y, this.z, this.w);
    }

    slerp(other: Quaternion, coef: number) {
        // Clamp coef between 0 and 1
        coef = Math.max(0, Math.min(1, coef));

        // Compute the dot product (cosine of the angle between the quaternions)
        let dot =
            this.x * other.x +
            this.y * other.y +
            this.z * other.z +
            this.w * other.w;

        // If the dot product is negative, negate one quaternion to take the shorter path
        if (dot < 0) {
            other = new Quaternion(-other.x, -other.y, -other.z, -other.w);
            dot = -dot;
        }

        const DOT_THRESHOLD = 0.9995; // Threshold to decide if we should use linear interpolation

        // If the quaternions are close, use linear interpolation to avoid numerical issues
        if (dot > DOT_THRESHOLD) {
            const result = new Quaternion(
                this.x + coef * (other.x - this.x),
                this.y + coef * (other.y - this.y),
                this.z + coef * (other.z - this.z),
                this.w + coef * (other.w - this.w),
            );
            // Normalize the result quaternion
            return result.normalize();
        }

        // Calculate the angle between the quaternions
        const theta_0 = Math.acos(dot); // Angle between this and other
        const theta = theta_0 * coef; // Scaled angle

        // Compute the quaternion orthogonal to `this`
        const sin_theta = Math.sin(theta);
        const sin_theta_0 = Math.sin(theta_0);

        const s0 = Math.cos(theta) - (dot * sin_theta) / sin_theta_0; // Coefficient for this quaternion
        const s1 = sin_theta / sin_theta_0; // Coefficient for other quaternion

        // Return the interpolated quaternion
        return new Quaternion(
            s0 * this.x + s1 * other.x,
            s0 * this.y + s1 * other.y,
            s0 * this.z + s1 * other.z,
            s0 * this.w + s1 * other.w,
        );
    }

    normalize() {
        const length = Math.sqrt(
            this.x * this.x +
                this.y * this.y +
                this.z * this.z +
                this.w * this.w,
        );
        if (length === 0) return new Quaternion(0, 0, 0, 1);
        return new Quaternion(
            this.x / length,
            this.y / length,
            this.z / length,
            this.w / length,
        );
    }
}
