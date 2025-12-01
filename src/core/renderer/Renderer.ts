import { Matrix4, Vector3, Box3 } from "../../math";
import type { Camera } from "../camera/Camera";
import type { Geometry } from "../geometry/Geometry";
import type { Material } from "../material/Material";
import { Mesh } from "../object/Mesh";
import { Program } from "./Program";
import type { Scene } from "../scene/Scene";
import { Light } from "../light/Light";
import { DirectionalLight } from "../light/DirectionalLight";
import { PhongMaterial } from "../material/PhongMaterial";
import { LambertMaterial } from "../material/LambertMaterial";

interface GeometryData {
    vertexBuffer: GPUBuffer;
    normalBuffer: GPUBuffer | null;
    indexBuffer: GPUBuffer | null;
}

interface MeshData {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

interface MaterialData {
    program: Program;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export const ShadowType = {
    Basic: 0,
    PCF: 1,
    PCFSoft: 2,
} as const;

export type ShadowType = typeof ShadowType[keyof typeof ShadowType];

export interface RendererOptions {
    antialias?: boolean;
    shadowType?: ShadowType;
    shadows?: boolean;
}

export class Renderer {
    public canvas: HTMLCanvasElement;
    public device!: GPUDevice;
    public context!: GPUCanvasContext;
    public presentationFormat!: GPUTextureFormat;

    private pixelRatio: number = 1;
    public debug: boolean = false;

    private isInitialized = false;
    private initializationPromise: Promise<void>;

    // Cache programs to ensure we reuse pipelines for identical shaders
    private programCache = new Map<string, Program>();
    
    // Cache per-mesh data (MVP buffer and bind group)
    private meshDataCache = new WeakMap<Mesh, MeshData>();

    private depthTexture!: GPUTexture;
    private depthTextureView!: GPUTextureView;
    private geometryCache = new Map<number, GeometryData>();
    private materialDataCache = new Map<number, MaterialData>();
    private lightingBuffer: GPUBuffer | null = null;
    private lightingBindGroupCache = new WeakMap<GPURenderPipeline, GPUBindGroup>();

    // Shadows
    private shadowMeshDataCache = new WeakMap<Mesh, { uniformBuffer: GPUBuffer, bindGroup: GPUBindGroup }>();
    private dummyShadowMap!: GPUTextureView;
    private dummyShadowSampler!: GPUSampler;
    public shadowType: ShadowType = ShadowType.PCF;
    public shadowsEnabled: boolean = true;
    private shadowPipeline: GPURenderPipeline | null = null;

    // MSAA
    private sampleCount: number = 1;
    private msaaTexture!: GPUTexture;
    private msaaTextureView!: GPUTextureView;

    public debugInfo = {
        render: {
            calls: 0,
            triangles: 0,
        },
        memory: {
            geometries: 0,
            programs: 0,
        },
    };

    constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
        this.canvas = canvas;
        this.sampleCount = options.antialias ? 4 : 1;
        if (options.shadowType !== undefined) {
            this.shadowType = options.shadowType;
        }
        if (options.shadows !== undefined) {
            this.shadowsEnabled = options.shadows;
        }
        this.initializationPromise = this.init();
    }

