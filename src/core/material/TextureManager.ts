import type { Texture } from "./Texture";

export class TextureManager {
	private device: GPUDevice;
	private samplerCache = new Map<string, GPUSampler>();

	// Dummy textures for materials without all maps
	public dummyWhiteTexture!: GPUTextureView;
	public dummyNormalTexture!: GPUTextureView;
	public dummyBlackTexture!: GPUTextureView;
	public defaultSampler!: GPUSampler;

	// Mipmap generation pipeline
	private mipmapPipeline: GPUComputePipeline | null = null;
	private mipmapBindGroupLayout: GPUBindGroupLayout | null = null;

	constructor(device: GPUDevice) {
		this.device = device;
		this.createDummyTextures();
		this.createMipmapPipeline();
	}

	private createDummyTextures(): void {
		// 1x1 white texture (for missing albedo, metallic-roughness, AO)
		const whiteTexture = this.device.createTexture({
			label: "Dummy White Texture",
			size: [1, 1],
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		this.device.queue.writeTexture(
			{ texture: whiteTexture },
			new Uint8Array([255, 255, 255, 255]),
			{ bytesPerRow: 4 },
			[1, 1],
		);
		this.dummyWhiteTexture = whiteTexture.createView();

		// 1x1 normal texture (flat normal: 0.5, 0.5, 1.0 encoded as 128, 128, 255)
		const normalTexture = this.device.createTexture({
			label: "Dummy Normal Texture",
			size: [1, 1],
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		this.device.queue.writeTexture(
			{ texture: normalTexture },
			new Uint8Array([128, 128, 255, 255]),
			{ bytesPerRow: 4 },
			[1, 1],
		);
		this.dummyNormalTexture = normalTexture.createView();

		// 1x1 black texture (for missing emissive)
		const blackTexture = this.device.createTexture({
			label: "Dummy Black Texture",
			size: [1, 1],
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
		});
		this.device.queue.writeTexture(
			{ texture: blackTexture },
			new Uint8Array([0, 0, 0, 255]),
			{ bytesPerRow: 4 },
			[1, 1],
		);
		this.dummyBlackTexture = blackTexture.createView();

		// Default sampler
		this.defaultSampler = this.device.createSampler({
			label: "Default Sampler",
			minFilter: "linear",
			magFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});
	}

	private createMipmapPipeline(): void {
		const mipmapShader = /* wgsl */ `
            @group(0) @binding(0) var srcTexture: texture_2d<f32>;
            @group(0) @binding(1) var dstTexture: texture_storage_2d<rgba8unorm, write>;

            @compute @workgroup_size(8, 8)
            fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
                let dstSize = textureDimensions(dstTexture);
                if (globalId.x >= dstSize.x || globalId.y >= dstSize.y) {
                    return;
                }

                let srcCoord = globalId.xy * 2u;

                let s00 = textureLoad(srcTexture, srcCoord + vec2<u32>(0u, 0u), 0);
                let s10 = textureLoad(srcTexture, srcCoord + vec2<u32>(1u, 0u), 0);
                let s01 = textureLoad(srcTexture, srcCoord + vec2<u32>(0u, 1u), 0);
                let s11 = textureLoad(srcTexture, srcCoord + vec2<u32>(1u, 1u), 0);

                let avg = (s00 + s10 + s01 + s11) * 0.25;
                textureStore(dstTexture, globalId.xy, avg);
            }
        `;

		const shaderModule = this.device.createShaderModule({
			label: "Mipmap Generation Shader",
			code: mipmapShader,
		});

		this.mipmapBindGroupLayout = this.device.createBindGroupLayout({
			label: "Mipmap Bind Group Layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					texture: { sampleType: "float" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					storageTexture: { access: "write-only", format: "rgba8unorm" },
				},
			],
		});

		this.mipmapPipeline = this.device.createComputePipeline({
			label: "Mipmap Generation Pipeline",
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [this.mipmapBindGroupLayout],
			}),
			compute: {
				module: shaderModule,
				entryPoint: "main",
			},
		});
	}

	uploadTexture(texture: Texture): GPUTextureView {
		if (!texture.source) {
			return this.dummyWhiteTexture;
		}

		if (!texture.needsUpdate && texture.gpuTextureView) {
			return texture.gpuTextureView;
		}

		const source = texture.source;
		const width = source.width;
		const height = source.height;
		const mipLevelCount = texture.mipmaps
			? Math.floor(Math.log2(Math.max(width, height))) + 1
			: 1;

		// Destroy old texture if exists
		if (texture.gpuTexture) {
			texture.gpuTexture.destroy();
		}

		texture.gpuTexture = this.device.createTexture({
			label: `Texture ${texture.id}`,
			size: [width, height],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.STORAGE_BINDING,
			mipLevelCount,
		});

		this.device.queue.copyExternalImageToTexture(
			{ source: source },
			{ texture: texture.gpuTexture },
			[width, height],
		);

		// Generate mipmaps if needed
		if (texture.mipmaps && mipLevelCount > 1) {
			this.generateMipmaps(texture.gpuTexture, width, height, mipLevelCount);
		}

		texture.gpuTextureView = texture.gpuTexture.createView();
		texture.needsUpdate = false;

		return texture.gpuTextureView;
	}

	private generateMipmaps(
		texture: GPUTexture,
		width: number,
		height: number,
		mipLevelCount: number,
	): void {
		if (!this.mipmapPipeline || !this.mipmapBindGroupLayout) return;

		const commandEncoder = this.device.createCommandEncoder({
			label: "Mipmap Generation",
		});

		let srcWidth = width;
		let srcHeight = height;

		for (let level = 1; level < mipLevelCount; level++) {
			const dstWidth = Math.max(1, srcWidth >> 1);
			const dstHeight = Math.max(1, srcHeight >> 1);

			const srcView = texture.createView({
				baseMipLevel: level - 1,
				mipLevelCount: 1,
			});

			const dstView = texture.createView({
				baseMipLevel: level,
				mipLevelCount: 1,
			});

			const bindGroup = this.device.createBindGroup({
				layout: this.mipmapBindGroupLayout,
				entries: [
					{ binding: 0, resource: srcView },
					{ binding: 1, resource: dstView },
				],
			});

			const computePass = commandEncoder.beginComputePass();
			computePass.setPipeline(this.mipmapPipeline);
			computePass.setBindGroup(0, bindGroup);
			computePass.dispatchWorkgroups(
				Math.ceil(dstWidth / 8),
				Math.ceil(dstHeight / 8),
			);
			computePass.end();

			srcWidth = dstWidth;
			srcHeight = dstHeight;
		}

		this.device.queue.submit([commandEncoder.finish()]);
	}

	getSampler(texture: Texture): GPUSampler {
		const key = `${texture.wrapS}_${texture.wrapT}_${texture.minFilter}_${texture.magFilter}_${texture.mipmaps}`;

		let sampler = this.samplerCache.get(key);
		if (!sampler) {
			sampler = this.device.createSampler({
				addressModeU: texture.wrapS,
				addressModeV: texture.wrapT,
				minFilter: texture.minFilter,
				magFilter: texture.magFilter,
				mipmapFilter: texture.mipmaps ? "linear" : "nearest",
			});
			this.samplerCache.set(key, sampler);
		}

		return sampler;
	}

	dispose(): void {
		this.samplerCache.clear();
	}
}
