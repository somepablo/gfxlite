export class Vector2 {
	x: number;
	y: number;

	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	add(v: Vector2) {
		this.x += v.x;
		this.y += v.y;
		return this;
	}

	addScalar(s: number) {
		this.x += s;
		this.y += s;
		return this;
	}

	sub(v: Vector2) {
		this.x -= v.x;
		this.y -= v.y;
		return this;
	}

	subScalar(s: number) {
		this.x -= s;
		this.y -= s;
		return this;
	}

	multiply(v: Vector2) {
		this.x *= v.x;
		this.y *= v.y;
		return this;
	}

	multiplyScalar(s: number) {
		this.x *= s;
		this.y *= s;
		return this;
	}

	divide(v: Vector2) {
		this.x /= v.x;
		this.y /= v.y;
		return this;
	}

	divideScalar(s: number) {
		this.x /= s;
		this.y /= s;
		return this;
	}

	dot(v: Vector2) {
		return this.x * v.x + this.y * v.y;
	}

	cross(v: Vector2) {
		return this.x * v.y - this.y * v.x;
	}

	clone() {
		return new Vector2(this.x, this.y);
	}
}
