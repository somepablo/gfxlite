import { Vector3 } from "../math";
import { Material } from "./Material";

export interface BasicMaterialOptions {
    color?: Vector3;
}

export class BasicMaterial extends Material {
    constructor({ color = new Vector3(1, 1, 1) }: BasicMaterialOptions = {}) {
        super();
        this.uniforms.color = color;
    }

    getUniformBufferData(): Float32Array {
        return new Float32Array((this.uniforms.color as Vector3).toArray());
    }

    getVertexShader(): string {
        return /* wgsl */ `
      @group(0) @binding(0) var<uniform> mvpMatrix : mat4x4<f32>;

      @vertex
      fn main(@location(0) position : vec3<f32>) -> @builtin(position) vec4<f32> {
        return mvpMatrix * vec4<f32>(position, 1.0);
      }
    `;
    }

    getFragmentShader(): string {
        return /* wgsl */ `
      @group(1) @binding(0) var<uniform> color : vec3<f32>;

      @fragment
      fn main() -> @location(0) vec4<f32> {
        return vec4<f32>(color, 1.0);
      }
    `;
    }
}
