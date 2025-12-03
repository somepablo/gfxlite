import { RenderPhase } from "./RenderPhase";
import { ResourceManager } from "./ResourceManager";
import { LightingManager } from "./LightingManager";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import { Light } from "../light/Light";
import { DirectionalLight } from "../light/DirectionalLight";
import { Matrix4, Box3 } from "../../math";

interface ShadowMeshData {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export class ShadowRenderPhase extends RenderPhase {
    private resourceManager: ResourceManager;
    private lightingManager: LightingManager;
    private shadowPipeline: GPURenderPipeline | null = null;
    private shadowMeshDataCache = new WeakMap<Mesh, ShadowMeshData>();
    private shadowsEnabled: boolean = true;
    
    private lights: Light[] = [];
    private renderList: Mesh[] = [];
    private scene: Scene | null = null;

    private _tempMatrix = new Matrix4();
    private _tempMatrix2 = new Matrix4();
    private _tempFloat32 = new Float32Array(16);

    constructor(device: GPUDevice, resourceManager: ResourceManager, lightingManager: LightingManager) {
        super(device, "Shadow Render Phase");
        this.resourceManager = resourceManager;
        this.lightingManager = lightingManager;
    }

    setEnabled(enabled: boolean): void {
        this.shadowsEnabled = enabled;
    }

    setLights(lights: Light[]): void {
        this.lights = lights;
    }

    prepare(scene: Scene, _camera: Camera): void {
        if (!this.shadowsEnabled) return;
        this.scene = scene;
        this.renderList = [];

        scene.traverse((object) => {
            if (object instanceof Mesh && object.castShadow) {
                this.renderList.push(object);
            }
        });

        for (const light of this.lights) {
            if (light instanceof DirectionalLight && light.castShadow) {
                if (light.shadow.autoUpdate) {
                    this.updateShadowCameraBounds(light, scene);
                } else {
                    light.shadow.camera.position.copy(light.position);
                    light.shadow.camera.rotation.copy(light.rotation);
                    light.shadow.camera.updateWorldMatrix();
                }
            }
        }
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (!this.shadowsEnabled || !this.scene) return;

        if (!this.shadowPipeline) {
            this.createShadowPipeline();
        }

        const shadowMapArray = this.lightingManager.shadowMapArray;
        if (!shadowMapArray) return;

        for (const light of this.lights) {
            if (light instanceof DirectionalLight && light.castShadow) {
                const layerIndex = (light as any)._shadowLayerIndex;
                if (layerIndex !== undefined && layerIndex >= 0) {
                    this.renderShadowForLight(commandEncoder, light, shadowMapArray, layerIndex);
                }
            }
        }
    }

