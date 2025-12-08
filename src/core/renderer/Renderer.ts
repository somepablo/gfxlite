import type { Camera } from "../camera/Camera";
import type { Scene } from "../scene/Scene";
import { LightingManager } from "./LightingManager";
import { MainRenderPhase } from "./MainRenderPhase";
import { ShadowRenderPhase } from "./ShadowRenderPhase";
import { CullingComputePhase } from "./CullingComputePhase";
import { BatchManager } from "./BatchManager";

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

    private lightingManager!: LightingManager;
    private batchManager!: BatchManager;
    private mainPhase!: MainRenderPhase;
    private shadowPhase!: ShadowRenderPhase;
    private cullingPhase!: CullingComputePhase;

    private depthTexture!: GPUTexture;
    private depthTextureView!: GPUTextureView;
    private msaaTexture!: GPUTexture;
    private msaaTextureView!: GPUTextureView;

    private dummyShadowMap!: GPUTextureView;
    private dummyShadowSampler!: GPUSampler;
    public shadowType: ShadowType = ShadowType.PCF;
    public shadowsEnabled: boolean = true;

    private sampleCount: number = 1;

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

        // Create dummy shadow resources
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


        this.lightingManager = new LightingManager(
            this.device,
            this.dummyShadowMap,
            this.dummyShadowSampler
        );
        this.batchManager = new BatchManager(this.device);

        this.cullingPhase = new CullingComputePhase(this.device);

        // Share culling layouts
        this.batchManager.setCullingLayouts(
            this.cullingPhase.cameraBindGroupLayout!,
            this.cullingPhase.mainCullBindGroupLayout!
        );

        this.shadowPhase = new ShadowRenderPhase(
            this.device,
            this.lightingManager,
            this.batchManager
        );
        this.shadowPhase.setCullingLayouts(
            this.cullingPhase.cameraBindGroupLayout!,
            this.cullingPhase.shadowCullBindGroupLayout!
        );

        this.mainPhase = new MainRenderPhase(
            this.device,
            this.lightingManager,
            this.batchManager,
            this.context,
            this.depthTextureView,
            this.msaaTextureView,
            this.sampleCount
        );

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
            
            if (this.mainPhase) {
                this.mainPhase = new MainRenderPhase(
                    this.device,
                    this.lightingManager,
                    this.batchManager,
                    this.context,
                    this.depthTextureView,
                    this.msaaTextureView,
                    this.sampleCount
                );
            }
        }
    }

    private createFrameResources() {
        this.msaaTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this.sampleCount,
        });
        this.msaaTextureView = this.msaaTexture.createView();

        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this.sampleCount,
        });
        this.depthTextureView = this.depthTexture.createView();
    }

    public async render(scene: Scene, camera: Camera) {
        if (!this.isInitialized) {
            await this.initializationPromise;
        }

        if (this.debug) {
            this.debugInfo.render.calls = 0;
            this.debugInfo.render.triangles = 0;
        }

        scene.updateWorldMatrix();
        camera.updateWorldMatrix();

        const lights = this.lightingManager.collectLights(scene);     
        this.lightingManager.updateLightingBuffer(scene, lights, this.shadowType, this.shadowsEnabled);   

        this.cullingPhase.clear();

        this.shadowPhase.setEnabled(this.shadowsEnabled);
        this.shadowPhase.setLights(lights);
        this.shadowPhase.prepare(scene, camera);
        
        this.mainPhase.prepare(scene, camera);

        // Register culling tasks
        this.shadowPhase.registerCullingPasses(this.cullingPhase);
        this.mainPhase.registerCullingPasses(this.cullingPhase);
        
        const commandEncoder = this.device.createCommandEncoder();
        
        // Execute unified culling
        this.cullingPhase.execute(commandEncoder);
        this.shadowPhase.execute(commandEncoder);
        this.mainPhase.execute(commandEncoder);
        
        this.device.queue.submit([commandEncoder.finish()]);

        if (this.debug) {
            this.debugInfo.render.calls = this.mainPhase.debugInfo.calls;
            this.debugInfo.render.triangles = this.mainPhase.debugInfo.triangles;
        }
    }

    public dispose() {
        this.lightingManager?.dispose();
        this.batchManager?.dispose();
        this.shadowPhase?.dispose?.();

        if (this.depthTexture) this.depthTexture.destroy();
        if (this.msaaTexture) this.msaaTexture.destroy();
    }
}
