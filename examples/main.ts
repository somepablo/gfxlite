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
    PhongMaterial,
    DirectionalLight,
    ShadowType,
    LambertMaterial,
} from "../src";
import { Vector3, Euler } from "../src/math";

const canvas = document.getElementById("gfx-canvas") as HTMLCanvasElement;

const renderer = new Renderer(canvas, { antialias: true, shadowType: ShadowType.PCFSoft });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.resize();
renderer.debug = true;

const scene = new Scene();

// Set Ambient Light
scene.ambientLight = new Vector3(0.2, 0.2, 0.2);

// Add Directional Light
// Add Directional Light 1
const light = new DirectionalLight(new Vector3(1, 1, 1), 1.0);
light.position.set(5, 10, 5);
light.castShadow = true;
light.lookAt(new Vector3(0, 0, 0));
scene.add(light);

// Add Directional Light 2
const light2 = new DirectionalLight(new Vector3(1, 1, 1), 0.8);
light2.position.set(-5, 10, -5);
light2.castShadow = true;
light2.lookAt(new Vector3(0, 0, 0));
scene.add(light2);

// Create eight different materials
const orangeMaterial = new LambertMaterial({ color: new Vector3(1.0, 0.5, 0.2) });
const purpleMaterial = new BasicMaterial({ color: new Vector3(0.6, 0.2, 0.9) });
// Use PhongMaterial for the sphere
const greenMaterial = new PhongMaterial({ 
    color: new Vector3(0.2, 0.9, 0.4),
    specular: new Vector3(1, 1, 1),
    shininess: 30
});
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
box.castShadow = true;
box.receiveShadow = true;
scene.add(box);

// Box (larger)
const smallBoxGeometry = new BoxGeometry({
    width: 2,
    height: 2,
    depth: 2,
});
const smallBox = new Mesh(smallBoxGeometry, purpleMaterial);
smallBox.position.x = 2;
smallBox.castShadow = true;
smallBox.receiveShadow = true;
scene.add(smallBox);

// Sphere
const sphereGeometry = new SphereGeometry({
    radius: 1.5,
    widthSegments: 32,
    heightSegments: 16,
});
const sphere = new Mesh(sphereGeometry, greenMaterial);
sphere.position.set(-5, 0, 0);
sphere.castShadow = true;
sphere.receiveShadow = true;
scene.add(sphere);

// Plane
const planeGeometry = new PlaneGeometry({
    width: 20,
    height: 20,
    widthSegments: 1,
    heightSegments: 1,
});
const planeMaterial = new PhongMaterial({ 
    color: new Vector3(0.5, 0.5, 0.5),
    specular: new Vector3(0.1, 0.1, 0.1),
    shininess: 10
});
const plane = new Mesh(planeGeometry, planeMaterial);
plane.position.set(0, -2, 0);
plane.receiveShadow = true;
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
cylinder.castShadow = true;
cylinder.receiveShadow = true;
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
torus.castShadow = true;
torus.receiveShadow = true;
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

const lightFolder = gui.addFolder("Light");
lightFolder.add(light.position, "x", -10, 10).name("Light X");
lightFolder.add(light.position, "y", -10, 10).name("Light Y");
lightFolder.add(light.position, "z", -10, 10).name("Light Z");
lightFolder.add(light, "intensity", 0, 2).name("Intensity");
lightFolder.add(light.shadow, "bias", 0, 0.01).name("Shadow Bias");
lightFolder.open();

const light2Folder = gui.addFolder("Light 2");
light2Folder.add(light2.position, "x", -10, 10).name("Light X");
light2Folder.add(light2.position, "y", -10, 10).name("Light Y");
light2Folder.add(light2.position, "z", -10, 10).name("Light Z");
light2Folder.add(light2, "intensity", 0, 2).name("Intensity");
light2Folder.add(light2.shadow, "bias", 0, 0.01).name("Shadow Bias");
light2Folder.open();

const ambientFolder = gui.addFolder("Ambient Light");
const ambientConfig = { intensity: 0.2 };
ambientFolder.add(ambientConfig, "intensity", 0, 1).name("Intensity").onChange((v: number) => {
    scene.ambientLight.set(v, v, v);
});
ambientFolder.open();

const shadowFolder = gui.addFolder("Shadow Properties");
shadowFolder.add(renderer, "shadowsEnabled").name("Enable Shadows");
shadowFolder.add(light, "castShadow").name("Cast Shadow");
shadowFolder.add(renderer, "shadowType", { Basic: ShadowType.Basic, PCF: ShadowType.PCF, PCFSoft: ShadowType.PCFSoft }).name("Shadow Type");
shadowFolder.add(box, "castShadow").name("Box Cast Shadow");
shadowFolder.add(box, "receiveShadow").name("Box Receive Shadow");
shadowFolder.add(plane, "receiveShadow").name("Plane Receive Shadow");
shadowFolder.open();

window.addEventListener("resize", () => {
    renderer.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

function frame() {
    stats.begin();
    
    // Update light direction based on position (looking at 0,0,0)
    light.lookAt(new Vector3(0, 0, 0));
    light2.lookAt(new Vector3(0, 0, 0));
    
    // Animate box
    box.rotation.setFromEuler(new Euler(0, performance.now() / 1000, 0));
    box.updateLocalMatrix();
    
    renderer.render(scene, camera);
    
    panelCalls.update(renderer.debugInfo.render.calls, 100);
    panelTris.update(renderer.debugInfo.render.triangles, 1000);
    
    stats.end();
    
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