    private async init(): Promise<void> {
        if (!navigator.gpu) {
            console.error("WebGPU not supported on this browser.");
            return;
        }
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("Failed to get GPU adapter.");
            return;
        }
        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
        if (!this.context) {
            console.error("Failed to get WebGPU context.");
            return;
        }

        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: "premultiplied",
        });
        this.createFrameResources();

    const dummyTexture = this.device.createTexture({
        size: [1, 1],
        format: "depth32float",
        usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this.dummyShadowMap = dummyTexture.createView();
    this.dummyShadowSampler = this.device.createSampler({
        compare: "less",
        minFilter: "linear",
        magFilter: "linear",
    });

    console.log("GFXLite Renderer Initialized");
    this.isInitialized = true;
    }

    public getPixelRatio(): number {
        return this.pixelRatio;
    }

    public setPixelRatio(value: number) {
        this.pixelRatio = value;
    }

    public resize() {
        if (!this.canvas) return;

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.canvas.width = width * this.pixelRatio;
        this.canvas.height = height * this.pixelRatio;

        if (this.device) {
            if (this.depthTexture) this.depthTexture.destroy();
            if (this.msaaTexture) this.msaaTexture.destroy();
            
            this.createFrameResources();
        }
    }

    private createFrameResources() {
        // Create MSAA Texture
        this.msaaTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this.sampleCount,
        });
        this.msaaTextureView = this.msaaTexture.createView();

        // Create Depth Texture (Multisampled)
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this.sampleCount,
        });
        this.depthTextureView = this.depthTexture.createView();
    }

    private getGeometryData(geometry: Geometry): GeometryData {
        
        if (this.geometryCache.has(geometry.id)) {
            return this.geometryCache.get(geometry.id)!;
        }

        const vertexBuffer = this.device.createBuffer({
            label: `Vertex Buffer for Geometry ${geometry.id}`,
            size: geometry.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices as any);

        let normalBuffer: GPUBuffer | null = null;
        if (geometry.normals) {
            normalBuffer = this.device.createBuffer({
                label: `Normal Buffer for Geometry ${geometry.id}`,
                size: geometry.normals.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(normalBuffer, 0, geometry.normals as any);
        } else {
             // Create a dummy normal buffer if missing, to avoid crashes if pipeline expects it
             const dummyNormals = new Float32Array(geometry.vertices.length);
             normalBuffer = this.device.createBuffer({
                label: `Dummy Normal Buffer for Geometry ${geometry.id}`,
                size: dummyNormals.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(normalBuffer, 0, dummyNormals as any);
        }

        let indexBuffer: GPUBuffer | null = null;
        if (geometry.indices) {
            indexBuffer = this.device.createBuffer({
                label: `Index Buffer for Geometry ${geometry.id}`,
                size: geometry.indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(indexBuffer, 0, geometry.indices as any);
        }

        const data: GeometryData = { vertexBuffer, normalBuffer, indexBuffer };
        this.geometryCache.set(geometry.id, data);
        return data;
    }

    private getMaterialData(material: Material): MaterialData {
        if (this.materialDataCache.has(material.id)) {
            return this.materialDataCache.get(material.id)!;
        }

        const vertexCode = material.getVertexShader();
        const fragmentCode = material.getFragmentShader();
        const cacheKey = vertexCode + fragmentCode;

        let program = this.programCache.get(cacheKey);
        if (!program) {
            program = new Program(this.device, {
                vertex: { code: vertexCode },
                fragment: { code: fragmentCode },
                multisample: { count: this.sampleCount },
            });
            this.programCache.set(cacheKey, program);
        }

        // --- GENERIC UNIFORM BUFFER CREATION ---
        const uniformData = material.getUniformBufferData();
        const uniformBuffer = this.device.createBuffer({
            label: `Material Uniform Buffer for ${material.id}`,
            size: uniformData.byteLength, // Use the size of the provided data
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as any);

        const bindGroup = this.device.createBindGroup({
            layout: program.pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        const data = { program, uniformBuffer, bindGroup };
        this.materialDataCache.set(material.id, data);
        return data;
    }

    private createShadowPipeline() {
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
    }

    private updateShadowCameraBounds(light: DirectionalLight, scene: Scene) {
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

    private renderShadows(scene: Scene, lights: Light[]) {
        if (!this.shadowsEnabled) return;

        if (!this.shadowPipeline) {
            this.createShadowPipeline();
        }

        for (const light of lights) {
            if (light instanceof DirectionalLight && light.castShadow) {
                const shadow = light.shadow;
                
                // Create shadow map resources if they don't exist
                if (!shadow.map) {
                    shadow.map = this.device.createTexture({
                        size: [shadow.mapSize.width, shadow.mapSize.height],
                        format: "depth32float",
                        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                    });
                    shadow.view = shadow.map.createView();
                    
                    // Create sampler based on shadow type
                    // Basic = Nearest (Hard)
                    // PCF/PCFSoft = Linear (Soft)
                    const filterMode: GPUFilterMode = this.shadowType === ShadowType.Basic ? "nearest" : "linear";
                    
                    shadow.sampler = this.device.createSampler({
                        compare: "less",
                        minFilter: filterMode,
                        magFilter: filterMode,
                    });
                }

                // Update Shadow Camera
                if (shadow.autoUpdate) {
                    this.updateShadowCameraBounds(light, scene);
                } else {
                    shadow.camera.position.copy(light.position);
                    shadow.camera.rotation.copy(light.rotation);
                    shadow.camera.updateWorldMatrix();
                }
                
                // Render Scene to Shadow Map
                const commandEncoder = this.device.createCommandEncoder();
                const passEncoder = commandEncoder.beginRenderPass({
                    colorAttachments: [], // No color output
                    depthStencilAttachment: {
                        view: shadow.view!,
                        depthClearValue: 1.0,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                    },
                });

                passEncoder.setPipeline(this.shadowPipeline!);

                const viewProjectionMatrix = new Matrix4().multiplyMatrices(
                    shadow.camera.projectionMatrix,
                    shadow.camera.viewMatrix
                );

                scene.traverse((object) => {
                    if (object instanceof Mesh && object.castShadow) {
                        // We need a bind group for the shadow pipeline (MVP matrix)
                        // We can't reuse the main mesh bind group because the layout might be different (Shadow pipeline only has Group 0 with MVP)
                        // And the values are different (Light ViewProj instead of Camera ViewProj)
                        
                        // For performance, we should cache this, but for now let's create a temporary bind group
                        // Actually, we can reuse the logic if we had a "ShadowMaterial" but we don't.
                        
                        // We need to upload the MVP matrix for this object from the Light's POV.
                        const mvpMatrix = new Matrix4().multiplyMatrices(
                            viewProjectionMatrix,
                            object.worldMatrix
                        );

                        // Check cache
                        let shadowData = this.shadowMeshDataCache.get(object);

                        if (!shadowData) {
                            const uniformBuffer = this.device.createBuffer({
                                size: 64,
                                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                            });

                            const bindGroup = this.device.createBindGroup({
                                layout: this.shadowPipeline!.getBindGroupLayout(0),
                                entries: [
                                    { binding: 0, resource: { buffer: uniformBuffer } }
                                ]
                            });

                            shadowData = { uniformBuffer, bindGroup };
                            this.shadowMeshDataCache.set(object, shadowData);
                        }

                        // Update buffer
                        this.device.queue.writeBuffer(shadowData.uniformBuffer, 0, new Float32Array(mvpMatrix.toArray()));

                        passEncoder.setBindGroup(0, shadowData.bindGroup);
                        
                        const geometryData = this.getGeometryData(object.geometry);
                        passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);
                        
                        if (geometryData.indexBuffer) {
                            passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                            passEncoder.drawIndexed(object.geometry.indexCount);
                        } else {
                            passEncoder.draw(object.geometry.indexCount);
                        }
                    }
                });

                passEncoder.end();
                this.device.queue.submit([commandEncoder.finish()]);
            }
        }
    }

    public async render(scene: Scene, camera: Camera) {
        if (!this.isInitialized) {
            await this.initializationPromise;
        }

        if (this.debug) {
            this.debugInfo.render.calls = 0;
            this.debugInfo.render.triangles = 0;
            this.debugInfo.memory.geometries = this.geometryCache.size;
            this.debugInfo.memory.programs = this.programCache.size;
        }

        scene.updateWorldMatrix();
        camera.updateWorldMatrix();
        
        const renderList: Mesh[] = [];
        scene.traverse((object) => {
            if (object instanceof Mesh) renderList.push(object);
        });

        if (renderList.length === 0) {
            return;
        }

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();
        
        const colorAttachment: GPURenderPassColorAttachment = {
            view: this.sampleCount > 1 ? this.msaaTextureView : textureView,
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
            loadOp: "clear",
            storeOp: this.sampleCount > 1 ? "discard" : "store",
        };

        if (this.sampleCount > 1) {
            colorAttachment.resolveTarget = textureView;
        }

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [colorAttachment],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard",
            },
        };

        const passEncoder =
            commandEncoder.beginRenderPass(renderPassDescriptor);

        if (this.debug) {
            passEncoder.pushDebugGroup(`Render Scene`);
        }

        const viewProjectionMatrix = new Matrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.viewMatrix,
        );

        // --- Collect Lights ---
        const lights: Light[] = [];

        scene.traverse((object) => {
            if (object instanceof Light) {
                lights.push(object);
            }
        });

        this.renderShadows(scene, lights);

        // --- Update Lighting Buffer ---
        // Struct: ambientColor(3), lightCount(1), lights[1] { direction(3), intensity(1), color(3), padding(1), viewProj(16), shadowMapSize(2), padding(2) }
        
        const lightingDataSize = 16 + (32 + 64 + 16) * 1; // Support 1 light for now. Added 16 bytes for shadowMapSize + padding. Total stride = 112 bytes.
        if (!this.lightingBuffer || this.lightingBuffer.size < lightingDataSize) {
            if (this.lightingBuffer) this.lightingBuffer.destroy();
            this.lightingBuffer = this.device.createBuffer({
                label: "Lighting Uniform Buffer",
                size: lightingDataSize,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // Clear cache because buffer changed
            this.lightingBindGroupCache = new WeakMap();
        }

        const lightingData = new Float32Array(lightingDataSize / 4);
        
        // Ambient Color
        lightingData.set(scene.ambientLight.toArray(), 0);
        
        // Light Count
        new Uint32Array(lightingData.buffer, 12, 1)[0] = lights.length;

        let shadowLight: DirectionalLight | null = null;

        if (lights.length > 0) {
            const light = lights[0];
            let direction = new Vector3(0, 0, -1);
            if (light instanceof DirectionalLight) {
                direction = light.direction;
                if (light.castShadow) shadowLight = light;
            }
            // Direction
            lightingData.set(direction.toArray(), 4);
            // Intensity
            lightingData[7] = light.intensity;
            // Color
            lightingData.set(light.color.toArray(), 8);
            
            // Shadow ViewProj Matrix
            if (shadowLight && shadowLight.shadow.camera) {
                 const shadowViewProj = new Matrix4().multiplyMatrices(
                    shadowLight.shadow.camera.projectionMatrix,
                    shadowLight.shadow.camera.viewMatrix
                );
                lightingData.set(shadowViewProj.toArray(), 12); 
            }
            
            // Shadow Type (packed in padding after color)
            // Color is at offset 8 (3 floats). Padding is at offset 11.
            lightingData[11] = (this.shadowsEnabled && shadowLight && shadowLight.castShadow) ? this.shadowType : -1.0;

            // Shadow Map Size
            if (shadowLight) {
                lightingData[28] = shadowLight.shadow.mapSize.width;
                lightingData[29] = shadowLight.shadow.mapSize.height;
            } else {
                lightingData[28] = 0;
                lightingData[29] = 0;
            }
        }

        this.device.queue.writeBuffer(this.lightingBuffer, 0, lightingData);

        for (const mesh of renderList) {
            const materialData = this.getMaterialData(mesh.material);
            const geometryData = this.getGeometryData(mesh.geometry);
            const program = materialData.program;

            // --- Get or create per-mesh resources (MVP buffer & bind group) ---
            let meshData = this.meshDataCache.get(mesh);
            if (!meshData) {
                const uniformBuffer = this.device.createBuffer({
                    label: `MVP Buffer for Mesh ${mesh.id}`,
                    size: 52 * 4, // MVP (16) + Model (16) + Normal (16) + CameraPos (4)
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                const bindGroup = this.device.createBindGroup({
                    layout: program.pipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: uniformBuffer } },
                    ],
                });

                meshData = { uniformBuffer, bindGroup };
                this.meshDataCache.set(mesh, meshData);
            }

            if (mesh.material.needsUpdate) {
                this.device.queue.writeBuffer(
                    materialData.uniformBuffer,
                    0,
                    mesh.material.getUniformBufferData() as any,
                );
                mesh.material.needsUpdate = false;
            }

            passEncoder.setPipeline(program.pipeline);

            const mvpMatrix = new Matrix4().multiplyMatrices(
                viewProjectionMatrix,
                mesh.worldMatrix,
            );
            
            const modelMatrix = mesh.worldMatrix;
            const normalMatrix = new Matrix4().copy(modelMatrix).invert().transpose();

            // Write to the MESH-SPECIFIC buffer
            // We need to write 3 matrices: MVP, Model, Normal, and Camera Position
            const uniformData = new Float32Array(52);
            uniformData.set(mvpMatrix.toArray(), 0);
            uniformData.set(modelMatrix.toArray(), 16);
            uniformData.set(normalMatrix.toArray(), 32);
            uniformData.set(camera.position.toArray(), 48);
            // Pack receiveShadow into the w component of cameraPosition (offset 51)
            uniformData[51] = mesh.receiveShadow ? 1.0 : 0.0;

            this.device.queue.writeBuffer(
                meshData.uniformBuffer,
                0,
                uniformData as any,
            );

            passEncoder.setBindGroup(0, meshData.bindGroup);
            passEncoder.setBindGroup(1, materialData.bindGroup);

            // Bind Group 2 (Lighting) if available
            if ((mesh.material instanceof PhongMaterial || mesh.material instanceof LambertMaterial) && this.lightingBuffer) {
                let lightingBindGroup = this.lightingBindGroupCache.get(program.pipeline);
                if (!lightingBindGroup) {
                    const entries: GPUBindGroupEntry[] = [
                        { binding: 0, resource: { buffer: this.lightingBuffer } },
                    ];

                    // If we have a shadow map, bind it. Otherwise use dummy.
                    if (shadowLight && shadowLight.shadow.map && shadowLight.shadow.view && shadowLight.shadow.sampler) {
                         entries.push({ binding: 1, resource: shadowLight.shadow.view });
                         entries.push({ binding: 2, resource: shadowLight.shadow.sampler });
                    } else {
                         entries.push({ binding: 1, resource: this.dummyShadowMap });
                         entries.push({ binding: 2, resource: this.dummyShadowSampler });
                    }

                    lightingBindGroup = this.device.createBindGroup({
                        layout: program.pipeline.getBindGroupLayout(2),
                        entries: entries,
                    });
                    this.lightingBindGroupCache.set(program.pipeline, lightingBindGroup);
                }
                passEncoder.setBindGroup(2, lightingBindGroup);
            }

            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);
            if (geometryData.normalBuffer) {
                passEncoder.setVertexBuffer(1, geometryData.normalBuffer);
            }
            if (geometryData.indexBuffer) {
                passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                passEncoder.drawIndexed(mesh.geometry.indexCount);
                if (this.debug) this.debugInfo.render.triangles += mesh.geometry.indexCount / 3;
            } else {
                passEncoder.draw(mesh.geometry.indexCount);
                if (this.debug) this.debugInfo.render.triangles += mesh.geometry.indexCount / 3;
            }
            if (this.debug) this.debugInfo.render.calls++;
        }

        if (this.debug) {
            passEncoder.popDebugGroup();
        }

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }
}
