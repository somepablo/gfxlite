import Stats from "stats.js";
import GUI from "lil-gui";
import {
    BasicMaterial,
    BoxGeometry,
    CircleGeometry,
    ConeGeometry,
    CylinderGeometry,
    Mesh,
    PerspectiveCamera,
    PlaneGeometry,
    Renderer,
    Scene,
    SphereGeometry,
    TorusGeometry,
} from "../src";
import { Vector3 } from "../src/math";

const canvas = document.getElementById("gfx-canvas") as HTMLCanvasElement;

const renderer = new Renderer(canvas);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.resize();
renderer.debug = true;

const scene = new Scene();

// Create eight different materials
const orangeMaterial = new BasicMaterial({ color: new Vector3(1.0, 0.5, 0.2) });
const purpleMaterial = new BasicMaterial({ color: new Vector3(0.6, 0.2, 0.9) });
const greenMaterial = new BasicMaterial({ color: new Vector3(0.2, 0.9, 0.4) });
const blueMaterial = new BasicMaterial({ color: new Vector3(0.2, 0.4, 0.9) });
const yellowMaterial = new BasicMaterial({ color: new Vector3(0.9, 0.9, 0.2) });
const redMaterial = new BasicMaterial({ color: new Vector3(0.9, 0.2, 0.2) });
const cyanMaterial = new BasicMaterial({ color: new Vector3(0.2, 0.9, 0.9) });
const magentaMaterial = new BasicMaterial({ color: new Vector3(0.9, 0.2, 0.9) });

// Box
const boxGeometry = new BoxGeometry({
    width: 1,
    height: 1,
    depth: 1,
});
const box = new Mesh(boxGeometry, orangeMaterial);
scene.add(box);

// Box (larger)
const smallBoxGeometry = new BoxGeometry({
    width: 2,
    height: 2,
    depth: 2,
});
const smallBox = new Mesh(smallBoxGeometry, purpleMaterial);
smallBox.position.x = 2;
scene.add(smallBox);

// Sphere
const sphereGeometry = new SphereGeometry({
    radius: 1.5,
    widthSegments: 32,
    heightSegments: 16,
});
const sphere = new Mesh(sphereGeometry, greenMaterial);
sphere.position.set(-5, 0, 0);
scene.add(sphere);

// Plane
const planeGeometry = new PlaneGeometry({
    width: 3,
    height: 3,
    widthSegments: 1,
    heightSegments: 1,
});
const plane = new Mesh(planeGeometry, blueMaterial);
plane.position.set(0, -2, 0);
scene.add(plane);

// Cylinder
const cylinderGeometry = new CylinderGeometry({
    radiusTop: 0.8,
    radiusBottom: 0.8,
    height: 2,
    radialSegments: 32,
});
const cylinder = new Mesh(cylinderGeometry, yellowMaterial);
cylinder.position.set(5, 0, 0);
scene.add(cylinder);

// Torus
const torusGeometry = new TorusGeometry({
    radius: 1.2,
    tube: 0.4,
    radialSegments: 16,
    tubularSegments: 32,
});
const torus = new Mesh(torusGeometry, redMaterial);
torus.position.set(-2.5, 2, -3);
scene.add(torus);

// Circle
const circleGeometry = new CircleGeometry({
    radius: 1,
    segments: 32,
});
const circle = new Mesh(circleGeometry, cyanMaterial);
circle.position.set(7, -1, 0);
scene.add(circle);

// Cone
const coneGeometry = new ConeGeometry({
    radius: 1,
    height: 2,
    radialSegments: 32,
});
const cone = new Mesh(coneGeometry, magentaMaterial);
cone.position.set(-7, 0, 0);
scene.add(cone);

const camera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
);
camera.position.set(0, 3, 10);
camera.lookAt(new Vector3(0, 0, 0));

// --- Instrumentation ---
const stats = new Stats();
const panelCalls = stats.addPanel(new Stats.Panel("Calls", "#ff8", "#221"));
const panelTris = stats.addPanel(new Stats.Panel("Tris", "#f8f", "#212"));
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
const cameraFolder = gui.addFolder("Camera");
cameraFolder.add(camera.position, "x", -20, 20);
cameraFolder.add(camera.position, "y", -20, 20);
cameraFolder.add(camera.position, "z", -20, 20);
cameraFolder.open();

window.addEventListener("resize", () => {
    renderer.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

function frame() {
    stats.begin();
    renderer.render(scene, camera);
    
    panelCalls.update(renderer.info.render.calls, 100); // Max value 100? Adjust as needed
    panelTris.update(renderer.info.render.triangles, 1000); // Max value 1000? Adjust as needed
    
    stats.end();
    
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
