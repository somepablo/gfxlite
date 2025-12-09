import { Vector3 } from "../../math";
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
      const MAX_CAMERAS: u32 = 5u;

      struct CameraData {
          viewProjection: mat4x4<f32>,
          frustum: array<vec4<f32>, 6>,
      }

      struct CameraUniforms {
          mainViewProjection: mat4x4<f32>,
          cameraPosition: vec3<f32>,
          activeLightCount: u32,
          cameras: array<CameraData, MAX_CAMERAS>,
      }

      struct InstanceData {
          modelMatrix: mat4x4<f32>,
          normalMatrix: mat4x4<f32>,
          flags: vec4<f32>,
      }

      struct CulledInstances {
          indices: array<u32>,
      }

      @group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
      @group(0) @binding(1) var<storage, read> culled: CulledInstances;
      @group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

      @vertex
      fn main(
          @builtin(instance_index) instanceIndex: u32,
          @location(0) position: vec3<f32>
      ) -> @builtin(position) vec4<f32> {
          let actualIndex = culled.indices[instanceIndex];
          let worldPos = instances[actualIndex].modelMatrix * vec4<f32>(position, 1.0);
          return cameraUniforms.mainViewProjection * worldPos;
      }
    `;
    }

    getFragmentShader(): string {
        return /* wgsl */ `
      @group(1) @binding(0) var<uniform> color: vec3<f32>;

      @fragment
      fn main() -> @location(0) vec4<f32> {
          return vec4<f32>(color, 1.0);
      }
    `;
    }
}
