import { Matrix4 } from "../math";
import type { Camera } from "./Camera";
import type { Geometry } from "./Geometry";
import type { Material } from "./Material";
import { Mesh } from "./Mesh";
import { Program } from "./Program";
import type { Scene } from "./Scene";

interface GeometryData {
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer | null;
}

interface MaterialData {
    program: Program;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

interface MeshData {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export class Renderer {
    public canvas: HTMLCanvasElement;
    public device!: GPUDevice;
    public context!: GPUCanvasContext;
    public presentationFormat!: GPUTextureFormat;

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

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
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

        console.log("GFXLite Renderer Initialized");
        this.isInitialized = true;
    }

    public resize(width: number, height: number) {
        if (!this.canvas) return;
        this.canvas.width = width;
        this.canvas.height = height;

        if (this.device) {
            if (this.depthTexture) this.depthTexture.destroy();
            this.depthTexture = this.device.createTexture({
                size: [width, height],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.depthTextureView = this.depthTexture.createView();
        }
    }

    private createFrameResources() {
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();
    }

    private getGeometryData(geometry: Geometry): GeometryData {
        // If we've already created buffers for this geometry, return them.
        if (this.geometryCache.has(geometry.id)) {
            return this.geometryCache.get(geometry.id)!;
        }

        // --- If not, create the GPU buffers now ---
        const vertexBuffer = this.device.createBuffer({
            label: `Vertex Buffer for Geometry ${geometry.id}`,
            size: geometry.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices as any);

        let indexBuffer: GPUBuffer | null = null;
        if (geometry.indices) {
            indexBuffer = this.device.createBuffer({
                label: `Index Buffer for Geometry ${geometry.id}`,
                size: geometry.indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(indexBuffer, 0, geometry.indices as any);
        }

        const data: GeometryData = { vertexBuffer, indexBuffer };
        // Store the new buffers in the cache for next time.
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
        // Upload initial data
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as any);

        const bindGroup = this.device.createBindGroup({
            layout: program.pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        const data = { program, uniformBuffer, bindGroup };
        this.materialDataCache.set(material.id, data);
        return data;
    }

    public async render(scene: Scene, camera: Camera) {
        if (!this.isInitialized) {
            await this.initializationPromise;
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
        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        };

        const passEncoder =
            commandEncoder.beginRenderPass(renderPassDescriptor);

        const viewProjectionMatrix = new Matrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.viewMatrix,
        );

        for (const mesh of renderList) {
            const materialData = this.getMaterialData(mesh.material);
            const geometryData = this.getGeometryData(mesh.geometry);
            const program = materialData.program;

            // --- Get or create per-mesh resources (MVP buffer & bind group) ---
            let meshData = this.meshDataCache.get(mesh);
            if (!meshData) {
                const uniformBuffer = this.device.createBuffer({
                    label: `MVP Buffer for Mesh ${mesh.id}`,
                    size: 16 * 4, // 4x4 matrix
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

            // OPTIONAL: Update material uniforms if they have changed
            // For now, we'll re-upload on every frame. This can be optimized later.
            this.device.queue.writeBuffer(
                materialData.uniformBuffer,
                0,
                mesh.material.getUniformBufferData() as any,
            );

            passEncoder.setPipeline(program.pipeline);

            const mvpMatrix = new Matrix4().multiplyMatrices(
                viewProjectionMatrix,
                mesh.worldMatrix,
            );
            
            // Write to the MESH-SPECIFIC buffer
            this.device.queue.writeBuffer(
                meshData.uniformBuffer,
                0,
                new Float32Array(mvpMatrix.toArray()) as any,
            );

            passEncoder.setBindGroup(0, meshData.bindGroup);
            passEncoder.setBindGroup(1, materialData.bindGroup);

            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);
            if (geometryData.indexBuffer) {
                passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                passEncoder.drawIndexed(mesh.geometry.indexCount);
            } else {
                passEncoder.draw(mesh.geometry.indexCount);
            }
        }

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }
}
