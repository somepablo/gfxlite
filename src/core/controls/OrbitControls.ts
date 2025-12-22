import { Vector3 } from "../../math";
import type { Camera } from "../camera/Camera";

export interface OrbitControlsOptions {
    /** Enable/disable controls */
    enabled?: boolean;
    /** Target point to orbit around */
    target?: Vector3;
    /** Minimum distance from target */
    minDistance?: number;
    /** Maximum distance from target */
    maxDistance?: number;
    /** Minimum polar angle (radians, 0 = top) */
    minPolarAngle?: number;
    /** Maximum polar angle (radians, PI = bottom) */
    maxPolarAngle?: number;
    /** Enable damping (inertia) */
    enableDamping?: boolean;
    /** Damping factor (0-1, lower = more damping) */
    dampingFactor?: number;
    /** Rotation speed multiplier */
    rotateSpeed?: number;
    /** Pan speed multiplier */
    panSpeed?: number;
    /** Zoom speed multiplier */
    zoomSpeed?: number;
    /** Enable panning */
    enablePan?: boolean;
    /** Enable zooming */
    enableZoom?: boolean;
}

export class OrbitControls {
    public enabled: boolean = true;
    public target: Vector3;
    public minDistance: number = 0.1;
    public maxDistance: number = Infinity;
    public minPolarAngle: number = 0;
    public maxPolarAngle: number = Math.PI;
    public enableDamping: boolean = true;
    public dampingFactor: number = 0.05;
    public rotateSpeed: number = 1.0;
    public panSpeed: number = 1.0;
    public zoomSpeed: number = 1.0;
    public enablePan: boolean = true;
    public enableZoom: boolean = true;

    private camera: Camera;
    private domElement: HTMLElement;

    // Spherical coordinates
    private spherical = { radius: 1, phi: Math.PI / 2, theta: 0 };
    private sphericalDelta = { phi: 0, theta: 0 };

    // Pan offset
    private panOffset = new Vector3();

    // Zoom scale
    private scale: number = 1;

    // Mouse state
    private isPointerDown: boolean = false;
    private pointerStart = { x: 0, y: 0 };
    private pointerType: "rotate" | "pan" = "rotate";

    // Touch state for pinch zoom
    private touches: { id: number; x: number; y: number }[] = [];
    private lastPinchDistance: number = 0;

    // Bound event handlers
    private onPointerDownBound: (e: PointerEvent) => void;
    private onPointerMoveBound: (e: PointerEvent) => void;
    private onPointerUpBound: (e: PointerEvent) => void;
    private onWheelBound: (e: WheelEvent) => void;
    private onContextMenuBound: (e: Event) => void;

    constructor(camera: Camera, domElement: HTMLElement, options: OrbitControlsOptions = {}) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = options.target ?? new Vector3(0, 0, 0);

        // Apply options
        if (options.enabled !== undefined) this.enabled = options.enabled;
        if (options.minDistance !== undefined) this.minDistance = options.minDistance;
        if (options.maxDistance !== undefined) this.maxDistance = options.maxDistance;
        if (options.minPolarAngle !== undefined) this.minPolarAngle = options.minPolarAngle;
        if (options.maxPolarAngle !== undefined) this.maxPolarAngle = options.maxPolarAngle;
        if (options.enableDamping !== undefined) this.enableDamping = options.enableDamping;
        if (options.dampingFactor !== undefined) this.dampingFactor = options.dampingFactor;
        if (options.rotateSpeed !== undefined) this.rotateSpeed = options.rotateSpeed;
        if (options.panSpeed !== undefined) this.panSpeed = options.panSpeed;
        if (options.zoomSpeed !== undefined) this.zoomSpeed = options.zoomSpeed;
        if (options.enablePan !== undefined) this.enablePan = options.enablePan;
        if (options.enableZoom !== undefined) this.enableZoom = options.enableZoom;

        // Initialize spherical from current camera position
        this.updateSphericalFromCamera();

        // Bind event handlers
        this.onPointerDownBound = this.onPointerDown.bind(this);
        this.onPointerMoveBound = this.onPointerMove.bind(this);
        this.onPointerUpBound = this.onPointerUp.bind(this);
        this.onWheelBound = this.onWheel.bind(this);
        this.onContextMenuBound = (e: Event) => e.preventDefault();

