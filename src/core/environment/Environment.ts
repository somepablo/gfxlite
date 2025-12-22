let environmentID = 0;

export interface EnvironmentOptions {
    resolution?: number;
    specularMipLevels?: number;
    intensity?: number;
}

export class Environment {
    public readonly id = environmentID++;
    public needsUpdate: boolean = true;

    // Source HDR data (equirectangular)
    public hdrData: Float32Array | null = null;
    public hdrWidth: number = 0;
    public hdrHeight: number = 0;

    // Configuration
    public resolution: number;
    public specularMipLevels: number;
    public intensity: number;

    // GPU resources (managed by EnvironmentManager)
    public equirectTexture: GPUTexture | null = null;
    public cubemap: GPUTexture | null = null;
    public cubemapView: GPUTextureView | null = null;
    public irradianceMap: GPUTexture | null = null;
    public irradianceMapView: GPUTextureView | null = null;
    public prefilteredMap: GPUTexture | null = null;
    public prefilteredMapView: GPUTextureView | null = null;

    constructor(options: EnvironmentOptions = {}) {
        this.resolution = options.resolution ?? 512;
        this.specularMipLevels = options.specularMipLevels ?? 5;
        this.intensity = options.intensity ?? 1.0;
    }

    static async loadHDR(
        url: string,
        options?: EnvironmentOptions
    ): Promise<Environment> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load HDR: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const { data, width, height } = parseRGBE(new Uint8Array(buffer));

        const env = new Environment(options);
        env.hdrData = data;
        env.hdrWidth = width;
        env.hdrHeight = height;
        env.needsUpdate = true;

        return env;
    }

    dispose(): void {
        this.equirectTexture?.destroy();
        this.cubemap?.destroy();
        this.irradianceMap?.destroy();
        this.prefilteredMap?.destroy();

        this.equirectTexture = null;
        this.cubemap = null;
        this.cubemapView = null;
        this.irradianceMap = null;
        this.irradianceMapView = null;
        this.prefilteredMap = null;
        this.prefilteredMapView = null;
        this.hdrData = null;
    }
}

// RGBE (Radiance HDR) parser
function parseRGBE(
    data: Uint8Array
): { data: Float32Array; width: number; height: number } {
    let pos = 0;

    // Read line helper
    const readLine = (): string => {
        let line = "";
        while (pos < data.length && data[pos] !== 0x0a) {
            line += String.fromCharCode(data[pos]);
            pos++;
        }
        pos++; // Skip newline
        return line;
    };

    // Parse header
    const magic = readLine();
    if (!magic.startsWith("#?RADIANCE") && !magic.startsWith("#?RGBE")) {
        throw new Error("Invalid HDR file: missing magic number");
    }

    // Skip header lines until empty line
    let format = "";
    let line: string;
    while ((line = readLine()) !== "") {
        if (line.startsWith("FORMAT=")) {
            format = line.substring(7);
        }
    }

    if (format !== "32-bit_rle_rgbe") {
        // Some HDR files don't specify format, continue anyway
    }

    // Parse resolution
    const resLine = readLine();
    const match = resLine.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
    if (!match) {
        throw new Error("Invalid HDR file: cannot parse resolution");
    }
    const height = parseInt(match[1], 10);
    const width = parseInt(match[2], 10);

    // Parse pixel data
    const rgbeData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        // Check for RLE encoding
        if (data[pos] === 2 && data[pos + 1] === 2) {
            // New RLE format
            const scanlineWidth = (data[pos + 2] << 8) | data[pos + 3];
            if (scanlineWidth !== width) {
                throw new Error("Invalid HDR scanline width");
            }
            pos += 4;

            const scanline = new Uint8Array(width * 4);

            // Read each channel separately
            for (let ch = 0; ch < 4; ch++) {
                let x = 0;
                while (x < width) {
                    const count = data[pos++];
                    if (count > 128) {
                        // Run
                        const runLength = count - 128;
                        const value = data[pos++];
                        for (let i = 0; i < runLength; i++) {
                            scanline[x * 4 + ch] = value;
                            x++;
                        }
                    } else {
                        // Literal
                        for (let i = 0; i < count; i++) {
                            scanline[x * 4 + ch] = data[pos++];
                            x++;
                        }
                    }
                }
            }

            // Copy scanline to output
            rgbeData.set(scanline, y * width * 4);
        } else {
            // Uncompressed
            for (let x = 0; x < width; x++) {
                rgbeData[(y * width + x) * 4 + 0] = data[pos++];
                rgbeData[(y * width + x) * 4 + 1] = data[pos++];
                rgbeData[(y * width + x) * 4 + 2] = data[pos++];
                rgbeData[(y * width + x) * 4 + 3] = data[pos++];
            }
        }
    }

    // Convert RGBE to float RGB
    const floatData = new Float32Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const r = rgbeData[i * 4 + 0];
        const g = rgbeData[i * 4 + 1];
        const b = rgbeData[i * 4 + 2];
        const e = rgbeData[i * 4 + 3];

        if (e === 0) {
            floatData[i * 4 + 0] = 0;
            floatData[i * 4 + 1] = 0;
            floatData[i * 4 + 2] = 0;
        } else {
            const scale = Math.pow(2, e - 128 - 8);
            floatData[i * 4 + 0] = r * scale;
            floatData[i * 4 + 1] = g * scale;
            floatData[i * 4 + 2] = b * scale;
        }
        floatData[i * 4 + 3] = 1.0;
    }

    return { data: floatData, width, height };
}
