import { Vector3 } from "../../math";
import { Material } from "./Material";

export interface PhongMaterialOptions {
    color?: Vector3;
    specular?: Vector3;
    shininess?: number;
}

export class PhongMaterial extends Material {
    constructor({
        color = new Vector3(1, 1, 1),
        specular = new Vector3(1, 1, 1),
        shininess = 30,
    }: PhongMaterialOptions = {}) {
        super();
        this.uniforms.color = color;
        this.uniforms.specular = specular;
        this.uniforms.shininess = shininess;
    }

    getUniformBufferData(): Float32Array {
        const color = this.uniforms.color as Vector3;
        const specular = this.uniforms.specular as Vector3;
        const shininess = this.uniforms.shininess as number;

        return new Float32Array([
            ...color.toArray(), 0, // Color + padding
            ...specular.toArray(), shininess, // Specular + shininess
        ]);
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
      struct Uniforms {
        mvpMatrix : mat4x4<f32>,
        modelMatrix : mat4x4<f32>,
        normalMatrix : mat4x4<f32>,
        cameraPosition : vec3<f32>,
      };
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;

      struct MaterialUniforms {
        color : vec3<f32>,
        specular : vec3<f32>,
        shininess : f32,
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
        let viewDir = normalize(uniforms.cameraPosition - vPosition);
        
        // Ambient
        let ambient = lighting.ambientColor * material.color;

        // Diffuse & Specular
        var diffuse = vec3<f32>(0.0);
        var specular = vec3<f32>(0.0);

        for (var i = 0u; i < lighting.lightCount; i++) {
            let light = lighting.lights[i];
            let lightDir = normalize(-light.direction);
            
            // Diffuse
            let diff = max(dot(normal, lightDir), 0.0);
            diffuse += diff * light.color * light.intensity * material.color;

            // Specular (Blinn-Phong)
            if (diff > 0.0) {
                let halfDir = normalize(lightDir + viewDir);
                let specAngle = max(dot(normal, halfDir), 0.0);
                let spec = pow(specAngle, material.shininess);
                specular += spec * material.specular * light.color * light.intensity;
            }
        }

        return vec4<f32>(ambient + diffuse + specular, 1.0);
      }
    `;
    }
}