        // Add event listeners
        this.domElement.addEventListener("pointerdown", this.onPointerDownBound);
        this.domElement.addEventListener("pointermove", this.onPointerMoveBound);
        this.domElement.addEventListener("pointerup", this.onPointerUpBound);
        this.domElement.addEventListener("pointercancel", this.onPointerUpBound);
        this.domElement.addEventListener("wheel", this.onWheelBound, { passive: false });
        this.domElement.addEventListener("contextmenu", this.onContextMenuBound);
    }

    private updateSphericalFromCamera(): void {
        const offset = new Vector3().subVectors(this.camera.position, this.target);
        this.spherical.radius = offset.length();
        if (this.spherical.radius === 0) {
            this.spherical.radius = 1;
        }
        this.spherical.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / this.spherical.radius)));
        this.spherical.theta = Math.atan2(offset.x, offset.z);
    }

    private onPointerDown(event: PointerEvent): void {
        if (!this.enabled) return;

        this.domElement.setPointerCapture(event.pointerId);
        this.isPointerDown = true;
        this.pointerStart.x = event.clientX;
        this.pointerStart.y = event.clientY;

        // Right-click or shift+click for pan
        if (event.button === 2 || event.shiftKey) {
            this.pointerType = "pan";
        } else {
            this.pointerType = "rotate";
        }

        // Track touches for pinch
        this.touches.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
    }

    private onPointerMove(event: PointerEvent): void {
        if (!this.enabled || !this.isPointerDown) return;

        // Update touch position
        const touchIndex = this.touches.findIndex(t => t.id === event.pointerId);
        if (touchIndex >= 0) {
            this.touches[touchIndex].x = event.clientX;
            this.touches[touchIndex].y = event.clientY;
        }

        // Handle pinch zoom (two fingers)
        if (this.touches.length === 2 && this.enableZoom) {
            const dx = this.touches[0].x - this.touches[1].x;
            const dy = this.touches[0].y - this.touches[1].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (this.lastPinchDistance > 0) {
                const delta = distance / this.lastPinchDistance;
                this.scale *= delta;
            }
            this.lastPinchDistance = distance;
            return;
        }

        const deltaX = event.clientX - this.pointerStart.x;
        const deltaY = event.clientY - this.pointerStart.y;

        if (this.pointerType === "rotate") {
            // Rotate
            const rotateScale = 2 * Math.PI / this.domElement.clientHeight * this.rotateSpeed;
            this.sphericalDelta.theta -= deltaX * rotateScale;
            this.sphericalDelta.phi -= deltaY * rotateScale;
        } else if (this.pointerType === "pan" && this.enablePan) {
            // Pan
            this.pan(deltaX, deltaY);
        }

        this.pointerStart.x = event.clientX;
        this.pointerStart.y = event.clientY;
    }

    private onPointerUp(event: PointerEvent): void {
        this.domElement.releasePointerCapture(event.pointerId);

        // Remove from touches
        const touchIndex = this.touches.findIndex(t => t.id === event.pointerId);
        if (touchIndex >= 0) {
            this.touches.splice(touchIndex, 1);
        }

        if (this.touches.length === 0) {
            this.isPointerDown = false;
            this.lastPinchDistance = 0;
        }
    }

    private onWheel(event: WheelEvent): void {
        if (!this.enabled || !this.enableZoom) return;

        event.preventDefault();

        if (event.deltaY < 0) {
            this.scale /= Math.pow(0.95, this.zoomSpeed);
        } else if (event.deltaY > 0) {
            this.scale *= Math.pow(0.95, this.zoomSpeed);
        }
    }

    private pan(deltaX: number, deltaY: number): void {
        const offset = new Vector3().subVectors(this.camera.position, this.target);
        const targetDistance = offset.length();

        // Calculate pan factor based on FOV and distance
        const panFactor = targetDistance * this.panSpeed * 0.001;

        // Get camera right and up vectors from world matrix
        const m = this.camera.worldMatrix.elements;
        const right = new Vector3(m[0], m[1], m[2]).normalize();
        const up = new Vector3(m[4], m[5], m[6]).normalize();

        // Pan in camera space
        this.panOffset.add(right.multiplyScalar(-deltaX * panFactor));
        this.panOffset.add(up.multiplyScalar(deltaY * panFactor));
    }

    /**
     * Update camera position. Call this every frame.
     */
    update(): void {
        if (!this.enabled) return;

        // Apply rotation deltas
        if (this.enableDamping) {
            this.spherical.theta += this.sphericalDelta.theta * this.dampingFactor;
            this.spherical.phi += this.sphericalDelta.phi * this.dampingFactor;
        } else {
            this.spherical.theta += this.sphericalDelta.theta;
            this.spherical.phi += this.sphericalDelta.phi;
        }

        // Clamp phi (polar angle)
        this.spherical.phi = Math.max(
            this.minPolarAngle,
            Math.min(this.maxPolarAngle, this.spherical.phi)
        );

        // Prevent phi from being exactly 0 or PI to avoid gimbal issues
        this.spherical.phi = Math.max(0.0001, Math.min(Math.PI - 0.0001, this.spherical.phi));

        // Apply zoom scale
        this.spherical.radius *= this.scale;
        this.spherical.radius = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, this.spherical.radius)
        );

        // Apply pan offset to target
        this.target.add(this.panOffset);

        // Convert spherical to cartesian
        const sinPhiRadius = Math.sin(this.spherical.phi) * this.spherical.radius;
        const offset = new Vector3(
            sinPhiRadius * Math.sin(this.spherical.theta),
            Math.cos(this.spherical.phi) * this.spherical.radius,
            sinPhiRadius * Math.cos(this.spherical.theta)
        );

        // Update camera position
        this.camera.position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);

        // Apply damping decay
        if (this.enableDamping) {
            this.sphericalDelta.theta *= (1 - this.dampingFactor);
            this.sphericalDelta.phi *= (1 - this.dampingFactor);
        } else {
            this.sphericalDelta.theta = 0;
            this.sphericalDelta.phi = 0;
        }

        // Reset scale and pan
        this.scale = 1;
        this.panOffset.set(0, 0, 0);
    }

    /**
     * Set the target point to orbit around.
     */
    setTarget(x: number, y: number, z: number): void {
        this.target.set(x, y, z);
        this.updateSphericalFromCamera();
    }

    /**
     * Reset the camera to look at target from current position.
     */
    reset(): void {
        this.updateSphericalFromCamera();
        this.sphericalDelta.theta = 0;
        this.sphericalDelta.phi = 0;
        this.scale = 1;
        this.panOffset.set(0, 0, 0);
    }

    /**
     * Remove event listeners and clean up.
     */
    dispose(): void {
        this.domElement.removeEventListener("pointerdown", this.onPointerDownBound);
        this.domElement.removeEventListener("pointermove", this.onPointerMoveBound);
        this.domElement.removeEventListener("pointerup", this.onPointerUpBound);
        this.domElement.removeEventListener("pointercancel", this.onPointerUpBound);
        this.domElement.removeEventListener("wheel", this.onWheelBound);
        this.domElement.removeEventListener("contextmenu", this.onContextMenuBound);
    }
}
