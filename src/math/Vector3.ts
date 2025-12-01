import type { Quaternion } from "./Quaternion";

export class Vector3 {
    x: number;
    y: number;
    z: number;

    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    copy(v: Vector3) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    add(v: Vector3) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    addScalar(s: number) {
        this.x += s;
        this.y += s;
        this.z += s;
        return this;
    }

    sub(v: Vector3) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }

    subScalar(s: number) {
        this.x -= s;
        this.y -= s;
        this.z -= s;
        return this;
    }

    multiply(v: Vector3) {
        this.x *= v.x;
        this.y *= v.y;
        this.z *= v.z;
        return this;
    }

    multiplyScalar(s: number) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    divide(v: Vector3) {
        this.x /= v.x;
        this.y /= v.y;
        this.z /= v.z;
        return this;
    }

    divideScalar(s: number) {
        this.x /= s;
        this.y /= s;
        this.z /= s;
        return this;
    }

    dot(v: Vector3) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(v: Vector3) {
        const ax = this.x,
            ay = this.y,
            az = this.z;
        const bx = v.x,
            by = v.y,
            bz = v.z;

        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;

        return this;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
        return this.divideScalar(this.length() || 1);
    }

    toArray() {
        const array = [];

        array[0] = this.x;
        array[1] = this.y;
        array[2] = this.z;

        return array;
    }

    clone() {
        return new Vector3(this.x, this.y, this.z);
    }

    lerp(other: Vector3, coef: number) {
        // Clamp coefficient
        coef = Math.max(0, Math.min(1, coef));

        // Linearly interpolate
        return new Vector3(
            this.x * (1 - coef) + other.x * coef,
            this.y * (1 - coef) + other.y * coef,
            this.z * (1 - coef) + other.z * coef,
        );
    }

    distanceTo(v: Vector3) {
        const dx = this.x - v.x,
            dy = this.y - v.y,
            dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    applyQuaternion(q: Quaternion) {
        const x = this.x,
            y = this.y,
            z = this.z;
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w;

        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;

        this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

        return this;
    }
}
