let textureID = 0;

export interface TextureOptions {
    wrapS?: GPUAddressMode;
    wrapT?: GPUAddressMode;
    minFilter?: GPUFilterMode;
    magFilter?: GPUFilterMode;
    mipmaps?: boolean;
    flipY?: boolean;
}

export class Texture {
    public readonly id = textureID++;
    public source: ImageBitmap | null = null;
    public needsUpdate: boolean = true;

    public wrapS: GPUAddressMode = "repeat";
    public wrapT: GPUAddressMode = "repeat";
    public minFilter: GPUFilterMode = "linear";
    public magFilter: GPUFilterMode = "linear";
    public mipmaps: boolean = true;
    public flipY: boolean = true;

    // GPU resources (managed by TextureManager)
    public gpuTexture: GPUTexture | null = null;
    public gpuTextureView: GPUTextureView | null = null;

    constructor(source?: ImageBitmap, options?: TextureOptions) {
        if (source) this.source = source;
        if (options) {
            if (options.wrapS !== undefined) this.wrapS = options.wrapS;
            if (options.wrapT !== undefined) this.wrapT = options.wrapT;
            if (options.minFilter !== undefined) this.minFilter = options.minFilter;
            if (options.magFilter !== undefined) this.magFilter = options.magFilter;
            if (options.mipmaps !== undefined) this.mipmaps = options.mipmaps;
            if (options.flipY !== undefined) this.flipY = options.flipY;
        }
    }

    static async load(url: string, options?: TextureOptions): Promise<Texture> {
        const response = await fetch(url);
        const blob = await response.blob();
        const flipY = options?.flipY !== false;
        const imageBitmap = await createImageBitmap(blob, {
            imageOrientation: flipY ? "flipY" : "none",
        });
        return new Texture(imageBitmap, options);
    }

    dispose(): void {
        if (this.gpuTexture) {
            this.gpuTexture.destroy();
            this.gpuTexture = null;
            this.gpuTextureView = null;
        }
    }
}
