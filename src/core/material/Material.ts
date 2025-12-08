let materialID = 0;

export abstract class Material {
    public readonly id = materialID++;
    public needsUpdate: boolean = true;
    public uniforms: { [key: string]: unknown } = {};

    abstract getUniformBufferData(): Float32Array;
    abstract getVertexShader(): string;
    abstract getFragmentShader(): string;
}
