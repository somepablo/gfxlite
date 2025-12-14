let materialID = 0;

export const BlendMode = {
    Opaque: 0,
    AlphaBlend: 1,
    AlphaCutoff: 2,
} as const;

export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

export abstract class Material {
    public readonly id = materialID++;
    public needsUpdate: boolean = true;
    public uniforms: { [key: string]: unknown } = {};

    public transparent: boolean = false;
    public blendMode: BlendMode = BlendMode.Opaque;
    public alphaCutoff: number = 0.5;
    public depthWrite: boolean = true;
    public doubleSided: boolean = false;

    abstract getUniformBufferData(): Float32Array;
    abstract getVertexShader(): string;
    abstract getFragmentShader(): string;

    hasTextures(): boolean {
        return false;
    }
}
