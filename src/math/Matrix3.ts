import type { Euler } from "./Euler";
import type { Quaternion } from "./Quaternion";

export class Matrix3 {
	elements: number[];

	constructor() {
		this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];
	}

	set(
		m11: number,
		m12: number,
		m13: number,
		m21: number,
		m22: number,
		m23: number,
		m31: number,
		m32: number,
		m33: number,
	) {
		const m = this.elements;

		m[0] = m11;
		m[1] = m21;
		m[2] = m31;
		m[3] = m12;
		m[4] = m22;
		m[5] = m32;
		m[6] = m13;
		m[7] = m23;
		m[8] = m33;

		return this;
	}

	identity() {
		this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
		return this;
	}

	multiply(m: Matrix3) {
		return this.multiplyMatrices(this, m);
	}

	premultiply(m: Matrix3) {
		return this.multiplyMatrices(m, this);
	}

	multiplyMatrices(a: Matrix3, b: Matrix3) {
		const ae = a.elements;
		const be = b.elements;
		const m = this.elements;

		const a11 = ae[0],
			a12 = ae[3],
			a13 = ae[6];
		const a21 = ae[1],
			a22 = ae[4],
			a23 = ae[7];
		const a31 = ae[2],
			a32 = ae[5],
			a33 = ae[8];

		const b11 = be[0],
			b12 = be[3],
			b13 = be[6];
		const b21 = be[1],
			b22 = be[4],
			b23 = be[7];
		const b31 = be[2],
			b32 = be[5],
			b33 = be[8];

		m[0] = a11 * b11 + a12 * b21 + a13 * b31;
		m[3] = a11 * b12 + a12 * b22 + a13 * b32;
		m[6] = a11 * b13 + a12 * b23 + a13 * b33;

		m[1] = a21 * b11 + a22 * b21 + a23 * b31;
		m[4] = a21 * b12 + a22 * b22 + a23 * b32;
		m[7] = a21 * b13 + a22 * b23 + a23 * b33;

		m[2] = a31 * b11 + a32 * b21 + a33 * b31;
		m[5] = a31 * b12 + a32 * b22 + a33 * b32;
		m[8] = a31 * b13 + a32 * b23 + a33 * b33;

		return this;
	}

	multiplyScalar(s: number) {
		const m = this.elements;

		m[0] *= s;
		m[3] *= s;
		m[6] *= s;
		m[1] *= s;
		m[4] *= s;
		m[7] *= s;
		m[2] *= s;
		m[5] *= s;
		m[8] *= s;

		return this;
	}

	determinant() {
		const m = this.elements;

		const a = m[0],
			b = m[1],
			c = m[2],
			d = m[3],
			e = m[4],
			f = m[5],
			g = m[6],
			h = m[7],
			i = m[8];

		return (
			a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g
		);
	}

	invert() {
		const m = this.elements,
			m11 = m[0],
			m21 = m[1],
			m31 = m[2],
			m12 = m[3],
			m22 = m[4],
			m32 = m[5],
			m13 = m[6],
			m23 = m[7],
			m33 = m[8],
			t11 = m33 * m22 - m32 * m23,
			t12 = m32 * m13 - m33 * m12,
			t13 = m23 * m12 - m22 * m13,
			det = m11 * t11 + m21 * t12 + m31 * t13;

		if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);

		const detInv = 1 / det;

		m[0] = t11 * detInv;
		m[1] = (m31 * m23 - m33 * m21) * detInv;
		m[2] = (m32 * m21 - m31 * m22) * detInv;

		m[3] = t12 * detInv;
		m[4] = (m33 * m11 - m31 * m13) * detInv;
		m[5] = (m31 * m12 - m32 * m11) * detInv;

		m[6] = t13 * detInv;
		m[7] = (m21 * m13 - m23 * m11) * detInv;
		m[8] = (m22 * m11 - m21 * m12) * detInv;

		return this;
	}

	transpose() {
		let tmp: number;
		const m = this.elements;

		tmp = m[1];
		m[1] = m[3];
		m[3] = tmp;
		tmp = m[2];
		m[2] = m[6];
		m[6] = tmp;
		tmp = m[5];
		m[5] = m[7];
		m[7] = tmp;

		return this;
	}

	makeRotationFromEuler(euler: Euler) {
		const m = this.elements;

		const x = euler.x,
			y = euler.y,
			z = euler.z;
		const a = Math.cos(x),
			b = Math.sin(x);
		const c = Math.cos(y),
			d = Math.sin(y);
		const e = Math.cos(z),
			f = Math.sin(z);

		switch (euler.order) {
			case "XYZ": {
				const ae = a * e,
					af = a * f,
					be = b * e,
					bf = b * f;

				m[0] = c * e;
				m[3] = -c * f;
				m[6] = d;

				m[1] = af + be * d;
				m[4] = ae - bf * d;
				m[7] = -b * c;

				m[2] = bf - ae * d;
				m[5] = be + af * d;
				m[8] = a * c;

				break;
			}

			case "YXZ": {
				const ce = c * e,
					cf = c * f,
					de = d * e,
					df = d * f;

				m[0] = ce + df * b;
				m[3] = de * b - cf;
				m[6] = a * d;

				m[1] = a * f;
				m[4] = a * e;
				m[7] = -b;

				m[2] = cf * b - de;
				m[5] = df + ce * b;
				m[8] = a * c;

				break;
			}

			case "ZXY": {
				const ce = c * e,
					cf = c * f,
					de = d * e,
					df = d * f;

				m[0] = ce - df * b;
				m[3] = -a * f;
				m[6] = de + cf * b;

				m[1] = cf + de * b;
				m[4] = a * e;
				m[7] = df - ce * b;

				m[2] = -a * d;
				m[5] = b;
				m[8] = a * c;

				break;
			}

			case "ZYX": {
				const ae = a * e,
					af = a * f,
					be = b * e,
					bf = b * f;

				m[0] = c * e;
				m[3] = be * d - af;
				m[6] = ae * d + bf;

				m[1] = c * f;
				m[4] = bf * d + ae;
				m[7] = af * d - be;

				m[2] = -d;
				m[5] = b * c;
				m[8] = a * c;

				break;
			}

			case "YZX": {
				const ac = a * c,
					ad = a * d,
					bc = b * c,
					bd = b * d;

				m[0] = c * e;
				m[3] = bd - ac * f;
				m[6] = bc * f + ad;

				m[1] = f;
				m[4] = a * e;
				m[7] = -b * e;

				m[2] = -d * e;
				m[5] = ad * f + bc;
				m[8] = ac - bd * f;

				break;
			}

			case "XZY": {
				const ac = a * c,
					ad = a * d,
					bc = b * c,
					bd = b * d;

				m[0] = c * e;
				m[3] = -f;
				m[6] = d * e;

				m[1] = ac * f + bd;
				m[4] = a * e;
				m[7] = ad * f - bc;

				m[2] = bc * f - ad;
				m[5] = b * e;
				m[8] = bd * f + ac;

				break;
			}
		}

		return this;
	}

	makeRotationFromQuaternion(quaternion: Quaternion) {
		const m = this.elements;

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

		m[0] = 1 - (yy + zz);
		m[1] = xy + wz;
		m[2] = xz - wy;

		m[3] = xy - wz;
		m[4] = 1 - (xx + zz);
		m[5] = yz + wx;

		m[6] = xz + wy;
		m[7] = yz - wx;
		m[8] = 1 - (xx + yy);

		return this;
	}

	fromArray(array: number[]) {
		for (let i = 0; i < 9; i++) {
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

		return array;
	}

	clone() {
		return new Matrix3().fromArray(this.elements);
	}
}