    private renderShadowForLight(
        commandEncoder: GPUCommandEncoder,
        light: DirectionalLight, 
        shadowMapArray: GPUTexture, 
        layerIndex: number
    ): void {
        const shadow = light.shadow;
        
        const layerView = shadowMapArray.createView({
            label: `Shadow Map Layer ${layerIndex}`,
            baseArrayLayer: layerIndex,
            arrayLayerCount: 1,
            dimension: "2d",
        });

        const passEncoder = commandEncoder.beginRenderPass({
            label: `Shadow Pass - ${light.id}`,
            colorAttachments: [],
            depthStencilAttachment: {
                view: layerView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        passEncoder.setPipeline(this.shadowPipeline!);

        const viewProjectionMatrix = this._tempMatrix2.multiplyMatrices(
            shadow.camera.projectionMatrix,
            shadow.camera.viewMatrix
        );

        for (const mesh of this.renderList) {
            this.renderShadowMesh(passEncoder, mesh, viewProjectionMatrix, layerIndex);
        }

        passEncoder.end();
    }

    private renderShadowMesh(
        passEncoder: GPURenderPassEncoder,
        mesh: Mesh,
        viewProjectionMatrix: Matrix4,
        layerIndex: number
    ): void {
        const mvpMatrix = this._tempMatrix.multiplyMatrices(
            viewProjectionMatrix,
            mesh.worldMatrix
        );

        let shadowData = this.shadowMeshDataCache.get(mesh);
        
        const minAlignment = this.device.limits.minUniformBufferOffsetAlignment;
        const alignedSize = Math.ceil(64 / minAlignment) * minAlignment;
        const MAX_SHADOW_LIGHTS = 4;
        const totalSize = alignedSize * MAX_SHADOW_LIGHTS;

        if (!shadowData) {
            const uniformBuffer = this.device.createBuffer({
                size: totalSize,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroup = this.device.createBindGroup({
                layout: this.shadowPipeline!.getBindGroupLayout(0),
                entries: [{ 
                    binding: 0, 
                    resource: { 
                        buffer: uniformBuffer,
                        size: 64 // Bind only the size of the struct
                    } 
                }]
            });

            shadowData = { uniformBuffer, bindGroup };
            this.shadowMeshDataCache.set(mesh, shadowData);
        }

        const offset = layerIndex * alignedSize;

        this._tempFloat32.set(mvpMatrix.elements);
        this.device.queue.writeBuffer(
            shadowData.uniformBuffer, 
            offset, 
            this._tempFloat32
        );

        passEncoder.setBindGroup(0, shadowData.bindGroup, [offset]);
        
        const geometryData = this.resourceManager.getGeometryData(mesh.geometry);
        passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);
        
        if (geometryData.indexBuffer) {
            passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
            passEncoder.drawIndexed(mesh.geometry.indexCount);
        } else {
            passEncoder.draw(mesh.geometry.indexCount);
        }
    }

    private updateShadowCameraBounds(light: DirectionalLight, scene: Scene): void {
        const sceneBox = new Box3();
        let hasGeometry = false;

        scene.traverse((object) => {
            if (object instanceof Mesh && (object.castShadow || object.receiveShadow) && object.geometry.boundingBox) {
                const bbox = object.geometry.boundingBox.clone();
                bbox.applyMatrix4(object.worldMatrix);
                if (!hasGeometry) {
                    sceneBox.copy(bbox);
                    hasGeometry = true;
                } else {
                    sceneBox.union(bbox);
                }
            }
        });

        if (!hasGeometry) return;

        light.shadow.camera.position.copy(light.position);
        light.shadow.camera.rotation.copy(light.rotation);
        light.shadow.camera.updateWorldMatrix();

        const viewMatrix = light.shadow.camera.viewMatrix;
        const lightSpaceBox = sceneBox.clone().applyMatrix4(viewMatrix);

        const padding = 1.0;
        light.shadow.camera.left = lightSpaceBox.min.x - padding;
        light.shadow.camera.right = lightSpaceBox.max.x + padding;
        light.shadow.camera.bottom = lightSpaceBox.min.y - padding;
        light.shadow.camera.top = lightSpaceBox.max.y + padding;
        light.shadow.camera.near = -lightSpaceBox.max.z - padding;
        light.shadow.camera.far = -lightSpaceBox.min.z + padding;
        light.shadow.camera.updateProjectionMatrix();
    }

    private createShadowPipeline(): void {
        const shadowVertexShader = /* wgsl */ `
            struct Uniforms {
                mvpMatrix : mat4x4<f32>,
            };
            @group(0) @binding(0) var<uniform> uniforms : Uniforms;

            @vertex
            fn main(@location(0) position : vec3<f32>) -> @builtin(position) vec4<f32> {
                return uniforms.mvpMatrix * vec4<f32>(position, 1.0);
            }
        `;

        const vertexModule = this.device.createShaderModule({
            label: "Shadow Vertex Shader",
            code: shadowVertexShader,
        });

        this.shadowPipeline = this.device.createRenderPipeline({
            label: "Shadow Pipeline",
            layout: "auto",
            vertex: {
                module: vertexModule,
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: 3 * 4,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            },
                        ],
                    },
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float",
            },
            primitive: {
                topology: "triangle-list",
            },
        });
        
        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: "uniform",
                    hasDynamicOffset: true,
                },
            }],
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        this.shadowPipeline = this.device.createRenderPipeline({
            label: "Shadow Pipeline",
            layout: pipelineLayout,
            vertex: {
                module: vertexModule,
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: 3 * 4,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            },
                        ],
                    },
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float",
            },
            primitive: {
                topology: "triangle-list",
            },
        });
    }

    dispose(): void {
        this.shadowMeshDataCache = new WeakMap();
    }
}
