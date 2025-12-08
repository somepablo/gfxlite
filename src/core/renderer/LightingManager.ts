import type { Scene } from "../scene/Scene";
import { Light } from "../light/Light";
import { DirectionalLight } from "../light/DirectionalLight";
import { Vector3, Matrix4 } from "../../math";

const MAX_LIGHTS = 16;
const MAX_SHADOW_LIGHTS = 4;

export interface LightData {
    direction: Vector3;
    intensity: number;
    color: Vector3;
    shadowLight: DirectionalLight | null;
    shadowLayerIndex: number;
}

export class LightingManager {
    private device: GPUDevice;
    private lightingBuffer: GPUBuffer | null = null;
    private lightingBindGroupCache = new WeakMap<GPURenderPipeline, GPUBindGroup>();
    
    public shadowMapArray: GPUTexture | null = null;
    public shadowMapArrayView: GPUTextureView | null = null;

    private dummyShadowMap: GPUTextureView;
    private dummyShadowSampler: GPUSampler;

    constructor(
        device: GPUDevice,
        dummyShadowMap: GPUTextureView,
        dummyShadowSampler: GPUSampler
    ) {
        this.device = device;
        this.dummyShadowMap = dummyShadowMap;
        this.dummyShadowSampler = dummyShadowSampler;
    }

    collectLights(scene: Scene): Light[] {
        const lights: Light[] = [];
        scene.traverse((object) => {
            if (object instanceof Light) {
                lights.push(object);
            }
        });
        return lights;
    }

    updateLightingBuffer(scene: Scene, lights: Light[], shadowType: number, shadowsEnabled: boolean = true): GPUBuffer {
        // Struct Light size:
        // direction: vec3<f32> (12) + intensity: f32 (4) = 16
        // color: vec3<f32> (12) + shadowIndex: i32 (4) = 16
        // viewProj: mat4x4<f32> (64)
        // shadowMapSize: vec2<f32> (8) + padding: vec2<f32> (8) = 16
        // Total per light: 112 bytes
        
        // Uniforms size:
        // ambientColor: vec3<f32> (12) + lightCount: u32 (4) = 16
        // lights: array<Light, MAX_LIGHTS>
        
        const lightStructSize = 112;
        const lightingDataSize = 16 + lightStructSize * MAX_LIGHTS;

        
        if (!this.lightingBuffer || this.lightingBuffer.size < lightingDataSize) {
            if (this.lightingBuffer) this.lightingBuffer.destroy();
            
            this.lightingBuffer = this.device.createBuffer({
                label: "Lighting Uniform Buffer",
                size: lightingDataSize,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            
            this.lightingBindGroupCache = new WeakMap();
        }

        let maxShadowMapSize = 512;
        for (const light of lights) {
            if (light instanceof DirectionalLight && light.castShadow) {
                maxShadowMapSize = Math.max(maxShadowMapSize, light.shadow.mapSize.width, light.shadow.mapSize.height);
            }
        }

        if (!this.shadowMapArray || this.shadowMapArray.width !== maxShadowMapSize) {
            this.createShadowMapArray(maxShadowMapSize);
            this.lightingBindGroupCache = new WeakMap();
        }

        const lightingData = new Float32Array(lightingDataSize / 4);
        
        lightingData.set(scene.ambientLight.toArray(), 0);
        
        new Uint32Array(lightingData.buffer, 12, 1)[0] = lights.length;

        let shadowLightCount = 0;

        for (let i = 0; i < Math.min(lights.length, MAX_LIGHTS); i++) {
            const light = lights[i];
            const baseOffset = 4 + (i * (lightStructSize / 4));

            let direction = new Vector3(0, 0, -1);
            let shadowLayerIndex = -1;
            let shadowLight: DirectionalLight | null = null;

            if (light instanceof DirectionalLight) {
                direction = light.direction;
                if (shadowsEnabled && light.castShadow && shadowLightCount < MAX_SHADOW_LIGHTS) {
                    shadowLight = light;
                    shadowLayerIndex = shadowLightCount;
                    shadowLightCount++;
                    
                    (light as any)._shadowLayerIndex = shadowLayerIndex;
                }
            }
            lightingData.set(direction.toArray(), baseOffset);
            lightingData[baseOffset + 3] = light.intensity;
            lightingData.set(light.color.toArray(), baseOffset + 4);
            // Shadow Layer Index (offset 7 in struct)
            // We use a float view, but this should be read as i32 in shader
            // However, for simplicity in mixed buffer, we can cast or use bit reinterpretation if needed.
            // Since we are using Float32Array, let's just write it as float and cast in shader or use Int32Array view
            new Int32Array(lightingData.buffer, (baseOffset + 7) * 4, 1)[0] = shadowLayerIndex;

            // Shadow ViewProj Matrix (offset 8 in struct)
            if (shadowLight && shadowLight.shadow.camera) {
                const shadowViewProj = new Matrix4().multiplyMatrices(
                    shadowLight.shadow.camera.projectionMatrix,
                    shadowLight.shadow.camera.viewMatrix
                );
                lightingData.set(shadowViewProj.toArray(), baseOffset + 8);
            }

            // Shadow Map Size (offset 24 in struct)
            if (shadowLight) {
                lightingData[baseOffset + 24] = shadowLight.shadow.mapSize.width;
                lightingData[baseOffset + 25] = shadowLight.shadow.mapSize.height;
                // Shadow Type (offset 26 in struct)
                lightingData[baseOffset + 26] = shadowType;
            }
        }

        this.device.queue.writeBuffer(this.lightingBuffer, 0, lightingData);
        return this.lightingBuffer;
    }

    private createShadowMapArray(size: number) {
        if (this.shadowMapArray) {
            this.shadowMapArray.destroy();
        }

        this.shadowMapArray = this.device.createTexture({
            label: "Shadow Map Array",
            size: [size, size, MAX_SHADOW_LIGHTS],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        
        this.shadowMapArrayView = this.shadowMapArray.createView({
            dimension: "2d-array",
        });
    }

    getLightingBindGroup(
        pipeline: GPURenderPipeline
    ): GPUBindGroup {
        let lightingBindGroup = this.lightingBindGroupCache.get(pipeline);
        
        if (!lightingBindGroup && this.lightingBuffer) {
            const entries: GPUBindGroupEntry[] = [
                { binding: 0, resource: { buffer: this.lightingBuffer } },
            ];

            if (this.shadowMapArrayView) {
                entries.push({ binding: 1, resource: this.shadowMapArrayView });
                entries.push({ binding: 2, resource: this.dummyShadowSampler });
            } else {
                entries.push({ binding: 1, resource: this.dummyShadowMap });
                entries.push({ binding: 2, resource: this.dummyShadowSampler });
            }

            lightingBindGroup = this.device.createBindGroup({
                layout: pipeline.getBindGroupLayout(2),
                entries: entries,
            });
            
            this.lightingBindGroupCache.set(pipeline, lightingBindGroup);
        }

        return lightingBindGroup!;
    }

    // Getters for external access (used by MainRenderPhase)
    getLightingBuffer(): GPUBuffer | null {
        return this.lightingBuffer;
    }

    getDummyShadowMap(): GPUTextureView {
        return this.dummyShadowMap;
    }

    getShadowSampler(): GPUSampler {
        return this.dummyShadowSampler;
    }

    dispose(): void {
        if (this.lightingBuffer) {
            this.lightingBuffer.destroy();
            this.lightingBuffer = null;
        }
        if (this.shadowMapArray) {
            this.shadowMapArray.destroy();
            this.shadowMapArray = null;
        }
        this.lightingBindGroupCache = new WeakMap();
    }
}
