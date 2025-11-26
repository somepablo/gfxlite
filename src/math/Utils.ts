export function clamp(a: number, b: number, c: number) {
    return Math.max(b, Math.min(c, a));
}

export function degToRad(a: number) {
    return a * 0.01745329252;
}

export function radToDeg(a: number) {
    return a * 57.2957795131;
}
