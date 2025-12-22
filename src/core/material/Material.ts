let materialID = 0;

export const BlendMode = {
    Opaque: 0,
    AlphaBlend: 1,
    AlphaCutoff: 2,
} as const;

export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

export const MaterialType = {
    Basic: 0,
    Lambert: 1,
    Phong: 2,
    Standard: 3,
} as const;

export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType];

export abstract class Material {
    public readonly id = materialID++;
    public needsUpdate: boolean = true;
    public uniforms: { [key: string]: unknown } = {};

    public transparent: boolean = false;
    public opacity: number = 1.0;
    public blendMode: BlendMode = BlendMode.Opaque;
    public alphaCutoff: number = 0.5;
    public depthWrite: boolean = true;
    public doubleSided: boolean = false;

    public abstract readonly materialType: MaterialType;
    public abstract readonly needsLighting: boolean;
    public abstract readonly needsNormals: boolean;

    abstract getUniformBufferData(): Float32Array;
    abstract getVertexShader(): string;
    abstract getFragmentShader(): string;

    hasTextures(): boolean {
        return false;
    }

    getPipelineKey(): string {
        return `${this.materialType}_${this.transparent ? 1 : 0}_${this.hasTextures() ? 1 : 0}_${this.doubleSided ? 1 : 0}`;
    }
}
