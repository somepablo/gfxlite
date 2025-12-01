import { Vector3 } from "./Vector3";
import { Matrix4 } from "./Matrix4";

export class Box3 {
    min: Vector3;
    max: Vector3;

    constructor(min?: Vector3, max?: Vector3) {
        this.min = min ? min.clone() : new Vector3(Infinity, Infinity, Infinity);
        this.max = max ? max.clone() : new Vector3(-Infinity, -Infinity, -Infinity);
    }

    set(min: Vector3, max: Vector3): this {
        this.min.copy(min);
        this.max.copy(max);
        return this;
    }

    setFromPoints(points: Vector3[]): this {
        this.makeEmpty();

        for (const point of points) {
            this.expandByPoint(point);
        }

        return this;
    }

    setFromBufferAttribute(attribute: Float32Array): this {
        this.makeEmpty();

        if (attribute.length === 0) return this;

        for (let i = 0; i < attribute.length; i += 3) {
            const x = attribute[i];
            const y = attribute[i + 1];
            const z = attribute[i + 2];

            if (x < this.min.x) this.min.x = x;
            if (y < this.min.y) this.min.y = y;
            if (z < this.min.z) this.min.z = z;

            if (x > this.max.x) this.max.x = x;
            if (y > this.max.y) this.max.y = y;
            if (z > this.max.z) this.max.z = z;
        }

        return this;
    }

    clone(): Box3 {
        return new Box3().copy(this);
    }

    copy(box: Box3): this {
        this.min.copy(box.min);
        this.max.copy(box.max);
        return this;
    }

    makeEmpty(): this {
        this.min.x = this.min.y = this.min.z = Infinity;
        this.max.x = this.max.y = this.max.z = -Infinity;
        return this;
    }

    isEmpty(): boolean {
        return (
            this.max.x < this.min.x ||
            this.max.y < this.min.y ||
            this.max.z < this.min.z
        );
    }

    expandByPoint(point: Vector3): this {
        this.min.min(point);
        this.max.max(point);
        return this;
    }

    expandByScalar(scalar: number): this {
        this.min.addScalar(-scalar);
        this.max.addScalar(scalar);
        return this;
    }

    expandByObject(_object: any): this {
        // Placeholder for recursive expansion if needed, 
        // but typically we compute geometry bbox and transform it.
        return this;
    }

    union(box: Box3): this {
        this.min.min(box.min);
        this.max.max(box.max);
        return this;
    }

    applyMatrix4(matrix: Matrix4): this {
        if (this.isEmpty()) return this;

        const points = [
            new Vector3(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix),
            new Vector3(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix),
            new Vector3(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix),
            new Vector3(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix),
            new Vector3(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix),
            new Vector3(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix),
            new Vector3(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix),
            new Vector3(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix),
        ];

        this.setFromPoints(points);

        return this;
    }

    getCenter(target: Vector3): Vector3 {
        return target.addVectors(this.min, this.max).multiplyScalar(0.5);
    }
    
    getSize(target: Vector3): Vector3 {
        return target.subVectors(this.max, this.min);
    }
}
