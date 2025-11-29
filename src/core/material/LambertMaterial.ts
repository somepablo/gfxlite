import { Vector3 } from "../../math";
import { Material } from "./Material";

export interface LambertMaterialOptions {
    color?: Vector3;
}

export class LambertMaterial extends Material {
    constructor({ color = new Vector3(1, 1, 1) }: LambertMaterialOptions = {}) {
        super();
        this.uniforms.color = color;
    }

    getUniformBufferData(): Float32Array {
        const color = this.uniforms.color as Vector3;
        return new Float32Array([...color.toArray(), 0]); // Color + padding
    }

    getVertexShader(): string {
        return /* wgsl */ `
      struct Uniforms {
        mvpMatrix : mat4x4<f32>,
        modelMatrix : mat4x4<f32>,
        normalMatrix : mat4x4<f32>,
        cameraPosition : vec3<f32>,
      };
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;

      struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) vPosition : vec3<f32>,
        @location(1) vNormal : vec3<f32>,
      };

      @vertex
      fn main(@location(0) position : vec3<f32>, @location(1) normal : vec3<f32>) -> VertexOutput {
        var output : VertexOutput;
        output.position = uniforms.mvpMatrix * vec4<f32>(position, 1.0);
        output.vPosition = (uniforms.modelMatrix * vec4<f32>(position, 1.0)).xyz;
        output.vNormal = normalize((uniforms.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
        return output;
      }
    `;
    }

    getFragmentShader(): string {
        return /* wgsl */ `
      struct MaterialUniforms {
        color : vec3<f32>,
      };
      @group(1) @binding(0) var<uniform> material : MaterialUniforms;

      struct Light {
        direction : vec3<f32>,
        intensity : f32,
        color : vec3<f32>,
      };
      struct LightUniforms {
        ambientColor : vec3<f32>,
        lightCount : u32,
        lights : array<Light, 1>,
      };
      @group(2) @binding(0) var<uniform> lighting : LightUniforms;

      @fragment
      fn main(@location(0) vPosition : vec3<f32>, @location(1) vNormal : vec3<f32>) -> @location(0) vec4<f32> {
        let normal = normalize(vNormal);
        
        // Ambient
        let ambient = lighting.ambientColor * material.color;

        // Diffuse
        var diffuse = vec3<f32>(0.0);
        for (var i = 0u; i < lighting.lightCount; i++) {
            let light = lighting.lights[i];
            let lightDir = normalize(-light.direction);
            let diff = max(dot(normal, lightDir), 0.0);
            diffuse += diff * light.color * light.intensity * material.color;
        }

        return vec4<f32>(ambient + diffuse, 1.0);
      }
    `;
    }
}
